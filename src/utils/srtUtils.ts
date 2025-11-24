import { SubtitleNode } from '../types';

export const parseSRT = (data: string): SubtitleNode[] => {
  const normalizedData = data.replace(/\r\n/g, '\n');
  const blocks = normalizedData.split(/\n\n+/);
  
  const subtitles: SubtitleNode[] = [];

  blocks.forEach((block) => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      // Handle ID
      const idStr = lines[0].trim();
      const id = parseInt(idStr, 10);

      // Handle Timestamp
      const timeLine = lines[1];
      const times = timeLine.split(' --> ');
      
      if (times.length === 2 && !isNaN(id)) {
        // Handle Text (could be multiple lines)
        const textLines = lines.slice(2);
        const text = textLines.join('\n');

        subtitles.push({
          id,
          startTime: times[0].trim(),
          endTime: times[1].trim(),
          text: text,
          originalText: text
        });
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