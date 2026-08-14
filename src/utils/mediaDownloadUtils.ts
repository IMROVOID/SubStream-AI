import { FFmpeg } from '@ffmpeg/ffmpeg';
import { SubtitleNode, YouTubeVideoMetadata } from '../types';
import { stringifySRT, downloadFile, getFormattedDownloadFilename } from './srtUtils';
import { addSrtToVideo } from '../services/ffmpegService';
import { downloadYouTubeVideoWithSubs } from '../services/youtubeService';

export const triggerSrtDownload = (
  subtitles: SubtitleNode[],
  isYouTubeWorkflow: boolean,
  youtubeMeta: YouTubeVideoMetadata | null,
  file: File | null,
  sourceLang: string,
  targetLang: string,
  selectedCaptionId: string
) => {
  const srtContent = stringifySRT(subtitles);
  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const originalName = isYouTubeWorkflow && youtubeMeta ? youtubeMeta.title : file?.name;
  const downloadFilename = getFormattedDownloadFilename(originalName, sourceLang, targetLang, selectedCaptionId, 'srt');
  downloadFile(downloadFilename, blob);
};

export interface VideoDownloadParams {
  fileType: 'srt' | 'video' | 'youtube' | null;
  youtubeMeta: YouTubeVideoMetadata | null;
  file: File | null;
  ffmpegEngine: FFmpeg | null;
  subtitles: SubtitleNode[];
  sourceLang: string;
  targetLang: string;
  selectedCaptionId: string;
  extractedOriginalSrt: string;
  targetResolution?: number;
  onProgress: (percent: number) => void;
  onStatusChange: (status: string) => void;
}

export const processVideoDownload = async ({
  fileType,
  youtubeMeta,
  file,
  ffmpegEngine,
  subtitles,
  sourceLang,
  targetLang,
  selectedCaptionId,
  extractedOriginalSrt,
  targetResolution,
  onProgress,
  onStatusChange
}: VideoDownloadParams) => {
  if (fileType === 'youtube' && youtubeMeta) {
    onStatusChange('Downloading Video...');
    onProgress(25);
    const downloadFilename = getFormattedDownloadFilename(youtubeMeta.title, sourceLang, targetLang, selectedCaptionId, 'mp4');
    await downloadYouTubeVideoWithSubs(youtubeMeta.videoUrl, selectedCaptionId, downloadFilename, targetResolution);
    onProgress(100);
    return;
  }

  if (!ffmpegEngine || !file) return;

  onStatusChange('Muxing Video...');
  onProgress(15);
  const translatedSrt = stringifySRT(subtitles);
  const outputBlob = await addSrtToVideo(
    ffmpegEngine,
    file,
    translatedSrt,
    targetLang,
    extractedOriginalSrt,
    sourceLang,
    targetResolution,
    (percent) => {
      onProgress(percent);
    }
  );
  const ext = file.name.toLowerCase().endsWith('.mkv') ? 'mkv' : 'mp4';
  const downloadFilename = getFormattedDownloadFilename(file.name, sourceLang, targetLang, selectedCaptionId, ext);
  downloadFile(downloadFilename, outputBlob);
  onProgress(100);
};
