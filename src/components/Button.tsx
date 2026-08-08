import React from 'react';
import { Loader2, Check } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  icon?: React.ReactNode;
  progress?: number; // 0 to 100
  statusText?: string; // Text to show next to percentage (e.g., "Downloading")
  completed?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  icon,
  className = '', 
  progress,
  statusText,
  completed,
  disabled,
  ...props 
}) => {
  const baseStyles = "relative inline-flex items-center justify-center font-semibold transition-all duration-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black overflow-hidden whitespace-nowrap px-[1.2rem] py-[0.8rem] text-[0.8rem]";
  
  const variants = {
    primary: "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white focus:ring-neutral-700 border border-neutral-800 hover:border-neutral-700",
    secondary: "bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white focus:ring-neutral-800 border border-neutral-800 hover:border-neutral-700",
    outline: "bg-transparent text-neutral-300 border border-neutral-800 hover:border-neutral-700 hover:text-white"
  };

  // If progress is active
  const isProgressActive = progress !== undefined && progress !== null && progress >= 0;

  return (
    <button 
      className={`
        ${baseStyles} 
        ${isProgressActive ? 'bg-neutral-800 border-neutral-700 text-white w-64 md:w-80' : variants[variant]} 
        ${isProgressActive ? '!px-0 !py-0' : ''}
        ${className}
      `} 
      disabled={disabled || isProgressActive}
      {...props}
    >
      {isProgressActive ? (
        <div className="relative w-full h-12 flex items-center justify-center px-4">
           
           {/* Content Layer (Status + Percentage or Done) */}
           <div className="relative z-10 flex items-center gap-2 animate-fade-in w-full justify-center">
              {completed ? (
                 <>
                   <Check className="w-5 h-5 text-green-400" />
                   <span className="text-green-400 font-bold">Download Complete</span>
                 </>
              ) : (
                 <div className="flex items-center justify-center gap-2 min-w-0">
                    {statusText && <span className="text-sm text-neutral-400 font-medium truncate">{statusText}</span>}
                    <span className="text-lg font-bold text-white shrink-0">{Math.round(progress || 0)}%</span>
                 </div>
              )}
           </div>

           {/* Thin White Progress Bar at Bottom */}
           {!completed && (
             <div 
                className="absolute left-0 bottom-0 h-1 bg-white transition-all duration-300 ease-out" 
                style={{ width: `${progress}%` }}
             />
           )}
        </div>
      ) : (
        <>
          {icon && <span className="mr-2">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};