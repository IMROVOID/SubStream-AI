const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Setup yt-dlp binary path
const ytDlpBinaryPath = path.join(__dirname, 'yt-dlp' + (process.platform === 'win32' ? '.exe' : ''));
const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath);

// Helper: Download binary if missing
const ensureBinary = async () => {
    if (!fs.existsSync(ytDlpBinaryPath)) {
        console.log('Downloading yt-dlp binary... This may take a minute.');
        try {
            await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);
            console.log('yt-dlp binary downloaded successfully.');
            if (process.platform !== 'win32') {
                fs.chmodSync(ytDlpBinaryPath, '755');
            }
        } catch (err) {
            console.error('Failed to download yt-dlp:', err);
        }
    }
};

ensureBinary();

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
        
        // Process and Deduplicate Captions
        let captions = [];
        const seenIds = new Set();

        const processTracks = (tracksObj, isAuto) => {
            if (!tracksObj) return;
            Object.keys(tracksObj).forEach(lang => {
                const formats = tracksObj[lang];
                // Prefer VTT
                const bestFormat = formats.find(f => f.ext === 'vtt') || formats[0];
                
                if (bestFormat) {
                    if (!seenIds.has(bestFormat.url)) {
                        seenIds.add(bestFormat.url);
                        captions.push({
                            id: bestFormat.url,
                            language: lang,
                            name: (formats[0].name || lang) + (isAuto ? ' (Auto)' : ''),
                            isAutoSynced: isAuto
                        });
                    }
                }
            });
        };

        processTracks(info.subtitles, false);
        processTracks(info.automatic_captions, true);

        const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : '');

        // Format duration
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
                duration: timeStr
            },
            captions: captions
        });

    } catch (error) {
        console.error("yt-dlp execution error:", error.message);
        res.status(500).json({ error: 'Failed to fetch video details. URL might be invalid or restricted.' });
    }
});

app.get('/api/caption', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("URL required");

    try {
        // Use a real browser User-Agent to prevent YouTube 403/500 errors
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.youtube.com/'
            },
            responseType: 'text' // Ensure we get text back, not JSON
        });
        res.send(response.data);
    } catch (error) {
        console.error("Caption proxy error details:", error.response ? error.response.status : error.message);
        res.status(500).send("Failed to download caption track.");
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});