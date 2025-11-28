import { SubtitleNode } from '../types';

// Helper to convert SRT timestamp (00:00:00,000) to milliseconds
const timeToMs = (timeString: string): number => {
  const [time, msStr] = timeString.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const milliseconds = Number(msStr);
  return (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + milliseconds;
};

// Helper to normalize text for comparison (removes punctuation/casing)
const normalize = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").replace(/\s+/g, " ").trim();

export const parseSRT = (data: string): SubtitleNode[] => {
  // Normalize line endings
  const normalizedData = data.replace(/\r\n/g, '\n').trim();
  
  // Remove WebVTT header if present
  const cleanData = normalizedData.replace(/^WEBVTT.*\n+/, '');

  let rawSubtitles: SubtitleNode[] = [];
  // Split by double newlines (standard block separator)
  const blocks = cleanData.split(/\n\n+/);
  
  let tempCounter = 1;

  blocks.forEach((block) => {
    const lines = block.split('\n');
    if (lines.length < 2) return;

    // Find timestamp line (contains "-->")
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    
    if (timeLineIndex !== -1) {
      const timeLine = lines[timeLineIndex];
      const times = timeLine.split(' --> ');
      
      if (times.length === 2) {
        // Extract text: everything after the timestamp line
        const textLines = lines.slice(timeLineIndex + 1);
        // Filter out empty lines, "NOTE" lines, or extra metadata
        const validTextLines = textLines.filter(l => l.trim() !== '' && !l.trim().startsWith('NOTE') && !l.includes('-->'));
        
        // VTT often separates lines; join them with space for analysis
        let text = validTextLines.join(' ').trim();

        if (text) {
            // VTT/SRT cleanup: remove tags like <c.v>, <00:00...>, {align...}
            const cleanText = text
                .replace(/<[^>]*>/g, '') 
                .replace(/\{[^}]*\}/g, '')
                .trim();
            
            // Normalize format: 00:00:00.000 -> 00:00:00,000
            const startTime = times[0].trim().replace('.', ',');
            const endTime = times[1].trim().replace('.', ',');

            if (cleanText) {
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
    }
  });

  // --- INTELLIGENT DEDUPLICATION LOGIC ---
  const cleanedSubtitles: SubtitleNode[] = [];
  
  for (let i = 0; i < rawSubtitles.length; i++) {
    const current = { ...rawSubtitles[i] };
    
    if (cleanedSubtitles.length > 0) {
        const prev = cleanedSubtitles[cleanedSubtitles.length - 1];
        const prevNorm = normalize(prev.text);
        const currNorm = normalize(current.text);

        // 1. Exact Duplicate
        if (prevNorm === currNorm) {
            prev.endTime = current.endTime; // Extend duration
            continue;
        }

        // 2. Accumulation (Line 2 starts with Line 1)
        // Prev: "I am going"
        // Curr: "I am going to the store"
        if (currNorm.startsWith(prevNorm)) {
            // We strip the prefix from the current line
            // But we must be careful about word boundaries.
            const uniquePart = current.text.substring(prev.text.length).trim();
            if (uniquePart) {
                current.text = uniquePart;
                current.originalText = uniquePart;
            } else {
                prev.endTime = current.endTime;
                continue;
            }
        }
        
        // 3. Rolling Overlap (End of Line 1 is Start of Line 2)
        // Prev: "going to the"
        // Curr: "to the store"
        else {
            const prevWords = prev.text.split(' ');
            const currWords = current.text.split(' ');
            
            let maxOverlap = 0;
            // Check for overlap of 1 to N words
            const maxLen = Math.min(prevWords.length, currWords.length);
            for (let k = 1; k <= maxLen; k++) {
                const suffix = prevWords.slice(-k).join(' ');
                const prefix = currWords.slice(0, k).join(' ');
                if (normalize(suffix) === normalize(prefix)) {
                    maxOverlap = k;
                }
            }

            if (maxOverlap > 0) {
                // Remove the overlapping words from the start of current
                const uniqueWords = currWords.slice(maxOverlap);
                const uniqueText = uniqueWords.join(' ').trim();
                
                if (uniqueText) {
                    current.text = uniqueText;
                    current.originalText = uniqueText;
                } else {
                    prev.endTime = current.endTime;
                    continue;
                }
            }
        }
    }

    // Re-assign ID to keep sequence clean
    current.id = cleanedSubtitles.length + 1;
    cleanedSubtitles.push(current);
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