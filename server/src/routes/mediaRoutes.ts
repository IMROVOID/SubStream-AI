import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import ffmpegPath from 'ffmpeg-static';
import { TEMP_DIR } from '../config';
import { ensureBinary } from '../binaryManager';
import { executeYtDlpWithRetry } from '../ytDlpRunner';
import { translateSrtContent } from '../subtitleHelper';
import { directAxiosClient } from '../proxy';
import { CaptionTrack, DecodedCaptionToken } from '../types';

export const mediaRouter = Router();

// Endpoint: Fetch video metadata & captions
mediaRouter.get('/info', async (req, res) => {
    const url = req.query.url as string;
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
        
        const captions: CaptionTrack[] = [];
        const seenKeys = new Set<string>();

        const processTracks = (tracksObj: any, isAuto: boolean) => {
            if (!tracksObj) return;
            Object.keys(tracksObj).forEach(lang => {
                const formats = tracksObj[lang];
                const name = (formats[0] && formats[0].name) || lang;
                const uniqueKey = `${lang}-${isAuto ? 'auto' : 'manual'}`;
                
                if (!seenKeys.has(uniqueKey)) {
                    seenKeys.add(uniqueKey);
                    const trackConfig: DecodedCaptionToken = { lang: lang, isAuto: isAuto };
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

        // Extract formats (resolutions) - filter out storyboard sprite image formats (sb0, sb1, etc.)
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

        return res.json({
            meta: {
                id: info.id,
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
        });

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

// Endpoint: Download subtitle track (with fallback translation if needed)
mediaRouter.get('/caption', async (req, res) => {
    const rawToken = (req.query.token || req.query.trackId) as string;
    const url = req.query.url as string;

    if (!url || !rawToken) return res.status(400).send("Missing required parameters");

    if (rawToken.startsWith('http')) {
        try {
            const response = await directAxiosClient.get(rawToken, { responseType: 'text' });
            return res.send(response.data);
        } catch (e) {
            return res.status(500).send("Failed to download legacy caption URL.");
        }
    }

    let isAuto = false;
    let lang = '';

    try {
        const jsonStr = Buffer.from(rawToken, 'base64').toString('utf-8');
        const decoded: DecodedCaptionToken = JSON.parse(jsonStr);
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

        const args = [
            url,
            '--skip-download',
            '--convert-subs', 'srt',
            '--output', outputTemplate,
            '--ffmpeg-location', ffmpegPath as string,
        ];

        if (isAuto) args.push('--write-auto-sub', '--sub-lang', subLangParam);
        else args.push('--write-sub', '--sub-lang', subLangParam);

        try {
            await executeYtDlpWithRetry(args);
        } catch (ytErr: any) {
            if (lang !== 'en') {
                console.warn(`[Caption] Direct subtitle fetch for '${lang}' failed (${ytErr?.message}). Retrying with native track 'en'...`);
                const fallbackArgs = [
                    url,
                    '--skip-download',
                    '--convert-subs', 'srt',
                    '--output', outputTemplate,
                    '--ffmpeg-location', ffmpegPath as string,
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
            } catch (transErr: any) {
                console.warn(`[Caption] Auto-translation failed (${transErr?.message}), returning original track.`);
            }
        }

        files.filter(f => f.startsWith(tempId)).forEach(f => {
            try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch (e) {}
        });

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
