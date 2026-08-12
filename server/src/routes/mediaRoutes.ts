import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import ffmpegPath from 'ffmpeg-static';
import { TEMP_DIR } from '../config';
import { ensureBinary } from '../binaryManager';
import { executeYtDlpWithRetry } from '../ytDlpRunner';
import { translateSrtContent, fetchDirectSubtitleTrack } from '../subtitleHelper';
import { CaptionTrack, DecodedCaptionToken } from '../types';
import { metadataCache, captionCache, extractVideoId } from '../cacheManager';

export const mediaRouter = Router();

// Endpoint: Fetch video metadata & captions
mediaRouter.get('/info', async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const videoId = extractVideoId(url);
    const cachedData = metadataCache.get(videoId);
    if (cachedData && cachedData.responseData) {
        console.log(`[Info] Serving metadata for video '${videoId}' from metadataCache.`);
        return res.json(cachedData.responseData);
    }

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
        
        const captions: CaptionTrack[] = [];
        const seenKeys = new Set<string>();

        const processTracks = (tracksObj: any, isAuto: boolean) => {
            if (!tracksObj) return;
            Object.keys(tracksObj).forEach(lang => {
                const formats = tracksObj[lang];
                const name = (formats[0] && formats[0].name) || lang;
                const vttFormat = Array.isArray(formats) ? (formats.find((f: any) => f.ext === 'vtt' || f.ext === 'srv3') || formats[0]) : undefined;
                const directUrl = vttFormat && vttFormat.url ? vttFormat.url : undefined;
                const uniqueKey = `${lang}-${isAuto ? 'auto' : 'manual'}`;
                
                if (!seenKeys.has(uniqueKey)) {
                    seenKeys.add(uniqueKey);
                    const trackConfig: DecodedCaptionToken = { lang: lang, isAuto: isAuto, directUrl: directUrl };
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

        // Extract formats (resolutions) - filter out storyboard sprite image formats
        const resolutions = new Set<number>();
        if (info.formats && Array.isArray(info.formats)) {
            info.formats.forEach((f: any) => {
                const h = typeof f.height === 'number' ? f.height : 0;
                const w = typeof f.width === 'number' ? f.width : 0;
                const isVideoFormat = f.vcodec && f.vcodec !== 'none';
                const isNotStoryboard = f.ext !== 'mhtml' && 
                    (!f.format_id || !String(f.format_id).startsWith('sb')) && 
                    !String(f.format_note || '').toLowerCase().includes('storyboard');
                
                const effectiveRes = (h > 0 && w > 0) ? Math.min(h, w) : (h || w);
                if (effectiveRes >= 144 && isVideoFormat && isNotStoryboard) {
                    resolutions.add(effectiveRes);
                }
            });
        }
        const mainH = typeof info.height === 'number' ? info.height : 0;
        const mainW = typeof info.width === 'number' ? info.width : 0;
        const mainRes = (mainH > 0 && mainW > 0) ? Math.min(mainH, mainW) : (mainH || mainW);

        if (mainRes >= 144) {
            resolutions.add(mainRes);
        }

        const maxDetectedRes = resolutions.size > 0 ? Math.max(...Array.from(resolutions)) : (mainRes || 1080);
        const standardTiers = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144];
        standardTiers.filter(r => r <= maxDetectedRes).forEach(r => resolutions.add(r));

        const sortedResolutions = Array.from(resolutions).sort((a, b) => b - a);

        const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : '');
        const durationSeconds = info.duration || 0;
        
        const date = new Date(durationSeconds * 1000);
        const timeStr = durationSeconds < 3600 ? date.toISOString().substring(14, 19) : date.toISOString().substring(11, 19);

        const directStreamUrl = info.url || (info.formats && info.formats.slice().reverse().find((f: any) => f.url && f.vcodec !== 'none')?.url) || '';

        const responseData = {
            meta: {
                id: info.id || videoId,
                title: info.title,
                description: info.description,
                thumbnailUrl: thumbnail,
                channelTitle: info.uploader,
                duration: timeStr,
                videoUrl: videoUrl,
                streamUrl: directStreamUrl
            },
            streamUrl: directStreamUrl,
            captions: captions,
            resolutions: sortedResolutions
        };

        metadataCache.set(videoId, { responseData, info });

        return res.json(responseData);

    } catch (error: any) {
        console.error("yt-dlp info error:", error?.message);
        return res.status(500).json({ error: 'Failed to fetch video details. URL might be invalid or restricted.' });
    }
});

