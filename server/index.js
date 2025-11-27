const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static'); 
const axios = require('axios');
const https = require('https'); 
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- CONFIGURATION ---
const TEMP_DIR = path.join(__dirname, 'temp');
const YT_DLP_BINARY_PATH = path.join(__dirname, 'yt-dlp' + (process.platform === 'win32' ? '.exe' : ''));

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Initialize yt-dlp wrapper
const ytDlpWrap = new YTDlpWrap(YT_DLP_BINARY_PATH);

// --- HELPERS ---
const ensureBinary = async () => {
    if (!fs.existsSync(YT_DLP_BINARY_PATH)) {
        console.log('Downloading yt-dlp binary... This may take a minute.');
        try {
            await YTDlpWrap.downloadFromGithub(YT_DLP_BINARY_PATH);
            console.log('yt-dlp binary downloaded successfully.');
            if (process.platform !== 'win32') {
                fs.chmodSync(YT_DLP_BINARY_PATH, '755');
            }
        } catch (err) {
            console.error('Failed to download yt-dlp:', err);
        }
    }
};

ensureBinary();

// --- AXIOS CLIENT CONFIGURATION ---
const createAxiosClient = () => {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    
    const config = {
        timeout: 60000, // 60s timeout
        headers: { 'Cache-Control': 'no-cache' }
    };

    if (proxyUrl) {
        console.log(`[Server] System Proxy detected: ${proxyUrl}. Using default Axios proxy handler.`);
    } else {
        console.log(`[Server] No System Proxy detected. Using custom HTTPS Agent (IPv4 forced).`);
        // When NO proxy is set, force IPv4 and disable keepAlive
        config.httpsAgent = new https.Agent({ 
            keepAlive: false, 
            family: 4 
        });
    }

    return axios.create(config);
};

const axiosClient = createAxiosClient();

// Retry Helper
const makeRequestWithRetry = async (config, retries = 3) => {
    try {
        return await axiosClient(config);
    } catch (error) {
        const isNetworkError = !error.response && (
            error.code === 'ECONNRESET' || 
            error.code === 'ETIMEDOUT' || 
            (error.message && error.message.includes('socket disconnected')) ||
            (error.message && error.message.includes('timeout'))
        );
        
        if (isNetworkError && retries > 0) {
            console.log(`[Proxy] Network error (${error.message}). Retrying... (${retries} left)`);
            await new Promise(r => setTimeout(r, 1500)); // Wait 1.5s
            return makeRequestWithRetry(config, retries - 1);
        }
        throw error;
    }
};

// --- GENERAL FILE PROXY ---

// 1. Check File Info (HEAD)
app.get('/api/proxy/file-head', async (req, res) => {
    const { url } = req.query;
    const proxyAuth = req.headers['x-proxy-auth']; 

    if (!url) return res.status(400).json({ error: "Missing URL" });

    try {
        const headers = {};
        if (proxyAuth) headers['Authorization'] = proxyAuth;

        const response = await makeRequestWithRetry({ method: 'head', url, headers });
        res.json({
            contentType: response.headers['content-type'],
            contentLength: response.headers['content-length'],
            ok: true
        });
    } catch (e) {
        try {
            const headers = { Range: 'bytes=0-1' };
            if (proxyAuth) headers['Authorization'] = proxyAuth;

            const response = await makeRequestWithRetry({ method: 'get', url, headers });
            res.json({
                contentType: response.headers['content-type'],
                contentLength: response.headers['content-range'] ? response.headers['content-range'].split('/')[1] : null,
                ok: true
            });
        } catch (innerError) {
            res.status(400).json({ error: "Could not access URL", details: innerError.message });
        }
    }
});

// 2. Download File (GET Stream)
app.get('/api/proxy/file-get', async (req, res) => {
    const { url, token } = req.query;
    let proxyAuth = req.headers['x-proxy-auth'];

    if (!url) return res.status(400).json({ error: "Missing URL" });

    if (!proxyAuth && token) {
        proxyAuth = `Bearer ${token}`;
    }

    try {
        const headers = {};
        if (proxyAuth) headers['Authorization'] = proxyAuth;

        // Use the configured client (with proxy or custom agent)
        const response = await axiosClient({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: headers
        });

        const contentType = response.headers['content-type'];
        const contentLength = response.headers['content-length'];

        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);

        // FIX: Add header to allow embedding in COEP environments (fixes broken images)
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        response.data.pipe(res);

    } catch (e) {
        console.error("Proxy File Get Error:", e.message);
        res.status(500).send("Failed to fetch file via proxy.");
    }
});

