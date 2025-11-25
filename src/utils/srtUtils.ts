import { SubtitleNode } from '../types';

export const parseSRT = (data: string): SubtitleNode[] => {
  // Normalize line endings
  const normalizedData = data.replace(/\r\n/g, '\n').trim();
  
  // Remove WebVTT header if present (simple check)
  const cleanData = normalizedData.replace(/^WEBVTT.*\n+/, '');

  const subtitles: SubtitleNode[] = [];
  // Split by double newlines (standard block separator)
  const blocks = cleanData.split(/\n\n+/);
  
  let counter = 1;

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
            
            subtitles.push({
                id: counter++,
                // Normalize format: 00:00:00.000 -> 00:00:00,000 (SRT standard)
                startTime: times[0].trim().replace('.', ','),
                endTime: times[1].trim().replace('.', ','),
                text: cleanText,
                originalText: cleanText
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

export const vttToSrt = (vttData: string): string => {
    const subtitles = parseSRT(vttData);
    return stringifySRT(subtitles);
};