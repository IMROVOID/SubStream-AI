import { SubtitleNode } from '../types';

// Helper to convert SRT timestamp (00:00:00,000) to milliseconds
const timeToMs = (timeString: string): number => {
  const [time, msStr] = timeString.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const milliseconds = Number(msStr);
  return (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + milliseconds;
};

export const parseSRT = (data: string): SubtitleNode[] => {
  // Normalize line endings
  const normalizedData = data.replace(/\r\n/g, '\n').trim();
  
  // Remove WebVTT header if present (simple check)
  const cleanData = normalizedData.replace(/^WEBVTT.*\n+/, '');

  let rawSubtitles: SubtitleNode[] = [];
  // Split by double newlines (standard block separator)
  const blocks = cleanData.split(/\n\n+/);
  
  let tempCounter = 1;

  blocks.forEach((block) => {
    const lines = block.split('\n');
    if (lines.length === 0) return;

    // Find timestamp line (contains "-->")
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    
    if (timeLineIndex !== -1) {
      const timeLine = lines[timeLineIndex];
      const times = timeLine.split(' --> ');
      
      if (times.length === 2) {
        // Extract text: everything after the timestamp line
        const textLines = lines.slice(timeLineIndex + 1);
        // Filter out empty lines or "style" lines sometimes present in VTT
        const validTextLines = textLines.filter(l => l.trim() !== '' && !l.trim().match(/^NOTE/));
        const text = validTextLines.join('\n').trim();

        if (text) {
            // VTT cleanup: remove tags like <c.v> or <00:00:00.500> if present
            const cleanText = text.replace(/<[^>]*>/g, '');
            
            // Normalize format: 00:00:00.000 -> 00:00:00,000 (SRT standard)
            const startTime = times[0].trim().replace('.', ',');
            const endTime = times[1].trim().replace('.', ',');

            rawSubtitles.push({
                id: tempCounter++,
                startTime,
                endTime,
                text: cleanText,
                originalText: cleanText
            });
        }
      }
    }
  });

  // --- DEDUPLICATION LOGIC ---
  // Fixes YouTube Auto-Caption "Roll-up" duplicates where Line 1 is "Hello" and Line 2 is "Hello World"
  // appearing at the same (or very close) start time.
  const cleanedSubtitles: SubtitleNode[] = [];
  
  for (let i = 0; i < rawSubtitles.length; i++) {
    const current = rawSubtitles[i];
    const next = rawSubtitles[i + 1];

    if (next) {
        const currentStart = timeToMs(current.startTime);
        const nextStart = timeToMs(next.startTime);
        
        // If start times are within 500ms of each other
        if (Math.abs(nextStart - currentStart) < 500) {
            // Check if one text is a substring of the other
            const currText = current.originalText?.toLowerCase().trim() || "";
            const nextText = next.originalText?.toLowerCase().trim() || "";

            // If next line contains current line (accumulation), skip current
            if (nextText.startsWith(currText)) {
                continue; 
            }
        }
    }
    // Renumber IDs sequentially
    cleanedSubtitles.push({
        ...current,
        id: cleanedSubtitles.length + 1
    });
  }

  return cleanedSubtitles;
};

export const stringifySRT = (subtitles: SubtitleNode[]): string => {
  return subtitles
    .map((sub) => {
      return `${sub.id}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}`;
    })
    .join('\n\n');
};

export const downloadFile = (filename: string, content: string | Blob) => {
  const element = document.createElement('a');
  const file = typeof content === 'string' ? new Blob([content], { type: 'text/plain' }) : content;
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

export const vttToSrt = (vttData: string): string => {
    const subtitles = parseSRT(vttData);
    return stringifySRT(subtitles);
};