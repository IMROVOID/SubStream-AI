const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
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
                    
                    // Instead of passing a URL that expires/blocks, we pass a token describing the track
                    const trackId = JSON.stringify({
                        videoUrl: videoUrl,
                        lang: lang,
                        isAuto: isAuto
                    });

                    captions.push({
                        id: Buffer.from(trackId).toString('base64'), // Encode as safe ID string
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
        res.status(500).json({ error: 'Failed to fetch video details.' });
    }
});

app.get('/api/caption', async (req, res) => {
    const trackIdBase64 = req.query.trackId;
    if (!trackIdBase64) return res.status(400).send("Track ID required");

    let trackData;
    try {
        const jsonStr = Buffer.from(trackIdBase64, 'base64').toString('utf-8');
        trackData = JSON.parse(jsonStr);
    } catch (e) {
        return res.status(400).send("Invalid Track ID");
    }

    const { videoUrl, lang, isAuto } = trackData;
    const tempFileName = `temp_${Date.now()}`;

    try {
        // Construct yt-dlp arguments to download only the subtitle
        let args = [
            videoUrl,
            '--skip-download',
            '--convert-subs', 'srt', // Ensure SRT format
            '--output', tempFileName // Base filename
        ];

        if (isAuto) {
            args.push('--write-auto-sub');
            args.push('--sub-lang', lang);
        } else {
            args.push('--write-sub');
            args.push('--sub-lang', lang);
        }

        await ytDlpWrap.execPromise(args);

        // Find the generated file (yt-dlp appends lang code, e.g., temp_123.en.srt)
        const dir = process.cwd();
        const files = fs.readdirSync(dir);
        const generatedFile = files.find(f => f.startsWith(tempFileName) && f.endsWith('.srt'));

        if (!generatedFile) {
            throw new Error("Subtitle file was not generated by yt-dlp.");
        }

        const content = fs.readFileSync(path.join(dir, generatedFile), 'utf-8');
        
        // Cleanup temp file
        fs.unlinkSync(path.join(dir, generatedFile));

        res.send(content);

    } catch (error) {
        console.error("Caption download error:", error.message);
        res.status(500).send("Failed to download caption track.");
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});