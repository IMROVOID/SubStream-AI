import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { ExtractedSubtitleTrack } from '../types';

// Create a single, reusable FFmpeg instance.
const ffmpeg = new FFmpeg();

export async function loadFFmpeg(onProgress: (message: string) => void): Promise<FFmpeg> {
    console.log("loadFFmpeg: Awaiting lock and checking if loaded...");
    if (ffmpeg.loaded) {
        console.log("loadFFmpeg: Already loaded.");
        onProgress('Engine ready.');
        return ffmpeg;
    }

    ffmpeg.on('log', ({ message }) => {
        console.log("FFMPEG LOG:", message);
    });
    
    ffmpeg.on('progress', ({ progress }) => {
      console.log(`FFmpeg Progress: ${(progress * 100).toFixed(2)}%`);
    });

    onProgress('Loading core video engine...');
    
    // This is the definitive fix. We use an absolute path from the server root.
    // In dev, this resolves to `http://localhost:3000/ffmpeg/...`.
    // In production, Vite's `base` config will automatically prepend `/SubStream-AI/`.
    const baseURL = "/ffmpeg";

    try {
        console.log(`loadFFmpeg: Attempting to load core from baseURL: ${baseURL}`);
        // We still dynamically import toBlobURL to avoid bundler issues.
        const { toBlobURL } = await import('@ffmpeg/util');
        console.log("loadFFmpeg: Dynamic import of toBlobURL successful.");

        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        console.log("loadFFmpeg: ffmpeg.load() completed successfully.");
        onProgress('Engine loaded.');
    } catch (error) {
        console.error("CRITICAL ERROR during FFmpeg load:", error);
        // Re-throw the original error to be caught by the calling function.
        throw error;
    }

    return ffmpeg;
}

export async function analyzeVideoFile(ffmpeg: FFmpeg, file: File): Promise<ExtractedSubtitleTrack[]> {
    console.log("analyzeVideoFile: Starting analysis...");
    await ffmpeg.writeFile('input.video', await fetchFile(file));
    console.log("analyzeVideoFile: Video file written to FFmpeg memory.");
    
    const command = ['-i', 'input.video', '-hide_banner'];
    let output = '';
    
    const listener = ({ message }: { message: string }) => { output += message + "\n"; };
    ffmpeg.on('log', listener);
    
    console.log("analyzeVideoFile: Executing probing command...");
    try {
        await ffmpeg.exec(command);
    } catch (e) {
        console.log("analyzeVideoFile: Caught an error during exec, which is expected for probing. Error:", e);
    } finally {
        ffmpeg.off('log', listener);
        console.log("analyzeVideoFile: Log listener removed.");
    }
    
    if (!output) {
        console.error("analyzeVideoFile: FFmpeg returned no data. This indicates a critical failure.");
        throw new Error("Could not analyze video file. FFmpeg returned no data.");
    }
    
    console.log("analyzeVideoFile: Parsing FFmpeg output for subtitle tracks.");
    const subtitleTracks: ExtractedSubtitleTrack[] = [];
    const lines = output.split('\n');
    
    lines.forEach(line => {
        if (line.trim().startsWith('Stream #') && line.includes('Subtitle:')) {
            const match = line.match(/Stream #\d+:(\d+)(\((\w+)\))?: Subtitle: .*?(?:\(default\))?/);
            const titleMatch = line.match(/title\s+:\s+(.*)/);
            if (match) {
                subtitleTracks.push({
                    index: parseInt(match[1]),
                    language: match[3] || 'und',
                    title: titleMatch ? titleMatch[1].trim() : `Track ${match[1]}`
                });
            }
        }
    });

    console.log(`analyzeVideoFile: Found ${subtitleTracks.length} subtitle tracks.`);
    return subtitleTracks;
}

export async function extractSrt(ffmpeg: FFmpeg, trackIndex: number): Promise<string> {
    const command = ['-i', 'input.video', '-map', `0:s:${trackIndex}`, 'output.srt'];
    await ffmpeg.exec(command);
    const data = await ffmpeg.readFile('output.srt');
    return new TextDecoder().decode(data as Uint8Array);
}


export async function extractAudio(ffmpeg: FFmpeg): Promise<Blob> {
    const command = ['-i', 'input.video', '-vn', '-acodec', 'libmp3lame', '-q:a', '2', 'output.mp3'];
    await ffmpeg.exec(command);
    const data = await ffmpeg.readFile('output.mp3');

    if (data instanceof Uint8Array) {
        const dataCopy = new Uint8Array(data);
        return new Blob([dataCopy], { type: 'audio/mp3' });
    }
    throw new Error('FFmpeg did not return a valid binary file for audio extraction.');
}

export async function addSrtToVideo(ffmpeg: FFmpeg, videoFile: File, srtContent: string, targetLangCode: string): Promise<Blob> {
    await ffmpeg.writeFile('input.video', await fetchFile(videoFile));
    await ffmpeg.writeFile('subtitles.srt', new TextEncoder().encode(srtContent));
    
    const outputFileName = 'output.mkv';

    const command = [
        '-i', 'input.video',
        '-i', 'subtitles.srt',
        '-c', 'copy',
        '-map', '0',
        '-map', '-0:s',
        '-map', '1',
        '-c:s:0', 'srt',
        '-metadata:s:s:0', `language=${targetLangCode}`,
        outputFileName
    ];

    await ffmpeg.exec(command);
    const data = await ffmpeg.readFile(outputFileName);

    if (data instanceof Uint8Array) {
        const dataCopy = new Uint8Array(data);
        return new Blob([dataCopy], { type: 'video/x-matroska' });
    }
    throw new Error('FFmpeg did not return a valid binary file for video muxing.');
}