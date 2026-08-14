import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export const AuthCallbackView: React.FC = () => {
  const handleClose = () => {
    window.close();
    try {
      window.open('', '_self')?.close();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white space-y-6">
      <div className="w-20 h-20 bg-green-900/20 rounded-full flex items-center justify-center border border-green-900/50 animate-pulse-slow">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold font-display">Authentication Successful</h2>
        <p className="text-neutral-400">You can safely close this window.</p>
      </div>
      <button 
        onClick={handleClose} 
        className="px-6 py-2 bg-neutral-800 border border-neutral-700 rounded-lg hover:bg-neutral-700 hover:text-white transition-colors text-neutral-300"
      >
        Close Window
      </button>
    </div>
  );
};
