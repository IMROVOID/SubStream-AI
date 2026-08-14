import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from "@ffmpeg/util";
import { ExtractedSubtitleTrack } from '../../types';

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

  onProgress('Initializing video engine...');
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  try {
    console.log(`loadFFmpeg: Attempting to load core from CDN: ${baseURL}`);
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
    throw error;
  }

  return ffmpeg;
}

export interface VideoAnalysisResult {
  tracks: ExtractedSubtitleTrack[];
  dimensions?: { width: number; height: number };
}

export async function analyzeVideoFile(ffmpeg: FFmpeg, file: File): Promise<VideoAnalysisResult> {
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
  
  console.log("analyzeVideoFile: Parsing FFmpeg output for subtitle tracks & video resolution.");
  const subtitleTracks: ExtractedSubtitleTrack[] = [];
  let dimensions: { width: number; height: number } | undefined;
  const lines = output.split('\n');
  
  lines.forEach(line => {
    if (line.includes('Video:')) {
      const dimMatch = line.match(/,\s*(\d{3,5})x(\d{3,5})/);
      if (dimMatch) {
        const w = parseInt(dimMatch[1], 10);
        const h = parseInt(dimMatch[2], 10);
        if (w > 0 && h > 0) {
          dimensions = { width: w, height: h };
        }
      }
    }

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

  console.log(`analyzeVideoFile: Found ${subtitleTracks.length} subtitle tracks and dimensions:`, dimensions);
  return { tracks: subtitleTracks, dimensions };
}

export async function extractSrt(ffmpeg: FFmpeg, trackIndex: number): Promise<string> {
  const command = ['-i', 'input.video', '-map', `0:s:${trackIndex}`, 'output.srt'];
  await ffmpeg.exec(command);
  const data = await ffmpeg.readFile('output.srt');
  return new TextDecoder().decode(data as Uint8Array);
}

export async function extractAudio(ffmpeg: FFmpeg): Promise<Blob> {
  const command = [
    '-i', 'input.video', 
    '-vn', 
    '-af', 'aresample=async=1', 
    '-acodec', 'pcm_s16le', 
    '-ar', '16000', 
    '-ac', '1', 
    'output.wav'
  ];
  
  await ffmpeg.exec(command);
  const data = await ffmpeg.readFile('output.wav');

  if (data instanceof Uint8Array) {
    const dataCopy = new Uint8Array(data);
    return new Blob([dataCopy], { type: 'audio/wav' });
  }
  throw new Error('FFmpeg did not return a valid binary file for audio extraction.');
}

export async function addSrtToVideo(
  ffmpeg: FFmpeg, 
  videoFile: File, 
  translatedSrt: string, 
  targetLangCode: string,
  originalSrt?: string,
  sourceLangCode?: string,
  targetResolution?: number,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  onProgress?.(15);
  await ffmpeg.writeFile('input.video', await fetchFile(videoFile));
  onProgress?.(40);
  await ffmpeg.writeFile('translated.srt', new TextEncoder().encode(translatedSrt));
  
  const command = [
    '-i', 'input.video',
    '-i', 'translated.srt'
  ];

  if (originalSrt) {
    await ffmpeg.writeFile('original.srt', new TextEncoder().encode(originalSrt));
    command.push('-i', 'original.srt');
  }

  const outputFileName = 'output.mkv';
  command.push('-map', '0:v?', '-map', '0:a?', '-map', '0:s?', '-map', '0:d?');

  // Lossless instant stream-copy for video and audio
  command.push('-c:v', 'copy', '-c:a', 'copy');

  command.push(
    '-map', '1', 
    '-c:s', 'srt',
    '-metadata:s:s:0', `language=${targetLangCode}`, 
    '-metadata:s:s:0', `title=SubStream Translated (${targetLangCode})`,
    '-disposition:s:s:0', 'default'
  );

  if (originalSrt) {
    command.push(
      '-map', '2',
      '-c:s', 'srt',
      '-metadata:s:s:1', `language=${sourceLangCode || 'und'}`,
      '-metadata:s:s:1', `title=Original (${sourceLangCode || 'Original'})`
    );
  }

  command.push(outputFileName);

  onProgress?.(65);
  const progressListener = ({ progress }: { progress: number }) => {
    if (progress > 0 && progress <= 1) {
      onProgress?.(Math.round(65 + progress * 25));
    }
  };
  ffmpeg.on('progress', progressListener);

  try {
    await ffmpeg.exec(command);
  } finally {
    ffmpeg.off('progress', progressListener);
  }

  onProgress?.(95);
  const data = await ffmpeg.readFile(outputFileName);
  onProgress?.(100);

  if (data instanceof Uint8Array) {
    const dataCopy = new Uint8Array(data);
    return new Blob([dataCopy], { type: 'video/x-matroska' });
  }
  throw new Error('FFmpeg did not return a valid binary file for video muxing.');
}
