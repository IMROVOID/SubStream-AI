import React from 'react';
import { LANGUAGES } from '../../constants/languages';

export const HeroSection: React.FC = () => {
  return (
    <section className="mb-8 md:mb-14 text-center">
      <h1 className="text-[1.85rem] min-[360px]:text-[2.1rem] min-[400px]:text-[2.5rem] sm:text-5xl md:text-6xl font-display font-bold tracking-tighter text-white mb-6 animate-slide-up leading-tight">
        <span className="block whitespace-nowrap sm:whitespace-normal">Bridge the Language</span>{' '}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-400 to-neutral-700 block sm:inline">
          Gap Instantly.
        </span>
      </h1>
      <p 
        className="text-base md:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed animate-slide-up" 
        style={{ animationDelay: '0.1s' }}
      >
        Transform your subtitles with context-aware AI. Powered by state-of-the-art frontier AI models for nuance and accuracy across {LANGUAGES.length}+ languages.
      </p>
    </section>
  );
};
