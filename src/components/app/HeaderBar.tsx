import React from 'react';
import { BookText, Cpu } from 'lucide-react';
import { AIModel } from '../../types';

interface HeaderBarProps {
  onGoToDocs: () => void;
  onOpenConfig: () => void;
  activeModelData: AIModel | null;
  hasProAccess: boolean;
  remainingQuota: number;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onGoToDocs,
  onOpenConfig,
  activeModelData,
  hasProAccess,
  remainingQuota
}) => {
  return (
    <nav className="relative z-20 border-b border-neutral-900 bg-black/80 backdrop-blur-xl sticky top-0 transition-all">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => window.location.reload()}>
          <span className="font-display font-bold text-lg tracking-tight">
            SubStream <span className="text-neutral-600 font-sans font-normal text-sm ml-2">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-6 text-sm font-medium text-neutral-400">
          <button onClick={onGoToDocs} className="hidden md:block hover:text-white transition-colors focus:outline-none">
            Documentation
          </button>
          <button 
            onClick={onGoToDocs} 
            className="p-2 rounded-full hover:bg-neutral-800 transition-colors group md:hidden" 
            aria-label="Documentation"
          >
            <BookText className="w-5 h-5 text-neutral-400 group-hover:text-white" />
          </button>
          <button 
            onClick={onOpenConfig} 
            className={`flex items-center gap-1.5 md:gap-3 pl-2 md:pl-3 pr-1.5 md:pr-2 py-1 md:py-1.5 rounded-xl border transition-all group ${
              !activeModelData
                ? 'bg-amber-950/20 border-amber-900/40 hover:border-amber-700/60'
                : hasProAccess 
                ? 'bg-neutral-900/50 border-neutral-800 hover:border-white/30' 
                : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-600'
            }`}
          >
            <div className="text-xs text-right max-w-[125px] sm:max-w-[200px] md:max-w-none leading-tight min-w-0">
              <div className="font-bold text-white truncate whitespace-nowrap">
                {activeModelData ? activeModelData.name : 'No Method Selected'}
              </div>
              <div className={`text-[10px] uppercase truncate whitespace-nowrap ${
                !activeModelData 
                  ? 'text-amber-400 font-semibold' 
                  : hasProAccess 
                  ? 'text-green-400' 
                  : 'text-neutral-500'
              }`}>
                {!activeModelData ? 'Setup Required' : hasProAccess ? 'Pro Access' : `${remainingQuota} Credits`}
              </div>
            </div>
            <div className={`w-8 h-8 rounded-full border relative flex items-center justify-center ${
              !activeModelData
                ? 'border-amber-900/50 bg-amber-900/20'
                : hasProAccess 
                ? 'border-green-900/50 bg-green-900/20' 
                : 'border-neutral-700 bg-neutral-800/50'
            }`}>
              <Cpu className={`w-4 h-4 ${
                !activeModelData 
                  ? 'text-amber-400' 
                  : hasProAccess 
                  ? 'text-green-400' 
                  : 'text-neutral-400 group-hover:text-white'
              }`} />
            </div>
          </button>
        </div>
      </div>
    </nav>
  );
};
