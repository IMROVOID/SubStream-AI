import React from 'react';
import { SubtitleNode } from '../types';

interface SubtitleCardProps {
  subtitle: SubtitleNode;
  isActive?: boolean;
  isSingleColumn?: boolean;
  sourceFont?: string;
  targetFont?: string;
}

export const SubtitleCard: React.FC<SubtitleCardProps> = ({ subtitle, isActive, isSingleColumn, sourceFont, targetFont }) => {
  return (
    <div className={`group relative p-6 transition-all duration-300 border-b border-neutral-900 hover:bg-neutral-900/50 ${isActive ? 'bg-neutral-900' : ''}`}>
      <div className="flex items-start gap-4">
        {/* ID and Time */}
        <div className="w-24 shrink-0 flex flex-col gap-1">
          <span className="text-xs font-mono text-neutral-500">#{subtitle.id}</span>
          <span className="text-[10px] font-mono text-neutral-600 bg-neutral-900/50 px-1 py-0.5 rounded w-fit">
            {subtitle.startTime.split(',')[0]}
          </span>
        </div>

        {/* Content Grid */}
        <div className={`w-full ${isSingleColumn ? 'block' : 'grid grid-cols-1 md:grid-cols-2 gap-6'}`}>
          {/* Original */}
          <div className="relative">
            <p className={`font-medium leading-relaxed ${isSingleColumn ? 'text-white text-lg' : 'text-sm text-neutral-400'} ${sourceFont || 'font-sans'}`}>
              {subtitle.originalText}
            </p>
          </div>

          {/* Translated (Only show if not single column mode) */}
          {!isSingleColumn && (
              <div className="relative">
                <p className={`text-base font-medium leading-relaxed transition-colors duration-500 ${subtitle.text === subtitle.originalText ? 'text-neutral-600 italic' : 'text-white'} ${targetFont || 'font-display'}`}>
                  {subtitle.text === subtitle.originalText ? '(Pending...)' : subtitle.text}
                </p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};