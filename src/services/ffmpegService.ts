import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { ExtractedSubtitleTrack } from '../types';

let ffmpeg: FFmpeg | null;

export async function loadFFmpeg(onProgress: (message: string) => void): Promise<FFmpeg> {
    if (ffmpeg) {
        return ffmpeg;
    }

    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
        console.log(message);
    });

    onProgress('Loading core video engine...');
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    onProgress('Engine loaded.');
    return ffmpeg;
}

export async function analyzeVideoFile(ffmpeg: FFmpeg, file: File): Promise<ExtractedSubtitleTrack[]> {
    await ffmpeg.writeFile('input.video', await fetchFile(file));
    
    const command = ['-i', 'input.video', '-hide_banner'];
    let output = '';
    
    const listener = ({ message }: { message: string }) => { output += message + "\n"; };
    ffmpeg.on('log', listener);
    
    try {
        await ffmpeg.exec(command);
    } catch (e) {
        // FFmpeg throws an error when exec is used for probing, this is expected.
    }
    
    ffmpeg.off('log', listener);
    
    const subtitleTracks: ExtractedSubtitleTrack[] = [];
    const lines = output.split('\n');
    
    lines.forEach(line => {
        if (line.trim().startsWith('Stream #') && line.includes('Subtitle:')) {
            const match = line.match(/Stream #\d+:(\d+)(\((\w+)\))?: Subtitle: .*?(?:\(default\))?/);
            const titleMatch = line.match(/title\s+:\s+(.*)/);
            if (match) {
                subtitleTracks.push({
                    index: parseInt(match[1]),
                    language: match[3] || 'und', // 'und' for undefined
                    title: titleMatch ? titleMatch[1].trim() : `Track ${match[1]}`
                });
            }
        }
    });

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
        // Create a copy to handle potential SharedArrayBuffer backing.
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
        // Create a copy to handle potential SharedArrayBuffer backing.
        const dataCopy = new Uint8Array(data);
        return new Blob([dataCopy], { type: 'video/x-matroska' });
    }
    throw new Error('FFmpeg did not return a valid binary file for video muxing.');
}