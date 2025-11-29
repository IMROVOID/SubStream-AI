const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static');
const { exec } = require('child_process');
const axios = require('axios');
// Import HttpsProxyAgent to handle v2ray/local proxy tunnels correctly
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');
const fs = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 4000;

app.use(cors());

// Increase limit to handle large JSON payloads if necessary
app.use(express.json({ limit: '50mb' })); 

// --- CONFIGURATION ---
const TEMP_DIR = path.join(__dirname, 'temp');
const YT_DLP_BINARY_PATH = path.join(__dirname, 'yt-dlp' + (process.platform === 'win32' ? '.exe' : ''));
const COOKIES_PATH = path.join(__dirname, 'cookies.txt'); // Path for manual cookies

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

// --- BINARY MANAGEMENT (Self-Healing) ---

const downloadBinaryWithProxy = async () => {
    const platform = process.platform;
    // Determine correct filename for GitHub releases
    let fileName = 'yt-dlp';
    if (platform === 'win32') fileName = 'yt-dlp.exe';
    else if (platform === 'darwin') fileName = 'yt-dlp_macos';

    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
    console.log(`[Server] Downloading ${fileName} from GitHub using Proxy...`);

    const writer = fs.createWriteStream(YT_DLP_BINARY_PATH);

    const response = await axiosClient({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 0 // No timeout for download
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            console.log('[Server] yt-dlp binary downloaded successfully.');
            if (platform !== 'win32') {
                try { fs.chmodSync(YT_DLP_BINARY_PATH, '755'); } catch (e) {}
            }
            resolve();
        });
        writer.on('error', reject);
    });
};

const ensureBinary = async () => {
    let isValid = false;

    // 1. Check if exists
    if (fs.existsSync(YT_DLP_BINARY_PATH)) {
        try {
            // 2. Try to run version check to verify integrity
            await ytDlpWrap.execPromise(['--version']);
            isValid = true;
        } catch (e) {
            console.error(`[Server] Existing yt-dlp binary is corrupted (Error: ${e.message.split('\n')[0]}). Deleting...`);
            try { fs.unlinkSync(YT_DLP_BINARY_PATH); } catch (delErr) {}
        }
    }

    // 3. Download if missing or deleted
    if (!isValid) {
        try {
            await downloadBinaryWithProxy();
        } catch (err) {
            console.error('[Server] Failed to download yt-dlp binary:', err.message);
            // Fallback: Try library default if custom proxy download fails (unlikely)
            try {
                console.log('[Server] Attempting fallback download...');
                await YTDlpWrap.downloadFromGithub(YT_DLP_BINARY_PATH);
            } catch (fallbackErr) {
                console.error('[Server] Fallback download also failed.');
            }
        }
    }
};

// Initialize binary check on startup
ensureBinary();

// --- HELPERS ---

// Retry Helper for Axios
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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- SRT CLEANING HELPERS ---

const timeToMs = (timeString) => {
    if (!timeString) return 0;
    const [hms, ms] = timeString.replace('.', ',').split(','); // Handle dot or comma
    const [h, m, s] = hms.split(':').map(Number);
    return (h * 3600000) + (m * 60000) + (s * 1000) + (parseInt(ms) || 0);
};

