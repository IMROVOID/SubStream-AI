const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static'); 
const axios = require('axios');
// Import HttpsProxyAgent to handle v2ray/local proxy tunnels correctly
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

app.use(cors());

// Increase limit to handle large JSON payloads if necessary
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

// --- PROXY CONFIGURATION HELPER ---
const getSystemProxy = () => {
    // 1. Check Environment Variables first
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (envProxy) return envProxy;

    // 2. Fallback: Assume v2rayN default HTTP port (10809) on Windows
    return 'http://127.0.0.1:10809';
};

const PROXY_URL = getSystemProxy();
console.log(`[Server] Network Proxy Configuration: ${PROXY_URL ? PROXY_URL : 'Direct Connection'}`);

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
    const config = {
        timeout: 60000, // Default 60s timeout
        headers: { 
            'Cache-Control': 'no-cache',
            // Spoof User-Agent to look like a browser (helps with Google API checks)
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        maxBodyLength: Infinity, 
        maxContentLength: Infinity
    };

    if (PROXY_URL) {
        try {
            // Use HttpsProxyAgent for robust tunneling
            const agent = new HttpsProxyAgent(PROXY_URL);
            config.httpsAgent = agent;
            
            // IMPORTANT: Disable axios native proxy logic to prevent conflicts
            config.proxy = false; 
            
        } catch (e) {
            console.warn("[Server] Invalid Proxy URL format. Falling back to direct.", e.message);
        }
    } else {
        // Direct connection optimization
        config.proxy = false; 
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
            error.code === 'ERR_BAD_RESPONSE' ||
            (error.message && error.message.includes('socket disconnected')) ||
            (error.message && error.message.includes('timeout'))
        );
        
        if (isNetworkError && retries > 0) {
            console.log(`[Proxy] Network error (${error.message || error.code}). Retrying... (${retries} left)`);
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
            return makeRequestWithRetry(config, retries - 1);
        }
        throw error;
    }
};

// --- GENERAL FILE PROXY ---

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

        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        response.data.pipe(res);

    } catch (e) {
        console.error("Proxy File Get Error:", e.message);
        res.status(500).send("Failed to fetch file via proxy.");
    }
});

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
        console.log("Proxy: Initiating Upload...");
        // Call Google API using the configured Axios client (with Proxy Agent)
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
        
        console.log("Proxy: Upload URL received.");
        res.json({ location: response.headers.location });
    } catch (e) {
        const status = e.response?.status || 500;
        const data = e.response?.data || { error: e.message };
        
        console.error(`Proxy Upload Init Error (${status}):`);
        if (e.code) console.error(`Error Code: ${e.code}`);
        if (data) console.error(JSON.stringify(data, null, 2));
        
        res.status(status).json(data);
    }
});

// NEW: Endpoint to handle the actual binary upload via proxy
app.put('/api/proxy/upload-finish', async (req, res) => {
    const uploadUrl = req.headers['x-upload-url'];
    const contentType = req.headers['content-type'];
    const contentLength = req.headers['content-length'];

    if (!uploadUrl) {
        return res.status(400).json({ error: "Missing 'x-upload-url' header" });
    }

    try {
        console.log("Proxy: Streaming binary upload to Google...");
        
        // Stream the incoming request directly to Google
        // We use req as the data stream. express.json() ignores non-json content types, 
        // so the stream should be intact for video files.
        const response = await axiosClient({
            method: 'put',
            url: uploadUrl,
            data: req, 
            headers: {
                'Content-Type': contentType,
                'Content-Length': contentLength
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 0, // IMPORTANT: Disable timeout for large video uploads
            responseType: 'json' 
        });

        console.log("Proxy: Upload completed successfully.");
        res.json(response.data);

    } catch (e) {
        console.error("Proxy Upload Finish Error:", e.message);
        const status = e.response?.status || 500;
        const data = e.response?.data || { error: e.message };
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


// --- YT-DLP ENDPOINTS ---

const getCommonYtDlpArgs = () => {
    const args = [
        '--no-playlist',
        '--no-check-certificates',
        '--force-ipv4',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--referer', 'https://www.youtube.com/'
    ];

    if (PROXY_URL) {
        args.push('--proxy', PROXY_URL);
    }

    return args;
};

app.get('/api/info', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    await ensureBinary();

    try {
        const args = [
            url,
            '--dump-json',
            '--skip-download',
            ...getCommonYtDlpArgs()
        ];

        const metadata = await ytDlpWrap.execPromise(args);
        
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

        // Extract formats (resolutions)
        const resolutions = new Set();
        if (info.formats) {
            info.formats.forEach(f => {
                if (f.height && f.vcodec !== 'none') {
                    resolutions.add(f.height);
                }
            });
        }
        const sortedResolutions = Array.from(resolutions).sort((a, b) => b - a);

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
            captions: captions,
            resolutions: sortedResolutions
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
            ...getCommonYtDlpArgs()
        ];

        if (isAuto) args.push('--write-auto-sub', '--sub-lang', lang);
        else args.push('--write-sub', '--sub-lang', lang);

        await ytDlpWrap.execPromise(args);

        const files = fs.readdirSync(TEMP_DIR);
        const generatedFile = files.find(f => f.startsWith(tempId) && (f.endsWith('.srt') || f.endsWith('.vtt')));

        if (!generatedFile) {
            throw new Error(`Subtitle file not generated.`);
        }

        const filePath = path.join(TEMP_DIR, generatedFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        fs.unlinkSync(filePath);

        res.send(content);

    } catch (error) {
        try {
            const files = fs.readdirSync(TEMP_DIR);
            files.filter(f => f.startsWith(tempId)).forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
        } catch (e) {}

        console.error("YT-DLP Caption Error:", error.message);
        res.status(500).send(error.message || "Unknown error during subtitle download");
    }
});

app.get('/api/download-video', async (req, res) => {
    const { url, token, quality } = req.query; // Added quality param

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
        let formatArg = 'best';
        if (quality) {
            // Select best video <= quality AND best audio, fallback to 'best' if merge fails
            formatArg = `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`;
        }

        let args = [
            url,
            '--format', formatArg, 
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath,
            '--embed-subs',
            '--embed-thumbnail',
            '--convert-subs', 'srt',
            '--merge-output-format', 'mp4',
            ...getCommonYtDlpArgs()
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
        console.error("YT-DLP Video Error:", error.message);
        res.status(500).send(`Video processing failed: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
})