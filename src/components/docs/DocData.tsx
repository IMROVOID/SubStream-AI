import React from 'react';
import { AlertCircle, Cpu, Layers, Key, Gauge, Youtube, Link as LinkIcon, Globe, HardDrive, Settings, Upload } from 'lucide-react';

export interface DocItem {
  id: string;
  title: string;
  category: string;
  content: React.ReactNode;
}

export const DOCS_DATA: DocItem[] = [
  // --- GENERAL ---
  {
    id: 'intro',
    title: 'Getting Started',
    category: 'General',
    content: (
      <div className="space-y-6">
        <p className="text-lg leading-relaxed text-neutral-300">
          SubStream AI is a next-generation subtitle translation and generation tool. 
          It bridges the gap between raw video and global accessibility using <strong className="text-white">Google Gemini</strong> for context-aware translation and <strong className="text-white">YouTube AI</strong> for high-accuracy speech-to-text.
        </p>
        
        <div className="p-6 bg-neutral-900/40 rounded-2xl border border-neutral-800">
          <h3 className="text-xl font-bold text-white mb-4">Quick Start</h3>
          <ol className="relative border-l border-neutral-800 ml-3 space-y-6">
            <li className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-neutral-600 rounded-full ring-4 ring-neutral-900"></span>
              <h4 className="font-bold text-white text-sm">Import Media</h4>
              <p className="text-neutral-400 text-sm">Upload a local file, paste a URL, import from Google Drive, or browse your YouTube channel.</p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-neutral-600 rounded-full ring-4 ring-neutral-900"></span>
              <h4 className="font-bold text-white text-sm">Configure AI</h4>
              <p className="text-neutral-400 text-sm">Select <strong>Gemini</strong> for translation or <strong>YouTube Auto-Caption</strong> for generating subtitles from scratch.</p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 bg-green-500 rounded-full ring-4 ring-neutral-900"></span>
              <h4 className="font-bold text-white text-sm">Process & Download</h4>
              <p className="text-neutral-400 text-sm">Review the side-by-side preview, then download the SRT file or the video with burned-in subtitles.</p>
            </li>
          </ol>
        </div>
      </div>
    )
  },
  {
    id: 'file-sources',
    title: 'Supported Sources',
    category: 'General',
    content: (
      <div className="space-y-6">
        <p>SubStream AI supports various input methods:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-neutral-800/20 border border-neutral-800 rounded-xl hover:bg-neutral-800/30 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <Upload className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-bold uppercase text-neutral-400">Local Files</span>
            </div>
            <p className="text-sm text-neutral-300">Drag & drop or browse <code>.srt</code>, <code>.vtt</code>, or video files (<code>.mp4</code>, <code>.mkv</code>, etc.) directly from your device.</p>
          </div>
          <div className="p-5 bg-neutral-800/20 border border-neutral-800 rounded-xl hover:bg-neutral-800/30 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-bold uppercase text-neutral-400">Import from URL</span>
            </div>
            <p className="text-sm text-neutral-300">Paste direct links to <code>.mp4</code>, <code>.mkv</code>, or <code>.srt</code> files. We use a smart proxy to bypass CORS restrictions.</p>
          </div>
          <div className="p-5 bg-neutral-800/20 border border-neutral-800 rounded-xl hover:bg-neutral-800/30 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <Youtube className="w-5 h-5 text-red-500" />
              <span className="text-sm font-bold uppercase text-neutral-400">YouTube Import</span>
            </div>
            <p className="text-sm text-neutral-300">Browse your own channel or paste a public video URL to extract existing captions.</p>
          </div>
          <div className="p-5 bg-neutral-800/20 border border-neutral-800 rounded-xl hover:bg-neutral-800/30 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <HardDrive className="w-5 h-5 text-green-500" />
              <span className="text-sm font-bold uppercase text-neutral-400">Google Drive</span>
            </div>
            <p className="text-sm text-neutral-300">Directly browse and import video or subtitle files from your personal Google Drive storage.</p>
          </div>
        </div>
      </div>
    )
  },

  // --- INTEGRATIONS ---
  {
    id: 'google-drive',
    title: 'Google Drive Integration',
    category: 'Integrations',
    content: (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <HardDrive className="w-8 h-8 text-green-500" />
          <h3 className="text-2xl font-bold text-white">Cloud Import</h3>
        </div>
        <p>
          You can import videos or subtitle files directly from your Google Drive without downloading them to your device first.
        </p>
        
        <div className="space-y-4 border-l-2 border-green-900/50 pl-6">
          <div>
            <h4 className="font-bold text-white">Permissions:</h4>
            <p className="text-sm text-neutral-400 mt-1">
              We request the <code>drive.readonly</code> scope. This means SubStream AI can <strong>only view</strong> your files. We cannot delete, edit, or upload files to your Drive.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-white">How it works:</h4>
            <ol className="list-decimal list-inside text-sm text-neutral-400 mt-2 space-y-2">
              <li>Authenticate with your Google Account.</li>
              <li>Browse your folder hierarchy in our file explorer.</li>
              <li>Select a video or SRT file.</li>
              <li>The file is streamed securely through our local proxy directly to the application.</li>
            </ol>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'youtube-auto-caption',
    title: 'YouTube Auto-Caption',
    category: 'Integrations',
    content: (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Youtube className="w-8 h-8 text-red-500" />
          <h3 className="text-2xl font-bold text-white">Free AI Transcription</h3>
        </div>
        <p>
          We leverage YouTube's powerful speech recognition engine to generate subtitles for your local videos for free.
        </p>
        
        <div className="space-y-4 border-l-2 border-red-900/50 pl-6">
          <div>
            <h4 className="font-bold text-white">How it works:</h4>
            <ol className="list-decimal list-inside text-sm text-neutral-400 mt-2 space-y-2">
              <li>You authenticate with your Google Account.</li>
              <li>We upload your video to your channel as <strong>Unlisted</strong> (private to you).</li>
              <li>We poll YouTube's servers until they generate the automatic captions (ASR).</li>
              <li>We download the captions and delete the temp data from our interface.</li>
            </ol>
          </div>
          
          <div className="p-4 bg-red-950/30 rounded-lg border border-red-900/50 text-red-200 text-sm">
            <strong className="block mb-1">Quota Warning:</strong>
            YouTube limits uploads to approx. 6 videos per day for unverified API projects. If you see a "Quota Exceeded" error, please wait 24 hours or switch to an OpenAI/Gemini model.
          </div>
        </div>
      </div>
    )
  },
  
  // --- SETUP ---
  {
    id: 'api-config',
    title: 'Model & API Config',
    category: 'Setup',
    content: (
      <div className="space-y-4">
        <p>SubStream AI supports using your own Google Gemini API Key and selecting different AI models.</p>
        
        <div className="flex items-start gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 mt-4">
          <Cpu className="w-6 h-6 text-green-400 shrink-0 mt-1" />
          <div>
            <h4 className="font-bold text-white">Dynamic Model Discovery & Selection</h4>
            <p className="text-sm text-neutral-400 mt-2 mb-3">
              Click the Model Name in the top right of the navigation bar to open the Configuration overlay.
              SubStream AI automatically fetches and updates the list of latest frontier models (Google Gemini, OpenAI GPT, Anthropic Claude) via free public API endpoints (OpenRouter & LiteLLM) without requiring any API keys or account signups. Deprecated models are automatically removed from the list.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 mt-4">
          <Key className="w-6 h-6 text-green-400 shrink-0 mt-1" />
          <div>
            <h4 className="font-bold text-white">Using Custom API Keys</h4>
            <p className="text-sm text-neutral-400 mt-2 mb-3">
              In the same Configuration overlay, paste your key starting with <code>AIzaSy...</code> or <code>sk-...</code>.
            </p>
            <ul className="list-disc list-inside text-xs text-neutral-500 space-y-1">
              <li>Your key is stored in your browser's local storage.</li>
              <li>It is never sent to our servers, only directly to AI APIs.</li>
            </ul>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'rate-limits',
    title: 'Rate Limits & RPM',
    category: 'Setup',
    content: (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Gauge className="w-6 h-6 text-yellow-400" />
          <h3 className="text-xl font-bold text-white">Managing API Limits</h3>
        </div>
        <p>
          AI providers limit how many requests you can make per minute (RPM). SubStream AI includes a dynamic rate limiter to prevent errors.
        </p>

        <div className="space-y-4">
          <div className="p-4 bg-neutral-800 rounded-xl border border-neutral-700">
            <h4 className="font-bold text-white mb-2">Google Gemini Tiers</h4>
            <p className="text-sm text-neutral-400 mb-3">
              Google AI Studio has different limits based on whether you are on the Free tier or a Pay-as-you-go tier. You can select your tier in the settings menu.
            </p>
            <ul className="grid grid-cols-2 gap-2 text-xs text-neutral-300">
              <li className="bg-black/40 p-2 rounded"><strong>Free:</strong> ~2-15 RPM (Slowest)</li>
              <li className="bg-black/40 p-2 rounded"><strong>Tier 1:</strong> ~50-100 RPM</li>
              <li className="bg-black/40 p-2 rounded"><strong>Tier 2:</strong> ~1000 RPM</li>
              <li className="bg-black/40 p-2 rounded"><strong>Tier 3:</strong> High Volume</li>
            </ul>
          </div>

          <div className="p-4 bg-neutral-800 rounded-xl border border-neutral-700">
            <h4 className="font-bold text-white mb-2">OpenAI & Anthropic Settings</h4>
            <p className="text-sm text-neutral-400">
              For OpenAI and Anthropic Claude models, you can manually select Low, Medium, High, or Unlimited RPM based on your account's usage tier.
            </p>
          </div>
        </div>
      </div>
    )
  },

  // --- FEATURES ---
  {
    id: 'context-aware',
    title: 'Context Awareness',
    category: 'Features',
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-indigo-400" />
          <h3 className="text-xl font-bold text-white">Smart Batching</h3>
        </div>
        <p>
          Standard translators translate one line at a time, often resulting in broken sentences when a speaker's thought spans multiple subtitles.
        </p>
        <div className="p-4 bg-indigo-900/10 border border-indigo-900/30 rounded-xl">
          <h4 className="font-bold text-indigo-300 mb-2">How we improve accuracy:</h4>
          <p className="text-sm text-neutral-300 leading-relaxed">
            <strong>SubStream AI</strong> groups subtitles into "Semantic Batches" (typically 10 lines). It sends the entire batch to the AI model with instructions to:
          </p>
          <ul className="space-y-1 list-disc list-inside text-neutral-300 text-sm mt-2">
            <li>Read previous and next lines before translating.</li>
            <li>Maintain consistent terminology for names and places.</li>
            <li>Respect gender and formality nuances (e.g., differentiating "You" in Romance languages).</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 'translation-languages',
    title: 'Translation Languages',
    category: 'Features',
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-blue-400" />
          <h3 className="text-xl font-bold text-white">Source & Target</h3>
        </div>
        <p>
          We support over 30 languages. You can configure these in the main dashboard before starting the process.
        </p>
        <ul className="space-y-4 mt-2">
          <li className="p-3 bg-neutral-900/50 rounded-lg border border-neutral-800">
            <strong className="text-white block mb-1">Source Language (Input)</strong>
            <p className="text-sm text-neutral-400">
              We recommend setting this to <strong>"Auto Detect"</strong>. The AI is generally excellent at identifying the spoken language. However, if the audio has mixed languages or strong accents, manually selecting the language improves accuracy.
            </p>
          </li>
          <li className="p-3 bg-neutral-900/50 rounded-lg border border-neutral-800">
            <strong className="text-white block mb-1">Target Language (Output)</strong>
            <p className="text-sm text-neutral-400">
              Select the language you want your subtitles to be translated into. This setting controls the system prompt sent to the AI.
            </p>
          </li>
        </ul>
      </div>
    )
  },

  // --- SUPPORT ---
  {
    id: 'common-errors',
    title: 'Common Errors',
    category: 'Support',
    content: (
      <div className="space-y-6">
        <p>If you encounter issues, check the error code or message displayed.</p>

        <div className="space-y-4">
          <div className="flex gap-4 p-4 bg-red-950/20 border border-red-900/30 rounded-xl">
            <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <h4 className="text-red-200 font-bold">YouTube Quota Exceeded (403)</h4>
              <p className="text-sm text-red-200/70 mt-1">
                You have uploaded too many videos today using the Auto-Caption feature. This is a limit set by Google.
              </p>
              <div className="mt-3 p-2 bg-black/40 rounded text-xs font-mono text-red-300">
                Fix: Switch to a Gemini/OpenAI model for transcription or wait 24 hours.
              </div>
            </div>
          </div>
           
          <div className="flex gap-4 p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl">
            <LinkIcon className="w-6 h-6 text-blue-400 shrink-0" />
            <div>
              <h4 className="text-white font-bold">Import URL Failed</h4>
              <p className="text-sm text-neutral-400 mt-1">
                If importing a direct URL fails, the server might be blocking automated requests. We automatically retry using a proxy, but some secure links (like expired S3 links) cannot be accessed.
              </p>
            </div>
          </div>

          <div className="flex gap-4 p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl">
            <Settings className="w-6 h-6 text-yellow-400 shrink-0" />
            <div>
              <h4 className="text-white font-bold">Drive: Access Denied / API Not Enabled</h4>
              <p className="text-sm text-neutral-400 mt-1">
                If you see an error listing Drive files, ensure the <strong>Google Drive API</strong> is enabled in your Google Cloud Console for the associated Client ID project, or that you are not blocking third-party cookies required for the authentication popup.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }
];
