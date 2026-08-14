import React from 'react';

interface StepIndicatorProps {
  number: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ number, title, isActive, isCompleted }) => {
  return (
    <div className={`
      flex flex-col items-center gap-2 w-20 text-center
      lg:flex-row lg:w-auto lg:text-left lg:gap-3
      ${isActive ? 'opacity-100' : 'opacity-40'} transition-opacity duration-300
    `}>
      <div className={`
        flex items-center justify-center w-8 h-8 rounded-full border text-sm font-bold transition-all shrink-0
        ${isActive || isCompleted ? 'bg-white text-black border-white' : 'bg-transparent text-white border-neutral-700'}
      `}>
        {isCompleted ? '✓' : number}
      </div>
      <span className="text-xs lg:text-sm font-medium tracking-wide uppercase">{title}</span>
    </div>
  );
};