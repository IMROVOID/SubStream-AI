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

const BACKEND_GOOGLE_PROXY = 'http://localhost:4000/api/proxy/ai/google/v1beta';

export const validateGoogleApiKey = async (apiKey: string): Promise<boolean> => {
  const trimmed = apiKey?.trim();
  if (!trimmed || !trimmed.startsWith('AIzaSy') || trimmed.length < 30) return false;

  await enforceRateLimit();

  // 1. Try direct SDK models.list()
  try {
    const ai = new GoogleGenAI({ apiKey: trimmed });
    await ai.models.list();
    return true;
  } catch (directErr: any) {
    const status = directErr?.status || directErr?.response?.status;
    const msg = directErr?.message || '';
    const isAuthError = status === 400 || status === 401 || status === 403 ||
      msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') ||
      msg.includes('PERMISSION_DENIED') || msg.includes('UNAUTHENTICATED');
    if (isAuthError) {
      return false;
    }

    // 2. Try backend proxy if direct browser request failed (e.g. SSL/Network intercept/CORS)
    try {
      const proxyRes = await fetch(`${BACKEND_GOOGLE_PROXY}/models?key=${encodeURIComponent(trimmed)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (proxyRes.ok) return true;
      if (proxyRes.status === 400 || proxyRes.status === 401 || proxyRes.status === 403) {
        return false;
      }
    } catch (proxyErr) {
      console.warn("[Google] Validation failed on both direct and backend proxy:", proxyErr);
      // ponytail: Fallback to format check ONLY if completely offline/unreachable network error
      return /^AIzaSy[A-Za-z0-9_-]{30,}$/.test(trimmed);
    }

    return false;
  }
};

async function executeGoogleGenerateContent(
  apiKey: string,
  modelId: string,
  contents: any[],
  generationConfig?: GenerationConfig
): Promise<string> {
  await enforceRateLimit();

  // Try direct SDK first
  try {
    const ai = new GoogleGenAI({ apiKey });
    const apiCall = ai.models.generateContent({
      model: modelId,
      contents,
      config: generationConfig
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. The model may be busy or the file is too large.")), 180000)
    );

    const result = await Promise.race([apiCall, timeoutPromise]) as any;
    if (result?.text) return result.text;
  } catch (directErr: any) {
    const isNetworkError = !directErr?.status || directErr?.status === 502 || directErr?.status === 504 ||
      (directErr?.message && (directErr.message.includes('fetch') || directErr.message.includes('network') || directErr.message.includes('Failed to fetch') || directErr.message.includes('certificate')));

    if (isNetworkError) {
      console.warn("[Google Service] Direct request failed with network error, retrying via backend AI proxy...");
      const proxyRes = await fetch(`${BACKEND_GOOGLE_PROXY}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig
        })
      });

      if (!proxyRes.ok) {
        const errJson = await proxyRes.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `Google API error (via proxy): ${proxyRes.statusText}`);
      }

      const data = await proxyRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    }
    throw directErr;
  }
  throw new Error("No response generated from Google AI.");
}

export async function transcribeWithGoogle(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
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

  const responseText = await executeGoogleGenerateContent(
    apiKey,
    modelId,
    [{ role: "user", parts: [{ text: prompt }, ...audioParts] }],
    generationConfig
  );
  
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
  const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));
  const systemInstruction = getTranslationPrompt(sourceLang, targetLang, contentToTranslate);
  const generationConfig: GenerationConfig = { responseMimeType: 'application/json' };

  const responseText = await executeGoogleGenerateContent(
    apiKey,
    modelId,
    [{ role: "user", parts: [{ text: systemInstruction }] }],
    generationConfig
  );

  const parsed = JSON.parse(responseText);
  if (!Array.isArray(parsed)) throw new Error("Invalid JSON format from Google AI.");
  return parsed;
}
