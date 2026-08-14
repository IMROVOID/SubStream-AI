import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface ComboBoxOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface ComboBoxProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

export const ComboBox: React.FC<ComboBoxProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  icon,
  className = '',
  triggerClassName = '',
  dropdownClassName = '',
  id,
  name,
  'aria-label': ariaLabel
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [menuCoords, setMenuCoords] = useState<{
    top: number;
    left: number;
    width: number;
    isAbove: boolean;
  }>({
    top: 0,
    left: 0,
    width: 0,
    isAbove: false
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  // Calculate and update popover position
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(options.length * 38 + 20, 260);
    const isAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setMenuCoords({
      top: isAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      isAbove
    });
  }, [options.length]);

  // Update position on open, resize, or scroll
  useEffect(() => {
    if (isOpen) {
      updatePosition();

      const handleScroll = (e: Event) => {
        // If scrolling inside the dropdown list itself, do not reposition/close
        if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
          return;
        }
        updatePosition();
      };

      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Scroll active item into view on open
  useEffect(() => {
    if (isOpen) {
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      setHighlightedIndex(idx);
      if (listRef.current && idx >= 0) {
        const itemElement = listRef.current.children[idx] as HTMLElement;
        if (itemElement) {
          itemElement.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }, [isOpen, selectedIndex]);

  const handleSelect = useCallback(
    (optionValue: string, optionDisabled?: boolean) => {
      if (optionDisabled || disabled) return;
      onChange(optionValue);
      setIsOpen(false);
    },
    [onChange, disabled]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
      case 'Tab':
        setIsOpen(false);
        break;
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = highlightedIndex < options.length - 1 ? highlightedIndex + 1 : 0;
        setHighlightedIndex(nextIndex);
        const itemElement = listRef.current?.children[nextIndex] as HTMLElement;
        itemElement?.scrollIntoView({ block: 'nearest' });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = highlightedIndex > 0 ? highlightedIndex - 1 : options.length - 1;
        setHighlightedIndex(prevIndex);
        const itemElement = listRef.current?.children[prevIndex] as HTMLElement;
        itemElement?.scrollIntoView({ block: 'nearest' });
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          const opt = options[highlightedIndex];
          handleSelect(opt.value, opt.disabled);
        }
        break;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        name={name}
        aria-label={ariaLabel || placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            if (!isOpen) updatePosition();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-left text-sm transition-all duration-200 ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-neutral-900/40 border-neutral-800/60 text-neutral-500'
            : isOpen
            ? 'bg-neutral-900 border-neutral-600 text-white shadow-lg ring-1 ring-neutral-700/50'
            : 'bg-neutral-900/90 border-neutral-800 text-neutral-200 hover:bg-neutral-800/80 hover:border-neutral-700 hover:text-white'
        } ${triggerClassName}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 truncate">
          {selectedOption?.icon || icon ? (
            <span className="shrink-0 text-neutral-400">
              {selectedOption?.icon || icon}
            </span>
          ) : null}
          <span className={`truncate ${selectedOption ? 'font-medium text-white' : 'text-neutral-500'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform duration-200 ease-out ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {/* Highest Level Element: Rendered via Portal at document.body */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: menuCoords.isAbove ? 'auto' : `${menuCoords.top}px`,
              bottom: menuCoords.isAbove ? `${window.innerHeight - menuCoords.top}px` : 'auto',
              left: `${menuCoords.left}px`,
              width: `${menuCoords.width}px`,
              zIndex: 99999
            }}
            className={`rounded-xl bg-[#1a1a1f] border border-neutral-800/90 shadow-2xl backdrop-blur-xl p-1.5 animate-fade-in ${dropdownClassName}`}
            onKeyDown={handleKeyDown}
          >
            <ul
              ref={listRef}
              role="listbox"
              tabIndex={-1}
              className="max-h-60 overflow-y-auto thin-scrollbar space-y-0.5"
            >
              {options.length === 0 ? (
                <li className="px-3.5 py-2.5 text-xs text-neutral-500 text-center">
                  No options available
                </li>
              ) : (
                options.map((option, index) => {
                  const isSelected = option.value === value;
                  const isHighlighted = index === highlightedIndex;

                  return (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled}
                      onClick={() => handleSelect(option.value, option.disabled)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg text-sm cursor-pointer transition-colors duration-150 ${
                        option.disabled
                          ? 'opacity-40 cursor-not-allowed text-neutral-600'
                          : isSelected
                          ? 'bg-neutral-800 text-white font-medium'
                          : isHighlighted
                          ? 'bg-neutral-800/60 text-white'
                          : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate min-w-0">
                        {option.icon && (
                          <span className="shrink-0 text-neutral-400">
                            {option.icon}
                          </span>
                        )}
                        <span className="truncate">{option.label}</span>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-white shrink-0 ml-2" />
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
};
