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
}


export interface LanguageOption {
  code: string;
  name: string;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
  tags: string[];
  provider: 'google' | 'openai';
  transcriptionModel?: string; // Specific model for transcription, e.g., 'whisper-1'
}

export const AVAILABLE_MODELS: AIModel[] = [
  // Google Models
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    description: 'Highest reasoning capability. Best for complex dialogue, cultural nuances, and context retention.',
    tags: ['Best Quality', 'Slower'],
    provider: 'google',
  },
  {
    id: 'gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro',
    description: 'Balanced performance with advanced reasoning capabilities. Great for most subtitles.',
    tags: ['Balanced', 'High Quality'],
    provider: 'google',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Next-generation high-speed model. Ideal for large files and quick turnaround.',
    tags: ['Ultra Fast', 'New'],
    provider: 'google',
  },
  {
    id: 'gemini-2.0-pro-exp-02-05',
    name: 'Gemini 2.0 Pro',
    description: 'Previous generation high-intelligence model. Reliable for standard translation tasks.',
    tags: ['Reliable', 'Smart'],
    provider: 'google',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Optimized for speed and efficiency. Good for straightforward content and quick results.',
    tags: ['Fast', 'Efficient'],
    provider: 'google',
  },
  // OpenAI Models (Sorted from Newest/Most Advanced to Efficient)
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
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fa', name: 'Persian' },
];

export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4', 
  'video/x-matroska', // MKV
  'video/quicktime', // MOV
  'video/x-ms-wmv', // WMV
  'video/webm',
  'video/x-msvideo', // AVI
];

export type RPMLimit = 2 | 15 | 30 | 'unlimited';

export const RPM_OPTIONS: { value: RPMLimit; label: string; description: string }[] = [
    { value: 2, label: 'Low', description: 'Best for avoiding strict rate limits on free tiers (2 RPM).' },
    { value: 15, label: 'Medium', description: 'Recommended default. Good balance of speed and safety (15 RPM).' },
    { value: 30, label: 'High', description: 'Faster, but higher risk of rate limits (30 RPM).' },
    { value: 'unlimited', label: 'Unlimited', description: 'No artificial delay. Only for high-tier paid keys.' },
];