// Endpoint: Resolve direct video stream URL for playback in Video.js
mediaRouter.get('/stream-url', async (req, res) => {
    const url = req.query.url as string;
    const quality = req.query.quality as string;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const videoId = extractVideoId(url);
    const cachedData = metadataCache.get(videoId);

    if (cachedData && cachedData.info && Array.isArray(cachedData.info.formats)) {
        const formats = cachedData.info.formats;
        let targetHeight = (quality && quality !== 'Auto') ? parseInt(quality.replace(/\D/g, ''), 10) : 1080;
        if (isNaN(targetHeight)) targetHeight = 1080;

        const bestVideo = formats
            .filter((f: any) => f.url && f.vcodec && f.vcodec !== 'none' && (f.height || 0) <= targetHeight)
            .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];

        const bestAudio = formats
            .filter((f: any) => f.url && f.acodec && f.acodec !== 'none' && (f.vcodec === 'none' || !f.vcodec))
            .sort((a: any, b: any) => (b.tbr || 0) - (a.tbr || 0))[0];

        if (bestVideo && bestVideo.url) {
            console.log(`[Stream-Url] Resolved stream URL from metadataCache for '${videoId}' (quality: ${quality || 'Auto'}).`);
            return res.json({
                streamUrl: bestVideo.url,
                audioUrl: bestAudio?.url || null
            });
        }
    }

    await ensureBinary();

    try {
        const targetUrl = url.startsWith('http') ? url : `https://www.youtube.com/watch?v=${url}`;
        
        let formatArg = 'bestvideo[height<=1080]+bestaudio/bestvideo[width<=1080]+bestaudio/best[height<=1080]/best[width<=1080]/best';
        if (quality && quality !== 'Auto') {
            const h = quality.replace(/\D/g, '');
            if (h) {
                formatArg = `bestvideo[height=${h}]+bestaudio/bestvideo[width=${h}]+bestaudio/bestvideo[height<=${h}]+bestaudio/bestvideo[width<=${h}]+bestaudio/best[height<=${h}]/best[width<=${h}]/best`;
            }
        }

        const args = [
            targetUrl,
            '-g',
            '-f', formatArg
        ];

        const output = await executeYtDlpWithRetry(args);
        const urls = output.trim().split('\n').map(u => u.trim()).filter(Boolean);

        if (urls.length > 0) {
            return res.json({ 
                streamUrl: urls[0], 
                audioUrl: urls.length > 1 ? urls[1] : null 
            });
        }

        throw new Error("No stream URL returned from yt-dlp");
    } catch (error: any) {
        console.error("yt-dlp stream-url error:", error?.message);
        return res.status(500).json({ error: 'Failed to resolve stream URL' });
    }
});