// 3. Google Drive API List Proxy
app.get('/api/proxy/drive/list', async (req, res) => {
    const { token, query, fields, orderBy, pageSize } = req.query;

    if (!token) return res.status(401).json({ error: "Missing token" });

    try {
        const response = await makeRequestWithRetry({
            method: 'get',
            url: 'https://www.googleapis.com/drive/v3/files',
            params: { q: query, fields, orderBy, pageSize },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (e) {
        const errorData = e.response ? e.response.data : { error: e.message };
        const status = e.response ? e.response.status : 500;
        
        console.error("Drive List Proxy Error:", JSON.stringify(errorData, null, 2));
        res.status(status).json(errorData);
    }
});


// --- PROXY ENDPOINTS FOR YOUTUBE UPLOAD ---

app.post('/api/proxy/upload-init', async (req, res) => {
    const { token, metadata, fileType, fileSize } = req.body;

    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
        const response = await makeRequestWithRetry({
            method: 'post',
            url: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
            data: metadata,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Length': fileSize,
                'X-Upload-Content-Type': fileType
            }
        });
        res.json({ location: response.headers.location });
    } catch (e) {
        const status = e.response?.status || 500;
        const data = e.response?.data || { error: e.message };
        console.error(`Proxy Upload Init Error (${status}):`, JSON.stringify(data, null, 2));
        res.status(status).json(data);
    }
});

app.get('/api/proxy/captions', async (req, res) => {
    const { token, videoId } = req.query;

    if (!token || !videoId) return res.status(400).json({ error: "Missing params" });

    try {
        const response = await makeRequestWithRetry({
            method: 'get',
            url: 'https://www.googleapis.com/youtube/v3/captions',
            params: { part: 'snippet', videoId },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (e) {
        res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
    }
});

app.get('/api/proxy/download-caption', async (req, res) => {
    const { token, captionId } = req.query;

    if (!token || !captionId) return res.status(400).json({ error: "Missing params" });

    try {
        const response = await makeRequestWithRetry({
            method: 'get',
            url: `https://www.googleapis.com/youtube/v3/captions/${captionId}`,
            params: { tfmt: 'srt' },
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'text'
        });
        res.send(response.data);
    } catch (e) {
        res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
    }
});


// --- EXISTING YT-DLP ENDPOINTS ---

app.get('/api/info', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    await ensureBinary();

    try {
        const metadata = await ytDlpWrap.execPromise([
            url,
            '--dump-json',
            '--no-playlist',
            '--skip-download',
            '--force-ipv4'
        ]);
        
        const info = JSON.parse(metadata);
        const videoUrl = info.webpage_url || url;
        
        let captions = [];
        const seenKeys = new Set();

        const processTracks = (tracksObj, isAuto) => {
            if (!tracksObj) return;
            Object.keys(tracksObj).forEach(lang => {
                const formats = tracksObj[lang];
                const name = (formats[0] && formats[0].name) || lang;
                const uniqueKey = `${lang}-${isAuto ? 'auto' : 'manual'}`;
                
                if (!seenKeys.has(uniqueKey)) {
                    seenKeys.add(uniqueKey);
                    const trackConfig = { lang: lang, isAuto: isAuto };
                    const token = Buffer.from(JSON.stringify(trackConfig)).toString('base64');

                    captions.push({
                        id: token, 
                        language: lang,
                        name: name + (isAuto ? ' (Auto)' : ''),
                        isAutoSynced: isAuto
                    });
                }
            });
        };

        processTracks(info.subtitles, false);
        processTracks(info.automatic_captions, true);

        const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : '');
        const durationSeconds = info.duration || 0;
        
        const date = new Date(durationSeconds * 1000);
        const timeStr = durationSeconds < 3600 ? date.toISOString().substr(14, 5) : date.toISOString().substr(11, 8);

        res.json({
            meta: {
                id: info.id,
                title: info.title,
                description: info.description,
                thumbnailUrl: thumbnail,
                channelTitle: info.uploader,
                duration: timeStr,
                videoUrl: videoUrl
            },
            captions: captions
        });

    } catch (error) {
        console.error("yt-dlp info error:", error.message);
        res.status(500).json({ error: 'Failed to fetch video details. URL might be invalid or restricted.' });
    }
});

app.get('/api/caption', async (req, res) => {
    const rawToken = req.query.token || req.query.trackId;
    const url = req.query.url;

    if (!url || !rawToken) return res.status(400).send("Missing required parameters");

    if (rawToken.startsWith('http')) {
        try {
            const response = await axiosClient.get(rawToken, { responseType: 'text' });
            return res.send(response.data);
        } catch (e) {
            return res.status(500).send("Failed to download legacy caption URL.");
        }
    }

    let isAuto = false;
    let lang = '';

    try {
        const jsonStr = Buffer.from(rawToken, 'base64').toString('utf-8');
        const decoded = JSON.parse(jsonStr);
        isAuto = decoded.isAuto;
        lang = decoded.lang;
    } catch (e) {
        return res.status(400).send("Invalid Caption Token");
    }

    const tempId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outputTemplate = path.join(TEMP_DIR, `${tempId}.%(ext)s`);

    try {
        let args = [
            url,
            '--skip-download',
            '--convert-subs', 'srt',
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath,
            '--force-ipv4'
        ];

        if (isAuto) args.push('--write-auto-sub', '--sub-lang', lang);
        else args.push('--write-sub', '--sub-lang', lang);

        await ytDlpWrap.execPromise(args);

        const files = fs.readdirSync(TEMP_DIR);
        const generatedFile = files.find(f => f.startsWith(tempId) && (f.endsWith('.srt') || f.endsWith('.vtt')));

        if (!generatedFile) throw new Error("Subtitle file not generated.");

        const filePath = path.join(TEMP_DIR, generatedFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        fs.unlinkSync(filePath);

        res.send(content);

    } catch (error) {
        try {
            const files = fs.readdirSync(TEMP_DIR);
            files.filter(f => f.startsWith(tempId)).forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
        } catch (e) {}
        res.status(500).send(`Failed to download captions: ${error.message.split('\n')[0]}`);
    }
});

app.get('/api/download-video', async (req, res) => {
    const { url, token } = req.query;

    if (!url || !token) return res.status(400).send("Missing url or token");

    let isAuto = false;
    let lang = '';
    try {
        const jsonStr = Buffer.from(token, 'base64').toString('utf-8');
        const decoded = JSON.parse(jsonStr);
        isAuto = decoded.isAuto;
        lang = decoded.lang;
    } catch (e) {
        return res.status(400).send("Invalid Token");
    }

    const tempId = `vid_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outputTemplate = path.join(TEMP_DIR, `${tempId}.%(ext)s`);
    
    try {
        let args = [
            url,
            '--format', 'best', 
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath,
            '--embed-subs',
            '--embed-thumbnail',
            '--convert-subs', 'srt',
            '--merge-output-format', 'mp4',
            '--force-ipv4'
        ];

        if (isAuto) args.push('--write-auto-sub', '--sub-lang', lang);
        else args.push('--write-sub', '--sub-lang', lang);

        await ytDlpWrap.execPromise(args);

        const files = fs.readdirSync(TEMP_DIR);
        let videoFile = files.find(f => f.startsWith(tempId) && (f.endsWith('.mp4') || f.endsWith('.mkv')) && !f.endsWith('.part'));

        if (!videoFile) {
            const partFile = files.find(f => f.startsWith(tempId) && f.endsWith('.part'));
            if (partFile) {
                const newName = partFile.replace('.part', '');
                fs.renameSync(path.join(TEMP_DIR, partFile), path.join(TEMP_DIR, newName));
                videoFile = newName;
            }
        }

        if (!videoFile) throw new Error(`Video file not found after download.`);

        const filePath = path.join(TEMP_DIR, videoFile);
        res.download(filePath, (err) => {
            setTimeout(() => {
                try {
                    const leftovers = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(tempId));
                    leftovers.forEach(f => { try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch(e) {} });
                } catch (e) {}
            }, 10000); 
        });

    } catch (error) {
        try {
             const files = fs.readdirSync(TEMP_DIR);
             files.filter(f => f.startsWith(tempId)).forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
        } catch (e) {}
        res.status(500).send(`Video processing failed: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});