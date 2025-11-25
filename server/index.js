const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static'); // Import FFmpeg binary path
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

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

// Download binary if missing
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

// Run on startup
ensureBinary();

// --- ENDPOINTS ---

app.get('/api/info', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    await ensureBinary();

    try {
        const metadata = await ytDlpWrap.execPromise([
            url,
            '--dump-json',
            '--no-playlist',
            '--skip-download'
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
                    
                    // Create a config object
                    const trackConfig = {
                        lang: lang,
                        isAuto: isAuto
                    };
                    // Encode as Base64
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
        const timeStr = durationSeconds < 3600 
            ? date.toISOString().substr(14, 5) 
            : date.toISOString().substr(11, 8);

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
        res.status(500).json({ error: 'Failed to fetch video details.' });
    }
});

app.get('/api/caption', async (req, res) => {
    // Support both parameter names for compatibility
    const rawToken = req.query.token || req.query.trackId;
    const url = req.query.url;

    if (!url || !rawToken) {
        return res.status(400).send("Missing required parameters (url, token)");
    }

    // 1. LEGACY HANDLER: If rawToken looks like a URL (starts with http), try Axios proxy
    if (rawToken.startsWith('http')) {
        try {
            const response = await axios.get(rawToken, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                responseType: 'text'
            });
            return res.send(response.data);
        } catch (e) {
            console.error("Legacy URL proxy failed:", e.message);
            // If this fails, we tell the user to re-import because the URL likely expired
            return res.status(400).send("Caption URL expired. Please re-import the video.");
        }
    }

    // 2. NEW TOKEN HANDLER (yt-dlp with FFmpeg)
    let isAuto = false;
    let lang = '';

    try {
        const jsonStr = Buffer.from(rawToken, 'base64').toString('utf-8');
        const decoded = JSON.parse(jsonStr);
        isAuto = decoded.isAuto;
        lang = decoded.lang;
    } catch (e) {
        return res.status(400).send("Invalid Caption Token. Please re-import video.");
    }

    const tempId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    // Explicitly use temp dir
    const outputTemplate = path.join(TEMP_DIR, `${tempId}.%(ext)s`);

    try {
        let args = [
            url,
            '--skip-download',
            '--convert-subs', 'srt',
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath // CRITICAL FIX: Point to ffmpeg-static binary
        ];

        if (isAuto) {
            args.push('--write-auto-sub');
            args.push('--sub-lang', lang);
        } else {
            args.push('--write-sub');
            args.push('--sub-lang', lang);
        }

        await ytDlpWrap.execPromise(args);

        const files = fs.readdirSync(TEMP_DIR);
        // Look for the specific file created
        const generatedFile = files.find(f => f.startsWith(tempId));

        if (!generatedFile) {
            throw new Error(`Subtitle file not generated. Check if ffmpeg is working.`);
        }

        const filePath = path.join(TEMP_DIR, generatedFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Cleanup
        fs.unlinkSync(filePath);

        res.send(content);

    } catch (error) {
        console.error("Caption download error:", error.message);
        // Cleanup temp files on error
        try {
            const files = fs.readdirSync(TEMP_DIR);
            files.filter(f => f.startsWith(tempId)).forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
        } catch (e) {}
        
        // Send clean error message
        res.status(500).send(`Download failed: ${error.message.split('\n')[0]}`);
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});