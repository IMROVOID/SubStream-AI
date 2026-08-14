export interface SubtitleNode {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
  originalText?: string; 
}

export interface ExtractedSubtitleTrack {
  index: number;
  language: string;
  title: string;
}

export enum TranslationStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  TRANSLATING = 'TRANSLATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum VideoProcessingStatus {
  IDLE = 'IDLE',
  INITIALIZING_ENGINE = 'INITIALIZING_ENGINE',
  ANALYZING = 'ANALYZING',
  EXTRACTING_AUDIO = 'EXTRACTING_AUDIO',
  TRANSCRIBING = 'TRANSCRIBING',
  EXTRACTING_SUBTITLES = 'EXTRACTING_SUBTITLES',
  MUXING = 'MUXING',
  DONE = 'DONE',
  ERROR = 'ERROR',
  // YouTube Specific Statuses
  UPLOADING_TO_YOUTUBE = 'UPLOADING_TO_YOUTUBE',
  AWAITING_YOUTUBE_CAPTIONS = 'AWAITING_YOUTUBE_CAPTIONS',
  DOWNLOADING_FROM_URL = 'DOWNLOADING_FROM_URL',
  FETCHING_YOUTUBE_INFO = 'FETCHING_YOUTUBE_INFO',
  DOWNLOADING_VIDEO = 'DOWNLOADING_VIDEO',
}

export interface LanguageOption {
  code: string;
  name: string;
  font?: string;
}

export interface GeminiRateLimits {
  free?: number;
  tier1: number;
  tier2: number;
  tier3: number;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
  tags: string[];
  provider: 'google' | 'openai' | 'youtube' | 'anthropic';
  transcriptionModel?: string;
  rateLimits?: GeminiRateLimits;
  contextLength?: number;
  releaseDate?: string;
  docUrl?: string;
  isDynamic?: boolean;
}

export interface YouTubeVideoMetadata {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  duration?: string;
  videoUrl: string; 
  availableCaptions?: YouTubeCaptionTrack[];
  availableResolutions?: number[];
  isOAuthFlow?: boolean; 
}

export interface YouTubeCaptionTrack {
  id: string;
  language: string;
  name: string;
}

export interface YouTubeUserVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  duration: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  iconLink?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  fileExtension?: string; 
  videoMediaMetadata?: {
    width: number;
    height: number;
    durationMillis: number;
  };
  shortcutDetails?: {
    targetId: string;
    targetMimeType: string;
  };
}

export interface DriveFolder {
  id: string;
  name: string;
  children: DriveFolder[];
  filesLoaded: boolean;
}

export type RPMLimit = number | 'custom' | 'unlimited';
