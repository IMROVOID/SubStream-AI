import React from 'react';

export interface SubtitleCue {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface PlayerSubtitleOverlayProps {
  activeCue: SubtitleCue | null;
  showControls: boolean;
  isPlaying: boolean;
  isResolving: boolean;
  resolveError: string | null;
  subtitleColor: 'white' | 'yellow';
  subtitleSize: 'small' | 'medium' | 'large' | 'xlarge';
  subtitleBg: 'dark' | 'solid' | 'semi' | 'none';
  subtitleOpacity: number;
}

export const PlayerSubtitleOverlay: React.FC<PlayerSubtitleOverlayProps> = ({
  activeCue,
  showControls,
  isPlaying,
  isResolving,
  resolveError,
  subtitleColor,
  subtitleSize,
  subtitleBg,
  subtitleOpacity
}) => {
  if (!activeCue || isResolving || resolveError) return null;

  return (
    <div 
      className={`absolute left-1/2 -translate-x-1/2 max-w-[85%] text-center pointer-events-none z-20 transition-all duration-300 ${
        showControls || !isPlaying ? 'bottom-14' : 'bottom-5'
      }`}
    >
      <span 
        className={`rounded-xl font-medium inline-block leading-relaxed font-vazirmatn transition-all duration-200 ${
          subtitleColor === 'yellow' ? 'text-yellow-300' : 'text-white'
        } ${
          subtitleSize === 'small' ? 'text-[11px] sm:text-sm md:text-base px-2 py-0.5 sm:px-3.5 sm:py-1.5' :
          subtitleSize === 'large' ? 'text-sm sm:text-lg md:text-xl px-3 py-1.5 sm:px-5 sm:py-2.5' :
          subtitleSize === 'xlarge' ? 'text-base sm:text-xl md:text-2xl px-4 py-2 sm:px-6 sm:py-3' :
          'text-xs sm:text-base md:text-lg px-2.5 py-1 sm:px-4 sm:py-2'
        } ${
          subtitleBg === 'solid' ? 'bg-black border border-white/10 shadow-2xl' :
          subtitleBg === 'semi' ? 'bg-black/50 backdrop-blur-sm border border-white/5' :
          subtitleBg === 'none' ? 'bg-transparent border-0 shadow-none [text-shadow:_0_2px_10px_rgba(0,0,0,1)]' :
          'bg-black/85 backdrop-blur-md border border-white/10 shadow-2xl'
        }`}
        style={{ 
          fontFamily: "'Vazirmatn', 'Inter', system-ui, sans-serif",
          opacity: subtitleOpacity 
        }}
      >
        {activeCue.text}
      </span>
    </div>
  );
};
