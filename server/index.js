const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const axios = require('axios');
const he = require('he'); // HTML entity decoder

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Get Video Metadata
app.get('/api/info', async (req, res) => {
    const url = req.query.url;
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    try {
        const info = await ytdl.getInfo(url);
        const videoDetails = info.videoDetails;
        
        // Extract captions
        const tracks = info.player_response.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        
        const captions = tracks.map(track => ({
            id: track.baseUrl, // We use the URL as the ID
            language: track.languageCode,
            name: track.name.simpleText,
            isAutoSynced: track.kind === 'asr'
        }));

        res.json({
            meta: {
                id: videoDetails.videoId,
                title: videoDetails.title,
                description: videoDetails.description,
                thumbnailUrl: videoDetails.thumbnails.pop().url, // Highest quality
                channelTitle: videoDetails.author.name,
                duration: new Date(videoDetails.lengthSeconds * 1000).toISOString().substr(11, 8)
            },
            captions: captions
        });

    } catch (error) {
        console.error("YTDL Error:", error.message);
        res.status(500).json({ error: 'Failed to fetch video details. YouTube might be blocking the server IP.' });
    }
});

// Proxy & Convert Caption XML to SRT-friendly Text
app.get('/api/caption', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("URL required");

    try {
        // Fetch the XML transcript from YouTube
        const response = await axios.get(url);
        const xmlData = response.data;

        // Simple regex parsing for YouTube's XML format
        // Format: <text start="0" dur="5">Hello</text>
        const regex = /<text start="([\d.]+)" dur="([\d.]+)".*?>(.*?)<\/text>/g;
        let match;
        let srtOutput = "";
        let counter = 1;

        while ((match = regex.exec(xmlData)) !== null) {
            const start = parseFloat(match[1]);
            const dur = parseFloat(match[2]);
            const end = start + dur;
            const text = he.decode(match[3]); // Decode HTML entities like &#39;

            srtOutput += `${counter}\n`;
            srtOutput += `${formatTime(start)} --> ${formatTime(end)}\n`;
            srtOutput += `${text}\n\n`;
            counter++;
        }

        res.send(srtOutput);

    } catch (error) {
        console.error("Caption Fetch Error:", error.message);
        res.status(500).send("Failed to download caption track");
    }
});

function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss},${ms}`;
}

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});