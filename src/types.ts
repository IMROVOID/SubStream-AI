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
  MUXING = 'MUXING', // Muxing is combining streams (video + new subtitles)
  DONE = 'DONE',
  ERROR = 'ERROR',
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
  // OpenAI Models
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: "OpenAI's flagship, most intelligent model. Excellent for nuanced understanding and generation.",
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
  {
    id: 'gpt-4.1-turbo',
    name: 'GPT-4.1 Turbo',
    description: 'A hypothetical faster and more capable version of GPT-4. (Not yet released)',
    tags: ['Hypothetical', 'OpenAI'],
    provider: 'openai',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'gpt-5-pro',
    name: 'GPT-5 Pro',
    description: 'A hypothetical next-gen model for unparalleled performance. (Not yet released)',
    tags: ['Experimental', 'OpenAI'],
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
    { value: 2, label: 'Low (2 RPM)', description: 'Best for avoiding strict rate limits on free tiers.' },
    { value: 15, label: 'Medium (15 RPM)', description: 'Recommended default. Good balance of speed and safety.' },
    { value: 30, label: 'High (30 RPM)', description: 'Faster, but higher risk of rate limits.' },
    { value: 'unlimited', label: 'Unlimited', description: 'No artificial delay. Only for high-tier paid keys.' },
];