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
  const baseStyles = "relative inline-flex items-center justify-center font-medium transition-all duration-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black overflow-hidden whitespace-nowrap";
  
  const variants = {
    primary: "bg-white text-black hover:bg-neutral-200 focus:ring-white border border-transparent",
    secondary: "bg-neutral-800 text-white hover:bg-neutral-700 focus:ring-neutral-700 border border-neutral-700",
    outline: "bg-transparent text-neutral-300 border border-neutral-800 hover:border-white hover:text-white"
  };

  // If progress is active, override width and styles
  const isProgressActive = progress !== undefined && progress !== null && progress >= 0;

  return (
    <button 
      className={`
        ${baseStyles} 
        ${isProgressActive ? 'bg-neutral-800 border-neutral-700 text-white min-w-[200px] md:min-w-[150%]' : variants[variant]} 
        ${isProgressActive ? 'px-0 py-0' : 'px-6 py-3'}
        ${className}
      `} 
      disabled={disabled || isProgressActive}
      {...props}
    >
      {isProgressActive ? (
        <div className="relative w-full h-12 flex items-center justify-center px-4">
           
           {/* Content Layer (Status + Percentage or Done) */}
           <div className="relative z-10 flex items-center gap-3 animate-fade-in">
              {completed ? (
                 <>
                   <Check className="w-5 h-5 text-green-400" />
                   <span className="text-green-400 font-bold">Download Complete</span>
                 </>
              ) : (
                 <>
                    {statusText && <span className="text-sm text-neutral-400 font-medium">{statusText}</span>}
                    <span className="text-lg font-bold text-white">{Math.round(progress || 0)}%</span>
                 </>
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