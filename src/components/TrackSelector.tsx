import React from 'react';
import { Bot, FileText, Youtube } from 'lucide-react';
import { ExtractedSubtitleTrack } from '../types';

interface TrackSelectorProps {
  tracks: ExtractedSubtitleTrack[];
  onSelectTrack: (trackIndex: number) => void;
  onGenerate: () => void;
  onGenerateYouTube: () => void;
  isYouTubeAuthenticated: boolean;
}

export const TrackSelector: React.FC<TrackSelectorProps> = ({ tracks, onSelectTrack, onGenerate, onGenerateYouTube, isYouTubeAuthenticated }) => {
  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-xl font-bold text-white text-center">Subtitle Source</h2>
      <p className="text-center text-neutral-400 -mt-4">Choose an existing track or generate new subtitles.</p>
      
      <div className="space-y-3">
        {/* AI Generation Option */}
        <button 
          onClick={onGenerate}
          className="w-full flex items-center gap-4 p-4 rounded-xl border border-neutral-700 bg-neutral-900/50 hover:bg-neutral-800/50 hover:border-white transition-all text-left"
        >
          <div className="w-10 h-10 bg-indigo-900/50 border border-indigo-700/50 rounded-lg flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h3 className="font-bold text-white">Generate with AI Model</h3>
            <p className="text-xs text-neutral-400">Uses the selected AI model (e.g., Gemini, GPT). Requires an API key.</p>
          </div>
        </button>

        {/* YouTube Generation Option */}
        <button 
          onClick={onGenerateYouTube}
          disabled={!isYouTubeAuthenticated}
          className="w-full flex items-center gap-4 p-4 rounded-xl border border-neutral-700 bg-neutral-900/50 hover:bg-neutral-800/50 hover:border-white transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="w-10 h-10 bg-red-900/50 border border-red-700/50 rounded-lg flex items-center justify-center shrink-0">
            <Youtube className="w-5 h-5 text-red-300" />
          </div>
          <div>
            <h3 className="font-bold text-white">Generate with YouTube</h3>
            <p className="text-xs text-neutral-400">Uploads video as 'unlisted' to your YouTube account to generate free captions.</p>
          </div>
        </button>

        {/* Existing Tracks */}
        {tracks.map((track) => (
          <button 
            key={track.index}
            onClick={() => onSelectTrack(track.index)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-900/20 hover:bg-neutral-800/50 hover:border-neutral-600 transition-all text-left"
          >
            <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-neutral-300" />
            </div>
            <div>
              <h3 className="font-bold text-white">{track.title}</h3>
              <p className="text-xs text-neutral-500 uppercase">{track.language}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};