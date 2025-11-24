
export interface SubtitleNode {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
  originalText?: string; // To store the source while 'text' becomes the translation
}

export interface ProcessingStats {
  totalLines: number;
  processedLines: number;
  isProcessing: boolean;
  startTime?: number;
}

export enum TranslationStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  TRANSLATING = 'TRANSLATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
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
}

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    description: 'Highest reasoning capability. Best for complex dialogue, cultural nuances, and context retention.',
    tags: ['Best Quality', 'Slower']
  },
  {
    id: 'gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro',
    description: 'Balanced performance with advanced reasoning capabilities. Great for most subtitles.',
    tags: ['Balanced', 'High Quality']
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Next-generation high-speed model. Ideal for large files and quick turnaround.',
    tags: ['Ultra Fast', 'New']
  },
  {
    id: 'gemini-2.0-pro-exp-02-05',
    name: 'Gemini 2.0 Pro',
    description: 'Previous generation high-intelligence model. Reliable for standard translation tasks.',
    tags: ['Reliable', 'Smart']
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Optimized for speed and efficiency. Good for straightforward content and quick results.',
    tags: ['Fast', 'Efficient']
  }
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