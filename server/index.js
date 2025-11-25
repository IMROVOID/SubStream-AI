const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('ffmpeg-static'); 
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
                    
                    // Create token config
                    const trackConfig = {
                        lang: lang,
                        isAuto: isAuto
                    };
                    // Base64 encode
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
        
        // Format duration
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
        res.status(500).json({ error: 'Failed to fetch video details. URL might be invalid or restricted.' });
    }
});

app.get('/api/caption', async (req, res) => {
    const rawToken = req.query.token || req.query.trackId;
    const url = req.query.url;

    if (!url || !rawToken) {
        return res.status(400).send("Missing required parameters (url, token)");
    }

    // Legacy URL Handling
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
            console.error("Legacy URL download failed:", e.message);
            return res.status(500).send("Failed to download legacy caption URL.");
        }
    }

    // New Token Handling
    let isAuto = false;
    let lang = '';

    try {
        const jsonStr = Buffer.from(rawToken, 'base64').toString('utf-8');
        const decoded = JSON.parse(jsonStr);
        isAuto = decoded.isAuto;
        lang = decoded.lang;
    } catch (e) {
        console.error("Token parse error:", e);
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

        if (isAuto) {
            args.push('--write-auto-sub', '--sub-lang', lang);
        } else {
            args.push('--write-sub', '--sub-lang', lang);
        }

        await ytDlpWrap.execPromise(args);

        const files = fs.readdirSync(TEMP_DIR);
        const generatedFile = files.find(f => f.startsWith(tempId) && (f.endsWith('.srt') || f.endsWith('.vtt')));

        if (!generatedFile) {
            throw new Error("Subtitle file not generated.");
        }

        const filePath = path.join(TEMP_DIR, generatedFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Cleanup
        fs.unlinkSync(filePath);

        res.send(content);

    } catch (error) {
        console.error("Caption download error:", error.message);
        // Cleanup
        try {
            const files = fs.readdirSync(TEMP_DIR);
            files.filter(f => f.startsWith(tempId)).forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));
        } catch (e) {}
        
        res.status(500).send(`Failed to download captions: ${error.message.split('\n')[0]}`);
    }
});

// Video Download Endpoint
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
    // We use a simple output template. yt-dlp will append extension.
    const outputTemplate = path.join(TEMP_DIR, `${tempId}.%(ext)s`);
    
    console.log(`Downloading video: ${url} [${lang}] ID: ${tempId}`);

    try {
        // Use 'best' to minimize merging overhead, output MP4 for compatibility
        // Embed thumbnails and subs. Convert subs to SRT first for cleanliness.
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

        if (isAuto) {
            args.push('--write-auto-sub', '--sub-lang', lang);
        } else {
            args.push('--write-sub', '--sub-lang', lang);
        }

        await ytDlpWrap.execPromise(args);

        // --- File Finding Logic ---
        const files = fs.readdirSync(TEMP_DIR);
        
        // Check for finished video files
        let videoFile = files.find(f => 
            f.startsWith(tempId) && 
            (f.endsWith('.mp4') || f.endsWith('.mkv')) &&
            !f.endsWith('.part')
        );

        // Fallback: Check for .part files. 
        if (!videoFile) {
            const partFile = files.find(f => f.startsWith(tempId) && f.endsWith('.part'));
            if (partFile) {
                console.warn(`Found .part file: ${partFile}. Attempting to recover.`);
                const newName = partFile.replace('.part', '');
                fs.renameSync(path.join(TEMP_DIR, partFile), path.join(TEMP_DIR, newName));
                videoFile = newName;
            }
        }

        if (!videoFile) {
            console.error(`Files in temp matching ${tempId}:`, files.filter(f => f.startsWith(tempId)));
            throw new Error(`Video file not found after download.`);
        }

        const filePath = path.join(TEMP_DIR, videoFile);
        const stats = fs.statSync(filePath);
        
        console.log(`Sending file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        // Send file
        res.download(filePath, (err) => {
            if (err) console.error("Send error:", err);
            // Cleanup after sending
            setTimeout(() => {
                try {
                    const leftovers = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(tempId));
                    leftovers.forEach(f => {
                         try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch(e) {}
                    });
                } catch (e) { console.error("Cleanup error:", e); }
            }, 10000); 
        });

    } catch (error) {
        console.error("Video download failed DETAILED:", error.message);
        // Immediate cleanup
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