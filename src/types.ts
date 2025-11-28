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
  LOADING_FFMPEG = 'LOADING_FFMPEG',
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
  font?: string; // New property for font class
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
  provider: 'google' | 'openai' | 'youtube';
  transcriptionModel?: string;
  rateLimits?: GeminiRateLimits; // New property for Dynamic Limits
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
  availableResolutions?: number[]; // Added resolutions
  isOAuthFlow?: boolean; 
}

export interface YouTubeCaptionTrack {
  id: string; // Can be a base64 token (yt-dlp) or an API ID (OAuth)
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

// --- NEW DRIVE TYPES ---
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
  children: DriveFolder[]; // For hierarchy
  filesLoaded: boolean; // Has this folder been fetched?
}

// -----------------------

export const AVAILABLE_MODELS: AIModel[] = [
  // --- SPECIAL TOOLS ---
  {
    id: 'youtube-auto',
    name: 'YouTube Auto-Caption',
    description: 'Uploads video to YouTube (Unlisted) to generate captions via Google speech recognition. Best for free, high-accuracy transcription.',
    tags: ['Free', 'Cloud', 'Transcription Only'],
    provider: 'youtube',
  },

  // --- GOOGLE MODELS (Version Descending) ---
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3.0 Pro',
    description: 'Highest reasoning capability. Best for complex dialogue, cultural nuances, and context retention.',
    tags: ['Preview', 'Slower', 'Most Powerful'],
    provider: 'google',
    rateLimits: {
        // Free tier not available for 3.0 Pro in provided images
        tier1: 50,
        tier2: 1000,
        tier3: 2000
    }
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Balanced performance with advanced reasoning capabilities. Great for most subtitles.',
    tags: ['Stable', 'High Quality'],
    provider: 'google',
    rateLimits: {
        free: 2,
        tier1: 150,
        tier2: 1000,
        tier3: 2000
    }
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Next-generation high-speed model. Ideal for large files and quick turnaround.',
    tags: ['Stable', 'Ultra Fast'],
    provider: 'google',
    rateLimits: {
        free: 10,
        tier1: 1000,
        tier2: 2000,
        tier3: 10000
    }
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    description: 'Cost-optimized version of 2.5 Flash. Extremely fast and affordable for high volume.',
    tags: ['Lite', 'Economy'],
    provider: 'google',
    rateLimits: {
        free: 15,
        tier1: 4000,
        tier2: 10000,
        tier3: 30000
    }
  },
  {
    id: 'gemini-2.0-pro',
    name: 'Gemini 2.0 Pro',
    description: 'Previous generation high-intelligence model. Reliable for standard translation tasks.',
    tags: ['Stable', 'Smart'],
    provider: 'google',
    // Values inferred from 2.5 Pro as safe fallback since 2.0 Pro wasn't explicitly in images but exists in legacy code
    rateLimits: {
        free: 2,
        tier1: 60, 
        tier2: 1000,
        tier3: 2000
    }
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Optimized for speed and efficiency. Good for straightforward content and quick results.',
    tags: ['Stable', 'Efficient'],
    provider: 'google',
    rateLimits: {
        free: 15,
        tier1: 2000,
        tier2: 10000,
        tier3: 30000
    }
  },
  {
    id: 'gemini-2.0-flash-lite-preview-02-05',
    name: 'Gemini 2.0 Flash Lite',
    description: 'The most cost-effective model in the 2.0 family. Good balance of speed and quality.',
    tags: ['Preview', 'Lite', 'Budget'],
    provider: 'google',
    rateLimits: {
        free: 30,
        tier1: 4000,
        tier2: 20000,
        tier3: 30000
    }
  },

  // --- OPENAI MODELS (Version Descending) ---
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    description: 'The latest iteration, offering cutting-edge performance and multimodal capabilities.',
    tags: ['Bleeding-Edge', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-5-pro',
    name: 'GPT-5 Pro',
    description: 'A professional-grade model from the GPT-5 series with top-tier reasoning.',
    tags: ['Pro', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'The foundational next-gen model for advanced understanding and generation.',
    tags: ['Next-Gen', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'A balanced and efficient model from the GPT-5 series, ideal for speed.',
    tags: ['Fast', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    description: 'The most compact and fastest model in the GPT-5 family for lightweight tasks.',
    tags: ['Ultra-Fast', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    description: 'An enhanced version of GPT-4 with improved speed and context handling.',
    tags: ['Advanced', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    description: 'A faster, more efficient variant of the GPT-4.1 architecture.',
    tags: ['Efficient', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    description: 'The smallest and quickest model from the GPT-4.1 series for rapid responses.',
    tags: ['Fast', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: "OpenAI's flagship Omni model. Excellent for nuanced understanding and generation.",
    tags: ['Flagship', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'A smaller, faster, and more affordable version of GPT-4o with strong performance.',
    tags: ['Fast', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
];


export const LANGUAGES: LanguageOption[] = [
  { code: 'ar', name: 'Arabic' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fa', name: 'Persian', font: 'font-vazirmatn' }, 
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
];

export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4', 
  'video/x-matroska', // MKV
  'video/quicktime', // MOV
  'video/x-ms-wmv', // WMV
  'video/webm',
  'video/x-msvideo', // AVI
];

export type RPMLimit = number | 'unlimited';

// Used for OpenAI Only
export const OPENAI_RPM_OPTIONS: { value: RPMLimit; label: string; description: string }[] = [
    { value: 2, label: 'Low', description: 'Best for avoiding strict rate limits on free tiers (2 RPM).' },
    { value: 15, label: 'Medium', description: 'Recommended default. Good balance of speed and safety (15 RPM).' },
    { value: 30, label: 'High', description: 'Faster, but higher risk of rate limits (30 RPM).' },
    { value: 'unlimited', label: 'Unlimited', description: 'No artificial delay. Only for high-tier paid keys.' },
];