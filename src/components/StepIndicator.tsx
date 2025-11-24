
import React from 'react';

interface StepIndicatorProps {
  number: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ number, title, isActive, isCompleted }) => {
  return (
    <div className={`flex items-center gap-3 ${isActive ? 'opacity-100' : 'opacity-40'} transition-opacity duration-300`}>
      <div className={`
        flex items-center justify-center w-8 h-8 rounded-full border text-sm font-bold transition-all
        ${isActive || isCompleted ? 'bg-white text-black border-white' : 'bg-transparent text-white border-neutral-700'}
      `}>
        {isCompleted ? '✓' : number}
      </div>
      <span className="text-sm font-medium tracking-wide uppercase">{title}</span>
    </div>
  );
};