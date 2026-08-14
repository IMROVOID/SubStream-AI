import { AIModel } from '../types';

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

  // --- ANTHROPIC CLAUDE MODELS (Version Descending) ---
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    description: 'Highest reasoning capability for complex, long-context subtitles and nuanced cultural translation.',
    tags: ['Opus', 'Most Powerful', 'Anthropic'],
    provider: 'anthropic',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    description: 'Flagship balanced model delivering exceptional speed, intelligence, and translation precision.',
    tags: ['Sonnet', 'Flagship', 'Anthropic'],
    provider: 'anthropic',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet',
    description: 'High-performance reasoning and hybrid thinking model for accurate subtitle translation.',
    tags: ['Hybrid Thinking', 'Stable', 'Anthropic'],
    provider: 'anthropic',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Industry-standard model for high-speed, highly accurate translation and nuance.',
    tags: ['Sonnet', 'Popular', 'Anthropic'],
    provider: 'anthropic',
    transcriptionModel: 'whisper-1'
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest, lightweight Claude model ideal for rapid, high-volume subtitle processing.',
    tags: ['Haiku', 'Ultra Fast', 'Anthropic'],
    provider: 'anthropic',
    transcriptionModel: 'whisper-1'
  },
];

export const OPENAI_RPM_OPTIONS: { value: number | 'custom'; label: string; description: string }[] = [
  { value: 2, label: 'Low', description: 'Best for avoiding strict rate limits on free tiers (2 RPM).' },
  { value: 15, label: 'Medium', description: 'Recommended default. Good balance of speed and safety (15 RPM).' },
  { value: 30, label: 'High', description: 'Faster, but higher risk of rate limits (30 RPM).' },
  { value: 'custom', label: 'Custom', description: 'Specify a custom Requests Per Minute (RPM) limit.' },
];

export const ANTHROPIC_RPM_OPTIONS: { value: number | 'custom'; label: string; description: string }[] = [
  { value: 5, label: 'Low', description: 'Safe limit for initial Anthropic tier (5 RPM).' },
  { value: 20, label: 'Medium', description: 'Recommended default for Anthropic Build tier (20 RPM).' },
  { value: 50, label: 'High', description: 'Faster throughput for Scale tier users (50 RPM).' },
  { value: 'custom', label: 'Custom', description: 'Specify a custom Requests Per Minute (RPM) limit.' },
];
