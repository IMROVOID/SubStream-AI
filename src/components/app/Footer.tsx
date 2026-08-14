import React from 'react';
import { Github, Heart } from 'lucide-react';

interface FooterProps {
  onOpenModal: (modal: 'TOS' | 'PRIVACY') => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenModal }) => {
  return (
    <footer className="relative z-10 border-t border-neutral-900 bg-black/80 backdrop-blur-xl mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 flex flex-col gap-3 md:gap-4">
        <div className="flex items-center justify-between gap-4 w-full">
          <span className="font-display font-bold tracking-tight text-neutral-400">SubStream AI</span>
          <div className="hidden md:block text-xs text-neutral-600 text-center">
            &copy; {new Date().getFullYear()} SubStream AI. Open Source.
          </div>
          <div className="flex items-center gap-3.5 md:gap-6 text-xs md:text-sm text-neutral-500">
            <button onClick={() => onOpenModal('TOS')} className="hover:text-white transition-colors">Terms</button>
            <button onClick={() => onOpenModal('PRIVACY')} className="hover:text-white transition-colors">Privacy</button>
            <a href="https://github.com/imrovoid/SubStream-AI" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" aria-label="GitHub">
              <Github className="w-4 h-4 md:w-5 md:h-5" />
            </a>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2.5 md:gap-4 text-xs text-neutral-500 w-full">
          <span>Developed by <a href="https://rovoid.netlify.app" target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-white transition-colors font-medium">ROVOID</a></span>
          <span className="w-1 h-1 rounded-full bg-neutral-800"></span>
          <button className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/50 border border-neutral-800 text-xs hover:border-neutral-600 hover:bg-neutral-800 transition-all group">
            <Heart className="w-3 h-3 text-pink-500 group-hover:scale-110 transition-transform" /> Support Me
          </button>
        </div>
        <div className="md:hidden text-center text-[11px] text-neutral-600">
          &copy; {new Date().getFullYear()} SubStream AI. Open Source.
        </div>
      </div>
    </footer>
  );
};