const msToTime = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mil = Math.floor(ms % 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mil).padStart(3, '0')}`;
};

/**
 * Parses raw SRT string, fixes overlapping timestamps, and returns clean SRT string.
 */
const cleanSrtContent = (srtData) => {
    // 1. Parse
    const normalizedData = srtData.replace(/\r\n/g, '\n').trim();
    const blocks = normalizedData.split(/\n\n+/);
    
    let subtitles = [];
    
    blocks.forEach((block, index) => {
        const lines = block.split('\n');
        if (lines.length < 2) return;

        // Find timestamp line
        const timeLineIndex = lines.findIndex(l => l.includes('-->'));
        if (timeLineIndex === -1) return;

        const times = lines[timeLineIndex].split('-->');
        if (times.length !== 2) return;

        const startTime = times[0].trim();
        const endTime = times[1].trim();
        
        // Get Text
        const textLines = lines.slice(timeLineIndex + 1);
        const text = textLines.join(' ').replace(/<[^>]*>/g, '').trim(); // Remove tags
        
        if (text) {
            subtitles.push({
                id: index + 1,
                startMs: timeToMs(startTime),
                endMs: timeToMs(endTime),
                text: text
            });
        }
    });

    // 2. Fix Overlaps
    // Ensure Line N End <= Line N+1 Start
    subtitles.sort((a, b) => a.startMs - b.startMs);

    for (let i = 0; i < subtitles.length - 1; i++) {
        const current = subtitles[i];
        const next = subtitles[i + 1];

        if (current.endMs > next.startMs) {
            // Snap end time to next start time
            current.endMs = next.startMs;
        }
    }

    // 3. Rebuild SRT
    return subtitles.map((sub, idx) => {
        return `${idx + 1}\n${msToTime(sub.startMs)} --> ${msToTime(sub.endMs)}\n${sub.text}`;
    }).join('\n\n');
};


// --- YT-DLP EXECUTION HELPER (WITH CLIENT ROTATION & IP STRATEGY) ---

const CLIENTS_TO_TRY = ['android_creator', 'ios', 'mweb'];

const executeYtDlpWithRetry = async (baseArgs) => {
    let lastError;

    const hasCookies = fs.existsSync(COOKIES_PATH);
    if (hasCookies) {
        console.log("[YT-DLP] Using cookies.txt for authentication.");
    }

    for (const client of CLIENTS_TO_TRY) {
        try {
            const currentArgs = [
                ...baseArgs,
                '--no-playlist',
                '--no-check-certificates',
                '--no-cache-dir', 
                '--sleep-requests', '1.5',
                '--extractor-args', `youtube:player_client=${client}`
            ];

            if (hasCookies) {
                currentArgs.push('--cookies', COOKIES_PATH);
            }

            if (PROXY_URL) {
                currentArgs.push('--proxy', PROXY_URL);
            }

            console.log(`[YT-DLP] Attempting with client: ${client}`);
            const result = await ytDlpWrap.execPromise(currentArgs);
            console.log(`[YT-DLP] Success with client: ${client}`);
            return result;

        } catch (e) {
            const msg = e.message || '';
            const isRateLimit = msg.includes('HTTP Error 429') || msg.includes('Too Many Requests');
            console.warn(`[YT-DLP] Client '${client}' failed. (Rate Limit: ${isRateLimit})`);
            lastError = e;
            await delay(2000 + Math.random() * 2000); 
        }
    }

    console.error("[YT-DLP] All clients failed.");
    throw lastError;
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
        res.status(status).json(data);
    }
});

app.put('/api/proxy/upload-finish', async (req, res) => {
    const uploadUrl = req.headers['x-upload-url'];
    const contentType = req.headers['content-type'];
    const contentLength = req.headers['content-length'];

    if (!uploadUrl) {
        return res.status(400).json({ error: "Missing 'x-upload-url' header" });
    }

    try {
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
            timeout: 0, 
            responseType: 'json' 
        });
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
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

app.get('/api/info', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });
    await ensureBinary();

    try {
        const args = [url, '--dump-json', '--skip-download'];
        const metadata = await executeYtDlpWithRetry(args);
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

        const resolutions = new Set();
        if (info.formats) {
            info.formats.forEach(f => {
                if (f.height && f.vcodec !== 'none') resolutions.add(f.height);
            });
        }
        const sortedResolutions = Array.from(resolutions).sort((a, b) => b - a);

        res.json({
            meta: {
                id: info.id,
                title: info.title,
                description: info.description,
                thumbnailUrl: info.thumbnail,
                channelTitle: info.uploader,
                duration: info.duration,
                videoUrl: videoUrl
            },
            captions: captions,
            resolutions: sortedResolutions
        });
    } catch (error) {
        console.error("yt-dlp info error:", error.message);
        res.status(500).json({ error: 'Failed to fetch video details.' });
    }
});

app.get('/api/caption', async (req, res) => {
    const rawToken = req.query.token;
    const url = req.query.url;
    if (!url || !rawToken) return res.status(400).send("Missing required parameters");

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

    await ensureBinary();
    const tempId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outputTemplate = path.join(TEMP_DIR, `${tempId}.%(ext)s`);

    try {
        let args = [url, '--skip-download', '--convert-subs', 'srt', '--output', outputTemplate, '--ffmpeg-location', ffmpegPath];
        if (isAuto) args.push('--write-auto-sub', '--sub-lang', lang);
        else args.push('--write-sub', '--sub-lang', lang);

        await executeYtDlpWithRetry(args);

        const files = fs.readdirSync(TEMP_DIR);
        const generatedFile = files.find(f => f.startsWith(tempId) && (f.endsWith('.srt') || f.endsWith('.vtt')));
        if (!generatedFile) throw new Error(`Subtitle file not generated.`);

        const filePath = path.join(TEMP_DIR, generatedFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        fs.unlinkSync(filePath);

        // CLEAN THE CONTENT BEFORE SENDING
        const cleanContent = cleanSrtContent(content);
        res.send(cleanContent);

    } catch (error) {
        console.error("YT-DLP Caption Error:", error.message);
        res.status(500).send(error.message);
    }
});

// --- DECOUPLED DOWNLOAD & MERGE ENDPOINT ---
app.get('/api/download-video', async (req, res) => {
    const { url, token, quality } = req.query;
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

    await ensureBinary();

    const baseId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const videoOutput = path.join(TEMP_DIR, `${baseId}_vid.%(ext)s`);
    const subOutput = path.join(TEMP_DIR, `${baseId}_sub.%(ext)s`);

    try {
        console.log(`[Download] Starting separate download for ${baseId}`);

        // 1. Download Video ONLY
        let formatArg = 'best';
        if (quality) formatArg = `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`;
        
        const vidArgs = [url, '--format', formatArg, '--output', videoOutput, '--ffmpeg-location', ffmpegPath];
        await executeYtDlpWithRetry(vidArgs);

        // 2. Download Subtitle ONLY
        const subArgs = [url, '--skip-download', '--convert-subs', 'srt', '--output', subOutput, '--ffmpeg-location', ffmpegPath];
        if (isAuto) subArgs.push('--write-auto-sub', '--sub-lang', lang);
        else subArgs.push('--write-sub', '--sub-lang', lang);
        
        await executeYtDlpWithRetry(subArgs);

        // 3. Locate files
        const files = fs.readdirSync(TEMP_DIR);
        const videoFile = files.find(f => f.startsWith(`${baseId}_vid`) && !f.endsWith('.part'));
        const subFile = files.find(f => f.startsWith(`${baseId}_sub`) && f.endsWith('.srt'));

        if (!videoFile || !subFile) throw new Error("Failed to download video or subtitle components.");

        const videoPath = path.join(TEMP_DIR, videoFile);
        const subPath = path.join(TEMP_DIR, subFile);
        const cleanSubPath = path.join(TEMP_DIR, `${baseId}_clean.srt`);
        const finalPath = path.join(TEMP_DIR, `${baseId}_final.mp4`);

        // 4. Clean Subtitles
        console.log(`[Download] Cleaning subtitles for ${baseId}`);
        const rawSub = fs.readFileSync(subPath, 'utf-8');
        const cleanedSub = cleanSrtContent(rawSub);
        fs.writeFileSync(cleanSubPath, cleanedSub);

        // 5. Mux using FFmpeg
        console.log(`[Download] Muxing video...`);
        // Use mov_text for mp4 subtitle compatibility
        const ffmpegCmd = `"${ffmpegPath}" -i "${videoPath}" -i "${cleanSubPath}" -c:v copy -c:a copy -c:s mov_text -metadata:s:s:0 language=${lang} "${finalPath}"`;
        
        await execPromise(ffmpegCmd);

        // 6. Send File
        if (fs.existsSync(finalPath)) {
            res.download(finalPath, (err) => {
                // Cleanup
                try {
                    fs.unlinkSync(videoPath);
                    fs.unlinkSync(subPath);
                    fs.unlinkSync(cleanSubPath);
                    setTimeout(() => {
                        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                    }, 5000);
                } catch (e) { console.error("Cleanup error", e); }
            });
        } else {
            throw new Error("Muxing failed, output file missing.");
        }

    } catch (error) {
        console.error("Download/Merge Error:", error.message);
        res.status(500).send(`Processing failed: ${error.message}`);
        
        // Attempt cleanup on fail
        try {
            const files = fs.readdirSync(TEMP_DIR);
            files.filter(f => f.startsWith(baseId)).forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
        } catch(e) {}
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});