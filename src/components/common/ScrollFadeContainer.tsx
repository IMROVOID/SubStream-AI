import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ScrollFadeContainerProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  topFadeClassName?: string;
  bottomFadeClassName?: string;
  fadeHeight?: string;
  roundedCorner?: string;
}

export const ScrollFadeContainer: React.FC<ScrollFadeContainerProps> = ({
  children,
  className = '',
  containerClassName = '',
  topFadeClassName = 'from-[var(--overlay-bg,#121212)] via-[var(--overlay-bg,#121212)]/40 to-transparent',
  bottomFadeClassName = 'from-[var(--overlay-bg,#121212)] via-[var(--overlay-bg,#121212)]/40 to-transparent',
  fadeHeight = 'h-8',
  roundedCorner = 'rounded-2xl',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setShowTopFade(scrollTop > 4);
    setShowBottomFade(scrollTop + clientHeight < scrollHeight - 4 && scrollHeight > clientHeight);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    const ro = new ResizeObserver(() => checkScroll());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    return () => ro.disconnect();
  }, [checkScroll]);

  return (
    <div className={`relative overflow-hidden flex flex-col min-h-0 min-w-0 w-full h-full ${roundedCorner} ${containerClassName}`}>
      {/* Top Dark Fade */}
      <div 
        className={`aria-hidden pointer-events-none absolute top-0 left-0 right-0 ${fadeHeight} bg-gradient-to-b ${topFadeClassName} z-20 ${roundedCorner} rounded-b-2xl transition-opacity duration-300 ${
          showTopFade ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Scrollable Container */}
      <div 
        ref={containerRef} 
        onScroll={checkScroll} 
        className={`${className} ${roundedCorner}`}
      >
        {children}
      </div>

      {/* Bottom Dark Fade */}
      <div 
        className={`aria-hidden pointer-events-none absolute bottom-0 left-0 right-0 ${fadeHeight} bg-gradient-to-t ${bottomFadeClassName} z-20 ${roundedCorner} rounded-t-2xl transition-opacity duration-300 ${
          showBottomFade ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
