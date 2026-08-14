import { useState, useRef, useEffect } from 'react';

export interface DraggedFileInfo {
  name: string;
  type: 'subtitle' | 'video' | 'unknown';
}

export function extractDraggedFileInfo(e: DragEvent | React.DragEvent): DraggedFileInfo | null {
  const items = e.dataTransfer?.items;
  if (items && items.length > 0) {
    const item = items[0];
    const type = item.type.toLowerCase();
    if (type.includes('video')) {
      return { name: 'Video File', type: 'video' };
    } else if (type.includes('subrip') || type.includes('vtt') || type.includes('text/plain') || type.includes('subtitle')) {
      return { name: 'Subtitle File', type: 'subtitle' };
    }
  }

  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['srt', 'vtt'].includes(ext || '')) {
      return { name: file.name, type: 'subtitle' };
    } else if (['mp4', 'mkv', 'mov', 'webm', 'avi'].includes(ext || '')) {
      return { name: file.name, type: 'video' };
    }
  }

  return { name: 'File', type: 'unknown' };
}

export function useDragAndDrop(onFileDrop?: (file: File) => void) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [draggedFileInfo, setDraggedFileInfo] = useState<DraggedFileInfo | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter.current += 1;
        if (dragCounter.current === 1) {
          setIsDraggingFile(true);
          const info = extractDraggedFileInfo(e);
          if (info) setDraggedFileInfo(info);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        const info = extractDraggedFileInfo(e);
        if (info) setDraggedFileInfo(info);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          setIsDraggingFile(false);
          setDraggedFileInfo(null);
        }
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDraggingFile(false);
        setDraggedFileInfo(null);
        if (onFileDrop && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onFileDrop(e.dataTransfer.files[0]);
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [onFileDrop]);

  const resetDrag = () => {
    dragCounter.current = 0;
    setIsDraggingFile(false);
    setDraggedFileInfo(null);
  };

  return {
    isDraggingFile,
    draggedFileInfo,
    resetDrag
  };
}
