import React from 'react';
import { Bot, FileText, Youtube, Sparkles, Languages, ArrowRight } from 'lucide-react';
import { ExtractedSubtitleTrack, AIModel, LANGUAGES } from '../types';

interface TrackSelectorProps {
  tracks: ExtractedSubtitleTrack[];
  onSelectTrack: (trackIndex: number) => void;
  onGenerate: () => void;
  activeModel: AIModel;
  isYouTubeAuthenticated: boolean;
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  targetLang: string;
  setTargetLang: (lang: string) => void;
}

export const TrackSelector: React.FC<TrackSelectorProps> = ({ 
  tracks, 
  onSelectTrack, 
  onGenerate, 
  activeModel,
  isYouTubeAuthenticated,
  sourceLang,
  setSourceLang,
  targetLang,
  setTargetLang
}) => {
  
  const isYouTubeModel = activeModel.provider === 'youtube';

  return (
    <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white">Configuration</h2>
        <p className="text-neutral-400">
          Configure languages before generating subtitles with <strong>{activeModel.name}</strong>.
        </p>
      </div>

      {/* Language Configuration Card */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-6 space-y-6">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source Language */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                    <Languages className="w-3 h-3" /> Audio Language
                </label>
                <div className="relative">
                    <select 
                        className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors"
                        value={sourceLang} 
                        onChange={(e) => setSourceLang(e.target.value)}
                    >
                        <option value="auto">✨ Auto Detect</option>
                        {LANGUAGES.map(l => <option key={`src-${l.code}`} value={l.name}>{l.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Target Language */}
            <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                    <ArrowRight className="w-3 h-3" /> Translate To
                </label>
                <div className="relative">
                    <select 
                        className="w-full appearance-none bg-black border border-neutral-800 text-white px-4 py-3 rounded-xl focus:border-white focus:outline-none transition-colors"
                        value={targetLang} 
                        onChange={(e) => setTargetLang(e.target.value)}
                    >
                        {LANGUAGES.map(l => <option key={`tgt-${l.code}`} value={l.name}>{l.name}</option>)}
                    </select>
                </div>
            </div>
         </div>

         {/* Unified Generation Button */}
        <button 
          onClick={onGenerate}
          className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left group
            ${isYouTubeModel 
                ? 'bg-red-900/10 border-red-900/30 hover:bg-red-900/20 hover:border-red-500/50' 
                : 'bg-indigo-900/10 border-indigo-900/30 hover:bg-indigo-900/20 hover:border-indigo-500/50'}
          `}
        >
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-colors
             ${isYouTubeModel ? 'bg-red-900/20 text-red-500' : 'bg-indigo-900/20 text-indigo-400'}
          `}>
            {isYouTubeModel ? <Youtube className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <h3 className={`font-bold flex items-center gap-2 ${isYouTubeModel ? 'text-red-100' : 'text-indigo-100'}`}>
              Start Processing
              {isYouTubeModel && !isYouTubeAuthenticated && (
                  <span className="text-[10px] uppercase bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">Auth Required</span>
              )}
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              {isYouTubeModel 
                ? "Uploads unlisted to YouTube -> Transcribes -> Translates." 
                : `Extracts Audio -> Transcribes (${sourceLang === 'auto' ? 'Auto' : sourceLang}) -> Translates to ${targetLang}.`}
            </p>
          </div>
        </button>
      </div>

      {/* Divider if tracks exist */}
      {tracks.length > 0 && (
            <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-800"></span></div>
                <div className="relative flex justify-center"><span className="bg-neutral-900 px-3 text-xs text-neutral-500 uppercase">Or use embedded track</span></div>
            </div>
      )}

      {/* Existing Tracks */}
      {tracks.length > 0 && (
          <div className="space-y-3">
            {tracks.map((track) => (
            <button 
                key={track.index}
                onClick={() => onSelectTrack(track.index)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-900/20 hover:bg-neutral-800/50 hover:border-neutral-600 transition-all text-left"
            >
                <div className="w-12 h-12 bg-neutral-800 rounded-lg flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-neutral-400" />
                </div>
                <div>
                <h3 className="font-bold text-white">{track.title || `Subtitle Track ${track.index}`}</h3>
                <p className="text-xs text-neutral-500 uppercase mt-0.5">Language: {track.language}</p>
                </div>
            </button>
            ))}
          </div>
      )}
    </div>
  );
};