import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBannerProps {
  error: string | null;
  activeApiKey: string;
  onOpenSettings: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  activeApiKey,
  onOpenSettings
}) => {
  if (!error) return null;

  return (
    <div className="p-4 rounded-xl bg-red-900/10 border border-red-900/40 text-red-200 text-sm flex items-start gap-3 animate-fade-in w-full">
      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="break-words whitespace-pre-wrap block font-medium">{error}</span>
        {!activeApiKey && (
          <button 
            onClick={onOpenSettings} 
            className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-xs text-red-300 font-semibold transition-colors"
          >
            Open Settings & Add API Key
          </button>
        )}
      </div>
    </div>
  );
};
