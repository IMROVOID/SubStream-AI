import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Handle visibility state for animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300); // Match transition duration
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // If not open and animation finished, don't render to save resources
  if (!isVisible && !isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-all duration-300 ${
        isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
      }`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300" 
        onClick={onClose}
      />
      
      {/* Content Container - Dark Glass Effect with Scale/Slide Animation */}
      <div 
        className={`
          relative w-full max-w-3xl md:max-w-6xl max-h-[85vh] overflow-hidden rounded-3xl border border-neutral-800 
          bg-neutral-900/80 backdrop-blur-xl shadow-2xl flex flex-col transform transition-all duration-300 ease-out
          ${isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}
        `}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-900/50">
          <h2 className="text-2xl font-display font-bold text-white tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};