// Endpoint: Download subtitle track using yt-dlp native extraction & fallback translation
mediaRouter.get('/caption', async (req, res) => {
    const rawToken = (req.query.token || req.query.trackId) as string;
    const url = req.query.url as string;

    if (!url || !rawToken) return res.status(400).send("Missing required parameters");

    const videoId = extractVideoId(url);

    if (rawToken.startsWith('http')) {
        try {
            const content = await fetchDirectSubtitleTrack(rawToken);
            return res.send(content);
        } catch (e) {
            return res.status(500).send("Failed to download legacy caption URL.");
        }
    }

    let isAuto = false;
    let lang = '';
    let directUrl: string | undefined;

    try {
        const jsonStr = Buffer.from(rawToken, 'base64').toString('utf-8');
        const decoded: DecodedCaptionToken = JSON.parse(jsonStr);
        isAuto = decoded.isAuto;
        lang = decoded.lang;
        directUrl = decoded.directUrl;
    } catch (e) {
        return res.status(400).send("Invalid Caption Token");
    }

    const captionKey = `${videoId}_${lang}_${isAuto ? 'auto' : 'manual'}`;
    const cachedCaption = captionCache.get(captionKey);
    if (cachedCaption) {
        console.log(`[Caption] Serving subtitle for '${captionKey}' from captionCache.`);
        return res.send(cachedCaption);
    }

    // 1. Direct HTTP fetch if direct signed track URL is present in token
    if (directUrl) {
        try {
            console.log(`[Caption] Attempting direct HTTP subtitle download for '${lang}'...`);
            let content = await fetchDirectSubtitleTrack(directUrl);
            if (content && content.length > 10) {
                captionCache.set(captionKey, content);
                return res.send(content);
            }
        } catch (directErr: any) {
            console.warn(`[Caption] Direct HTTP subtitle fetch failed (${directErr?.message}). Proceeding with yt-dlp...`);
        }
    }

    // 2. yt-dlp extraction: Always fetch native 'en' track via yt-dlp (which never gets rate limited)
    await ensureBinary();

    const tempId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outputTemplate = path.join(TEMP_DIR, `${tempId}.%(ext)s`);

    try {
        console.log(`[Caption] Fetching subtitle track via yt-dlp for video '${videoId}' (target lang: ${lang})...`);
        const args = [
            url,
            '--skip-download',
            '--convert-subs', 'srt',
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath as string,
            '--write-auto-sub',
            '--sub-lang', 'en'
        ];

        await executeYtDlpWithRetry(args);

        const files = fs.readdirSync(TEMP_DIR);
        const generatedFile = files.find(f => f.startsWith(tempId) && (f.endsWith('.srt') || f.endsWith('.vtt')));

        if (!generatedFile) {
            throw new Error(`Subtitle file not generated by yt-dlp.`);
        }

        const filePath = path.join(TEMP_DIR, generatedFile);
        let content = fs.readFileSync(filePath, 'utf-8');

        // Clean temp files
        files.filter(f => f.startsWith(tempId)).forEach(f => {
            try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch (e) {}
        });

        // 3. If target language is non-English ('fa'), translate the clean native SRT content to target language
        if (lang !== 'en') {
            console.log(`[Caption] Translating native subtitle track to '${lang}'...`);
            try {
                content = await translateSrtContent(content, lang);
            } catch (transErr: any) {
                console.warn(`[Caption] Translation failed (${transErr?.message}), returning native track.`);
            }
        }

        captionCache.set(captionKey, content);
        return res.send(content);

    } catch (error: any) {
        try {
            const files = fs.readdirSync(TEMP_DIR);
            files.filter(f => f.startsWith(tempId)).forEach(f => { try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch(e) {} });
        } catch (e) {}

        console.error("YT-DLP Caption Error:", error?.message);
        return res.status(500).send("Subtitle download failed.");
    }
});

// Endpoint: Download video with hardcoded subtitles
mediaRouter.get('/download-video', async (req, res) => {
    const { url, token, quality } = req.query as { url?: string; token?: string; quality?: string };

    if (!url || !token) return res.status(400).send("Missing url or token");

    let isAuto = false;
    let lang = '';
    try {
        const jsonStr = Buffer.from(token, 'base64').toString('utf-8');
        const decoded: DecodedCaptionToken = JSON.parse(jsonStr);
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
            formatArg = `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`;
        }

        const args = [
            url,
            '--format', formatArg, 
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath as string,
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
        return res.download(filePath, (err) => {
            setTimeout(() => {
                try {
                    const leftovers = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(tempId));
                    leftovers.forEach(f => { try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch(e) {} });
                } catch (e) {}
            }, 10000); 
        });

    } catch (error: any) {
        try {
             const files = fs.readdirSync(TEMP_DIR);
             files.filter(f => f.startsWith(tempId)).forEach(f => { try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch(e) {} });
        } catch (e) {}
        console.error("YT-DLP Video Error:", error?.message);
        return res.status(500).send("Video processing failed.");
    }
});
