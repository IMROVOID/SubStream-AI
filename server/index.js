const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static'); 
const axios = require('axios');
const net = require('net');
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
const checkPortOpen = (host, port, timeout = 300) => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
};

const getWindowsRegistryProxy = () => {
    if (process.platform !== 'win32') return null;
    try {
        const out = require('child_process').execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const enabledMatch = out.match(/ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+)/);
        const serverMatch = out.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
        if (enabledMatch && parseInt(enabledMatch[1], 16) === 1 && serverMatch) {
            let rawProxy = serverMatch[1].trim();
            if (rawProxy.includes('=')) {
                const httpPart = rawProxy.split(';').find(p => p.startsWith('http=') || p.startsWith('https='));
                if (httpPart) rawProxy = httpPart.split('=')[1];
            }
            if (!rawProxy.startsWith('http://') && !rawProxy.startsWith('https://') && !rawProxy.startsWith('socks://')) {
                rawProxy = 'http://' + rawProxy;
            }
            return rawProxy;
        }
    } catch (e) {}
    return null;
};

const getSystemProxy = async () => {
    // 1. Check Environment Variables first
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    if (envProxy) return envProxy;

    // 2. Check Windows System Registry proxy configuration
    const regProxy = getWindowsRegistryProxy();
    if (regProxy) {
        try {
            const parsed = new URL(regProxy);
            const port = parseInt(parsed.port || '80', 10);
            const host = parsed.hostname || '127.0.0.1';
            if (await checkPortOpen(host, port)) {
                return regProxy;
            }
        } catch (e) {}
    }

    // 3. Scan common local proxy ports
    const commonPorts = [12334, 10809, 7890, 7897, 10808, 1080, 8080];
    for (const port of commonPorts) {
        if (await checkPortOpen('127.0.0.1', port)) {
            return `http://127.0.0.1:${port}`;
        }
    }

    return null;
};

let PROXY_URL = null;
let axiosClient = null;

const directAxiosClient = axios.create({
    timeout: 60000,
    headers: { 
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    },
    maxBodyLength: Infinity, 
    maxContentLength: Infinity,
    proxy: false
});

