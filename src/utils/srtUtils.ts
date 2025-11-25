import { SubtitleNode } from '../types';

export const parseSRT = (data: string): SubtitleNode[] => {
  // Normalize line endings and trim whitespace
  const normalizedData = data.replace(/\r\n/g, '\n').trim();
  
  // Regex to handle both SRT (numbered) and VTT (sometimes not numbered) formats roughly
  // This splits by double newlines
  const blocks = normalizedData.split(/\n\n+/);
  
  const subtitles: SubtitleNode[] = [];
  let counter = 1;

  blocks.forEach((block) => {
    const lines = block.split('\n');
    
    // Filter out "WEBVTT" headers or style blocks if they appear in VTT files
    if (lines[0].includes('WEBVTT') || lines[0].startsWith('STYLE')) return;

    // Try to find the timestamp line
    // Look for pattern: 00:00:00.000 --> 00:00:00.000
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    
    if (timeLineIndex !== -1) {
      const timeLine = lines[timeLineIndex];
      const times = timeLine.split(' --> ');
      
      if (times.length === 2) {
        // Extract text (lines after the timestamp)
        const textLines = lines.slice(timeLineIndex + 1);
        const text = textLines.join('\n').trim();

        // If there is an ID before the timestamp, use it, otherwise use counter
        let id = counter;
        if (timeLineIndex > 0) {
            const potentialId = parseInt(lines[0].trim(), 10);
            if (!isNaN(potentialId)) id = potentialId;
        }

        if (text) {
            // Clean up VTT formatting tags if present (e.g. <c.color> or <00:01:00>)
            const cleanText = text.replace(/<[^>]*>/g, '');
            
            // Normalize timestamps (VTT uses dots, SRT uses commas)
            const startTime = times[0].trim().replace('.', ',');
            const endTime = times[1].trim().replace('.', ',');

            subtitles.push({
                id,
                startTime,
                endTime,
                text: cleanText,
                originalText: cleanText
            });
            counter++;
        }
      }
    }
  });

  return subtitles;
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

// Simple converter for raw text if needed specifically
export const vttToSrt = (vttData: string): string => {
    const subtitles = parseSRT(vttData);
    return stringifySRT(subtitles);
};