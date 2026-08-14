import { GoogleGenAI, GenerationConfig } from "@google/genai";
import { SubtitleNode } from "../../types";
import { enforceRateLimit } from "./rateLimiter";

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export const timeToMs = (timeStr: string): number => {
  const [hms, ms] = timeStr.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return (h * 3600000) + (m * 60000) + (s * 1000) + parseInt(ms);
};

export const msToTime = (ms: number): string => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mil = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mil).padStart(3, '0')}`;
};

export const jsonToSRT = (segments: { start: string; end: string; text: string }[]): string => {
  return segments.map((seg, index) => {
    return `${index + 1}\n${seg.start} --> ${seg.end}\n${seg.text}`;
  }).join('\n\n');
};

export const cleanAndRepairJSON = (text: string): string => {
  let cleaned = text.replace(/```json|```/g, '').trim();
  const firstBracket = cleaned.indexOf('[');
  if (firstBracket === -1) return '[]';
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace === -1) return '[]';
  return cleaned.substring(firstBracket, lastBrace + 1) + ']';
};

export const splitLongSegment = (segment: { start: string; end: string; text: string }) => {
  const MAX_CHARS = 55;
  const TEXT = segment.text.trim();
  if (TEXT.length <= MAX_CHARS) return [segment];

  const startMs = timeToMs(segment.start);
  const endMs = timeToMs(segment.end);
  const totalDuration = endMs - startMs;
  
  const words = TEXT.split(' ');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length + 1 > MAX_CHARS) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [word];
      currentLength = word.length;
    } else {
      currentChunk.push(word);
      currentLength += word.length + 1;
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));

  const resultSegments: { start: string; end: string; text: string }[] = [];
  let currentStart = startMs;
  const totalChars = TEXT.length;

  chunks.forEach((chunkText, idx) => {
    let share = Math.floor((chunkText.length / totalChars) * totalDuration);
    if (idx === chunks.length - 1) {
      share = endMs - currentStart; 
    }

    const chunkEnd = currentStart + share;
    resultSegments.push({
      start: msToTime(currentStart),
      end: msToTime(chunkEnd),
      text: chunkText
    });
    currentStart = chunkEnd;
  });

  return resultSegments;
};

export const fixTimestampIssues = (segments: { start: string; end: string; text: string }[]) => {
  if (!segments || segments.length === 0) return [];
  segments.sort((a, b) => timeToMs(a.start) - timeToMs(b.start));

  let splitSegments: { start: string; end: string; text: string }[] = [];
  for (const seg of segments) {
    splitSegments = splitSegments.concat(splitLongSegment(seg));
  }

  for (let i = 0; i < splitSegments.length - 1; i++) {
    const current = splitSegments[i];
    const next = splitSegments[i + 1];

    const currentEndMs = timeToMs(current.end);
    const nextStartMs = timeToMs(next.start);

    if (currentEndMs > nextStartMs) {
      const newEndMs = Math.max(timeToMs(current.start) + 300, nextStartMs - 50); 
      current.end = msToTime(newEndMs);
    }
  }

  return splitSegments;
};

export const validateGoogleApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey || !apiKey.startsWith('AIzaSy')) return false;

  const modelsToTry = ['gemini-2.0-flash', 'gemini-2.5-flash'];
  const ai = new GoogleGenAI({ apiKey });

  for (const model of modelsToTry) {
    try {
      await enforceRateLimit(); 
      await ai.models.countTokens({ model, contents: [{ role: "user", parts: [{ text: "test" }] }] });
      return true;
    } catch (error: any) {
      const isNotFoundError = error?.status === 'NOT_FOUND' || (error?.message && error.message.includes('NOT_FOUND'));
      if (isNotFoundError) {
        console.warn(`Validation with model "${model}" failed (Not Found). Trying next model...`);
      } else {
        console.error("Google API Key validation failed with a critical error:", error);
        return false;
      }
    }
  }
  return false;
};

export async function transcribeWithGoogle(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const audioBuffer = await audioBlob.arrayBuffer();
  const base64Audio = arrayBufferToBase64(audioBuffer);
  
  const audioParts = [{ inlineData: { data: base64Audio, mimeType: 'audio/wav' } }];
  const prompt = `You are a professional subtitle timer for TikTok/Reels.
  
  TASK:
  Transcribe the audio into short, punchy JSON segments.
  ${sourceLang !== 'auto' ? `LANGUAGE: Strictly ${sourceLang}. Do NOT translate.` : 'LANGUAGE: Detect automatically.'}

  RULES:
  1. **ONE PHRASE PER BLOCK**: Never put more than 8-10 words in one block.
  2. **SHORT DURATION**: Max duration per block is 3-4 seconds.
  3. **SYNC**: Start time must be exact.
  4. **NO PARAGRAPHS**: Split long sentences into multiple entries immediately.
  
  Format:
  [{"start": "00:00:00,000", "end": "00:00:02,000", "text": "Short line 1"}, {"start": "00:00:02,000", "end": "00:00:04,500", "text": "Short line 2"}]
  `;

  const generationConfig: GenerationConfig = { 
    responseMimeType: 'application/json',
    maxOutputTokens: 8192 
  };

  await enforceRateLimit();
  
  const apiCall = ai.models.generateContent({ 
    model: modelId, 
    contents: [{ role: "user", parts: [{ text: prompt }, ...audioParts] }],
    config: generationConfig
  });

  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Request timed out. The model may be busy or the file is too large.")), 180000)
  );

  const result = await Promise.race([apiCall, timeoutPromise]) as any;
  const responseText = result.text;
  if (!responseText) throw new Error("No transcription generated.");
  
  try {
    const safeJsonStr = cleanAndRepairJSON(responseText);
    const jsonSegments = JSON.parse(safeJsonStr);
    if (!Array.isArray(jsonSegments)) throw new Error("AI returned invalid JSON structure.");
    
    const finalizedSegments = fixTimestampIssues(jsonSegments);
    return jsonToSRT(finalizedSegments);
  } catch (e) {
    console.error("Failed to parse AI JSON response:", responseText);
    throw new Error("AI generated invalid transcription data. Please try again.");
  }
}

export const getTranslationPrompt = (sourceLang: string, targetLang: string, contentToTranslate: { id: number; text: string }[]) => {
  return `You are a professional subtitle translator. 
  Your task is to translate subtitles from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang}.
  
  CRITICAL RULES:
  1. Maintain the context of the dialogue.
  2. Keep the translation concise.
  3. Return ONLY a JSON array containing objects with 'id' and 'text'.
  4. The 'id' must match the input 'id' exactly.
  
  JSON:
  ${JSON.stringify(contentToTranslate)}`;
};

export async function translateWithGoogle(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
  const ai = new GoogleGenAI({ apiKey });
  const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));
  const systemInstruction = getTranslationPrompt(sourceLang, targetLang, contentToTranslate);
  const generationConfig: GenerationConfig = { responseMimeType: 'application/json' };

  await enforceRateLimit(); 
  const result = await ai.models.generateContent({ model: modelId, contents: [{ role: "user", parts: [{ text: systemInstruction }] }], config: generationConfig });
  const responseText = result.text;
  if (!responseText) throw new Error("Received empty response from Google AI.");
  const parsed = JSON.parse(responseText);
  if (!Array.isArray(parsed)) throw new Error("Invalid JSON format from Google AI.");
  return parsed;
}
