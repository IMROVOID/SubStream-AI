import { SubtitleNode } from '../types';

export const parseSRT = (data: string): SubtitleNode[] => {
  // Normalize line endings and trim whitespace, then split by one or more blank lines.
  const blocks = data.replace(/\r\n/g, '\n').trim().split(/\n\n+/);
  
  const subtitles: SubtitleNode[] = [];

  blocks.forEach((block) => {
    // A valid block needs at least 3 lines: ID, timestamp, and text.
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const idStr = lines[0].trim();
      const id = parseInt(idStr, 10);
      const timeLine = lines[1];
      const times = timeLine.split(' --> ');
      
      // Ensure the ID is a number and the timestamp format is correct.
      if (!isNaN(id) && times.length === 2) {
        const textLines = lines.slice(2);
        const text = textLines.join('\n').trim();

        // Only push if there is actual text content.
        if (text) {
            subtitles.push({
                id,
                startTime: times[0].trim(),
                endTime: times[1].trim(),
                text: text,
                originalText: text
            });
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