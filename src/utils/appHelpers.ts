import { VideoProcessingStatus, AIModel } from '../types';

export type TokenResponse = {
  access_token: string;
};

export const getVideoProcessingStatusTitle = (status: VideoProcessingStatus): string => {
  switch (status) {
    case VideoProcessingStatus.INITIALIZING_ENGINE: return "Initializing Engine";
    case VideoProcessingStatus.ANALYZING: return "Analyzing Video";
    case VideoProcessingStatus.EXTRACTING_AUDIO: return "Extracting Audio";
    case VideoProcessingStatus.TRANSCRIBING: return "Transcribing Audio";
    case VideoProcessingStatus.EXTRACTING_SUBTITLES: return "Extracting Subtitles";
    case VideoProcessingStatus.UPLOADING_TO_YOUTUBE: return "Uploading to YouTube";
    case VideoProcessingStatus.AWAITING_YOUTUBE_CAPTIONS: return "Waiting for YouTube Processing";
    case VideoProcessingStatus.MUXING: return "Muxing Subtitles";
    default: return "Processing";
  }
};

export const generateVideoThumbnail = (videoFile: File): Promise<string> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
      canvas.remove();
    };

    video.onloadedmetadata = () => {
      const seekTime = video.duration > 1 ? 1 : Math.max(0, video.duration / 2);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        if (!context || video.videoWidth === 0 || video.videoHeight === 0) {
          cleanup();
          return resolve('');
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        resolve('');
      }
    };

    video.onerror = () => {
      cleanup();
      resolve('');
    };

    setTimeout(() => {
      cleanup();
      resolve('');
    }, 3000);
  });
};

export const resolveAvailableModel = (
  googleKey: string,
  openAIKey: string,
  anthropicKey: string,
  googleUser: any,
  models: AIModel[]
): string => {
  if (googleKey.trim()) {
    const firstGoogle = models.find(m => m.provider === 'google');
    if (firstGoogle) return firstGoogle.id;
  }
  if (openAIKey.trim()) {
    const firstOpenAI = models.find(m => m.provider === 'openai');
    if (firstOpenAI) return firstOpenAI.id;
  }
  if (anthropicKey.trim()) {
    const firstAnthropic = models.find(m => m.provider === 'anthropic');
    if (firstAnthropic) return firstAnthropic.id;
  }
  if (googleUser) {
    return 'youtube-auto';
  }
  return '';
};

export const isModelValidForCurrentAuth = (
  modelId: string,
  googleKey: string,
  openAIKey: string,
  anthropicKey: string,
  googleUser: any,
  models: AIModel[]
): boolean => {
  if (!modelId) return false;
  const model = models.find(m => m.id === modelId);
  if (!model) return false;
  if (model.provider === 'google') return Boolean(googleKey.trim());
  if (model.provider === 'openai') return Boolean(openAIKey.trim());
  if (model.provider === 'anthropic') return Boolean(anthropicKey.trim());
  if (model.provider === 'youtube') return Boolean(googleUser);
  return false;
};