const createAxiosClient = (proxyUrl) => {
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

    if (proxyUrl) {
        try {
            // Use HttpsProxyAgent for robust tunneling
            const agent = new HttpsProxyAgent(proxyUrl);
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

let cachedProxyUrl = null;
let lastProxyCheckTime = 0;
const PROXY_RECHECK_INTERVAL = 3000; // 3 seconds TTL for instant, dynamic adaptation

const getActiveProxyConfig = async () => {
    const now = Date.now();
    if (lastProxyCheckTime === 0 || (now - lastProxyCheckTime) > PROXY_RECHECK_INTERVAL) {
        const detected = await getSystemProxy();
        if (detected !== cachedProxyUrl) {
            cachedProxyUrl = detected;
            console.log(`[Server] Network Proxy Configuration: ${cachedProxyUrl ? cachedProxyUrl : 'Direct Connection'}`);
        }
        lastProxyCheckTime = now;
    }
    return cachedProxyUrl;
};

// Initialize Proxy and Axios Client on Startup
(async () => {
    await getActiveProxyConfig();
})();

// --- BINARY MANAGEMENT (Self-Healing) ---

const downloadBinaryWithProxy = async () => {
    const platform = process.platform;
    let fileName = 'yt-dlp';
    if (platform === 'win32') fileName = 'yt-dlp.exe';
    else if (platform === 'darwin') fileName = 'yt-dlp_macos';

    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
    console.log(`[Server] Downloading ${fileName} from GitHub...`);

    const writer = fs.createWriteStream(YT_DLP_BINARY_PATH);

    const currentProxyUrl = await getActiveProxyConfig();
    const client = createAxiosClient(currentProxyUrl);
    const response = await client({
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

// Retry Helper for Axios with Proxy Fallback
const makeRequestWithRetry = async (config, retries = 3) => {
    const currentProxyUrl = await getActiveProxyConfig();
    const client = createAxiosClient(currentProxyUrl);
    try {
        return await client(config);
    } catch (error) {
        const isProxyError = error.code === 'ECONNREFUSED' || 
                             error.code === 'ENOTFOUND' || 
                             (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('Unable to connect to proxy')));

        if (isProxyError && currentProxyUrl) {
            console.warn(`[Proxy] Proxy request failed (${error.message || error.code}). Retrying with direct connection...`);
            try {
                return await directAxiosClient(config);
            } catch (directErr) {
                throw directErr;
            }
        }

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

// --- YT-DLP EXECUTION HELPER (WITH CLIENT ROTATION & DYNAMIC PROXY FALLBACK) ---

// 'android_vr' and 'tv' are often the most permissive for metadata/subs
// 'android_creator' is a good backup for mobile APIs
const CLIENTS_TO_TRY = ['android_vr', 'tv', 'android_creator', 'ios', 'android', 'mweb', 'web'];

const executeYtDlpWithRetry = async (baseArgs) => {
    let lastError;
    const currentProxyUrl = await getActiveProxyConfig();
    let proxyActive = !!currentProxyUrl;

    for (const client of CLIENTS_TO_TRY) {
        try {
            // Build arguments for this specific client attempt
            const currentArgs = [
                ...baseArgs,
                '--no-playlist',
                '--no-check-certificates',
                '--force-ipv4',
                '--no-cache-dir', // Critical to prevent caching 429/403 states
                '--extractor-args', `youtube:player_client=${client}`
            ];

            if (proxyActive && currentProxyUrl) {
                currentArgs.push('--proxy', currentProxyUrl);
            }

            console.log(`[YT-DLP] Attempting with client: ${client}${proxyActive ? ` (via proxy)` : ' (direct)'}`);
            const result = await ytDlpWrap.execPromise(currentArgs);
            console.log(`[YT-DLP] Success with client: ${client}`);
            return result;

        } catch (e) {
            const msg = e.message || '';
            const isProxyError = msg.includes('Unable to connect to proxy') || 
                                 msg.includes('ProxyError') || 
                                 msg.includes('WinError 10061') || 
                                 msg.includes('ECONNREFUSED');

            if (isProxyError && proxyActive) {
                console.warn(`[YT-DLP] Proxy failed (${msg.split('\n')[0]}). Disabling proxy and retrying client '${client}' directly...`);
                proxyActive = false; // Disable proxy for remainder of execution
                try {
                    const directArgs = [
                        ...baseArgs,
                        '--no-playlist',
                        '--no-check-certificates',
                        '--force-ipv4',
                        '--no-cache-dir',
                        '--extractor-args', `youtube:player_client=${client}`
                    ];
                    console.log(`[YT-DLP] Attempting with client: ${client} (direct fallback)`);
                    const result = await ytDlpWrap.execPromise(directArgs);
                    console.log(`[YT-DLP] Success with client: ${client} (direct fallback)`);
                    return result;
                } catch (directErr) {
                    lastError = directErr;
                }
            } else {
                const isRateLimit = msg.includes('HTTP Error 429') || msg.includes('Too Many Requests');
                const isForbidden = msg.includes('HTTP Error 403') || msg.includes('Sign in to confirm');
                const isPOToken = msg.includes('PO Token');
                const isFormat = msg.includes('Requested format is not available');

                console.warn(`[YT-DLP] Client '${client}' failed. (Error: ${isRateLimit ? 'Rate Limited' : isForbidden ? 'Forbidden' : isPOToken ? 'PO Token' : isFormat ? 'Format Unavail' : 'Generic'})`);
                lastError = e;
            }
            
            // Short random delay between retries to avoid hammering
            await delay(1500 + Math.random() * 1000); 
        }
    }

    // Final fallback: if proxy was attempted and everything failed, try a direct connection pass
    if (currentProxyUrl && proxyActive) {
        console.warn("[YT-DLP] All proxy attempts failed. Performing final direct connection attempt...");
        for (const client of ['tv', 'mweb', 'web']) {
            try {
                const directArgs = [
                    ...baseArgs,
                    '--no-playlist',
                    '--no-check-certificates',
                    '--force-ipv4',
                    '--no-cache-dir',
                    '--extractor-args', `youtube:player_client=${client}`
                ];
                const result = await ytDlpWrap.execPromise(directArgs);
                console.log(`[YT-DLP] Direct connection fallback succeeded with client: ${client}`);
                return result;
            } catch (err) {
                lastError = err;
            }
        }
    }

    // If we exhausted all clients
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
            console.error("Proxy file-head inner error:", innerError.message);
            res.status(400).json({ error: "Could not access URL" });
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

        let response;
        try {
            const currentProxyUrl = await getActiveProxyConfig();
            const client = createAxiosClient(currentProxyUrl);
            response = await client({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: headers
            });
        } catch (err) {
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                console.warn('[Proxy] Proxy file-get failed, retrying directly...');
                response = await directAxiosClient({
                    method: 'get',
                    url: url,
                    responseType: 'stream',
                    headers: headers
                });
            } else {
                throw err;
            }
        }

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
        
        let response;
        try {
            const currentProxyUrl = await getActiveProxyConfig();
            const client = createAxiosClient(currentProxyUrl);
            response = await client({
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
        } catch (err) {
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                console.warn('[Proxy] Proxy upload-finish failed, retrying directly...');
                response = await directAxiosClient({
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
            } else {
                throw err;
            }
        }

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

app.get('/api/info', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Wait for binary to be ready before executing
    await ensureBinary();

    try {
        const args = [
            url,
            '--dump-json',
            '--skip-download',
        ];

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

const translateSrtChunk = async (text, targetLang) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
    const client = axiosClient || directAxiosClient;
    const body = new URLSearchParams({ q: text }).toString();
    const response = await client.post(url, body, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (response.data && response.data[0]) {
        return response.data[0].map(x => x[0]).join('');
    }
    throw new Error('Translation API returned invalid structure');
};

const translateSrtContent = async (srtContent, targetLang) => {
    if (!srtContent || targetLang === 'en') return srtContent;

    const blocks = srtContent.trim().split(/\r?\n\r?\n/);
    const translatedBlocks = [];

    const CHUNK_SIZE = 50;
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
        const chunkBlocks = blocks.slice(i, i + CHUNK_SIZE);
        const chunkText = chunkBlocks.join('\n\n');
        try {
            const translatedText = await translateSrtChunk(chunkText, targetLang);
            translatedBlocks.push(translatedText);
        } catch (err) {
            console.warn(`[Translate] Chunk translation warning (${err.message}). Retrying block by block...`);
            for (const b of chunkBlocks) {
                try {
                    const singleTranslated = await translateSrtChunk(b, targetLang);
                    translatedBlocks.push(singleTranslated);
                } catch (e) {
                    translatedBlocks.push(b);
                }
            }
        }
    }

    return translatedBlocks.join('\n\n');
};

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

    await ensureBinary();

    const tempId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outputTemplate = path.join(TEMP_DIR, `${tempId}.%(ext)s`);

    try {
        let subLangParam = lang;
        if (lang !== 'en') {
            subLangParam = `${lang},en`;
        }

        let args = [
            url,
            '--skip-download',
            '--convert-subs', 'srt',
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath,
        ];

        if (isAuto) args.push('--write-auto-sub', '--sub-lang', subLangParam);
        else args.push('--write-sub', '--sub-lang', subLangParam);

        try {
            await executeYtDlpWithRetry(args);
        } catch (ytErr) {
            if (lang !== 'en') {
                console.warn(`[Caption] Direct subtitle fetch for '${lang}' failed (${ytErr.message}). Retrying with native track 'en'...`);
                let fallbackArgs = [
                    url,
                    '--skip-download',
                    '--convert-subs', 'srt',
                    '--output', outputTemplate,
                    '--ffmpeg-location', ffmpegPath,
                    '--write-auto-sub', '--sub-lang', 'en'
                ];
                await executeYtDlpWithRetry(fallbackArgs);
            } else {
                throw ytErr;
            }
        }

        const files = fs.readdirSync(TEMP_DIR);
        let generatedFile = files.find(f => f.startsWith(tempId) && (f.includes(`.${lang}.`) || f.endsWith(`.${lang}`)) && (f.endsWith('.srt') || f.endsWith('.vtt')));
        let isFallback = false;

        if (!generatedFile) {
            generatedFile = files.find(f => f.startsWith(tempId) && (f.endsWith('.srt') || f.endsWith('.vtt')));
            if (generatedFile && lang !== 'en' && !generatedFile.includes(`.${lang}.`)) {
                isFallback = true;
            }
        }

        if (!generatedFile) {
            throw new Error(`Subtitle file not generated.`);
        }

        const filePath = path.join(TEMP_DIR, generatedFile);
        let content = fs.readFileSync(filePath, 'utf-8');

        if (isFallback && lang !== 'en') {
            console.log(`[Caption] Translating fallback subtitle track to '${lang}'...`);
            try {
                content = await translateSrtContent(content, lang);
            } catch (transErr) {
                console.warn(`[Caption] Auto-translation failed (${transErr.message}), returning original track.`);
            }
        }

        files.filter(f => f.startsWith(tempId)).forEach(f => {
            try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch (e) {}
        });

        res.send(content);

    } catch (error) {
        try {
            const files = fs.readdirSync(TEMP_DIR);
            files.filter(f => f.startsWith(tempId)).forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
        } catch (e) {}

        console.error("YT-DLP Caption Error:", error.message);
        res.status(500).send("Subtitle download failed.");
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

    await ensureBinary();

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
        ];

        if (isAuto) args.push('--write-auto-sub', '--sub-lang', lang);
        else args.push('--write-sub', '--sub-lang', lang);

        await executeYtDlpWithRetry(args);

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
        res.status(500).send("Video processing failed.");
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
})