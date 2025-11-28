import { GoogleGenAI, GenerationConfig } from "@google/genai";
import OpenAI from 'openai';
import { SubtitleNode, AIModel, LANGUAGES, RPMLimit } from "../types";

export const BATCH_SIZE = 10; 
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Rate Limiting State
let currentRPM: RPMLimit = 15; // Default
let requestTimestamps: number[] = [];

// Helper function to set the RPM
export const setGlobalRPM = (rpm: RPMLimit) => {
    currentRPM = rpm;
    requestTimestamps = []; // Reset history on change
    console.log(`Global Rate Limit set to: ${rpm}`);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const enforceRateLimit = async () => {
    if (currentRPM === 'unlimited') return;

    const now = Date.now();
    // Remove timestamps older than 1 minute
    requestTimestamps = requestTimestamps.filter(t => now - t < 60000);

    if (requestTimestamps.length >= currentRPM) {
        // Find how long until the oldest request expires
        const oldestRequest = requestTimestamps[0];
        const timeToWait = 60000 - (now - oldestRequest) + 100; // +100ms buffer
        
        console.warn(`Rate limit (${currentRPM} RPM) hit. Waiting ${timeToWait}ms...`);
        await delay(timeToWait);
        // Recursively check again after waiting to ensure slot is clear
        await enforceRateLimit();
    } else {
        requestTimestamps.push(Date.now());
    }
};


// Helper function to convert ArrayBuffer to Base64 in a browser environment
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// --- Time Helpers for Logic Fixes ---

const timeToMs = (timeStr: string): number => {
    const [hms, ms] = timeStr.split(',');
    const [h, m, s] = hms.split(':').map(Number);
    return (h * 3600000) + (m * 60000) + (s * 1000) + parseInt(ms);
};

const msToTime = (ms: number): string => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mil = Math.floor(ms % 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mil).padStart(3, '0')}`;
};

// --- API Key Validation ---

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


export const validateOpenAIApiKey = async (apiKey: string): Promise<boolean> => {
    if (!apiKey || !apiKey.startsWith('sk-')) return false;
    try {
        await enforceRateLimit();
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        await openai.models.list();
        return true;
    } catch (error) {
        return false;
    }
};

// --- Transcription Logic ---

// Helper to convert JSON response to SRT String
const jsonToSRT = (segments: { start: string; end: string; text: string }[]): string => {
    return segments.map((seg, index) => {
        return `${index + 1}\n${seg.start} --> ${seg.end}\n${seg.text}`;
    }).join('\n\n');
};

// Robust JSON Cleaner & Repairer
const cleanAndRepairJSON = (text: string): string => {
    let cleaned = text.replace(/```json|```/g, '').trim();
    const firstBracket = cleaned.indexOf('[');
    if (firstBracket === -1) return '[]';
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace === -1) return '[]';
    return cleaned.substring(firstBracket, lastBrace + 1) + ']';
};

/**
 * Splits a long segment into smaller chunks based on character length.
 * Interpolates timestamps linearly.
 */
const splitLongSegment = (segment: { start: string; end: string; text: string }) => {
    const MAX_CHARS = 55; // Preferred max characters per line
    const TEXT = segment.text.trim();
    
    // If short enough, return as is
    if (TEXT.length <= MAX_CHARS) return [segment];

    const startMs = timeToMs(segment.start);
    const endMs = timeToMs(segment.end);
    const totalDuration = endMs - startMs;
    
    // Split text into word-aware chunks
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

    // Distribute time based on character count ratio (Linear Interpolation)
    const resultSegments: { start: string; end: string; text: string }[] = [];
    let currentStart = startMs;
    const totalChars = TEXT.length; // Use raw length for ratio

    chunks.forEach((chunkText, idx) => {
        // Calculate duration share: (chunkLen / totalLen) * totalDuration
        let share = Math.floor((chunkText.length / totalChars) * totalDuration);
        
        // Ensure last segment aligns perfectly with end time
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

// Fix overlapping timestamps AND Split long segments
const fixTimestampIssues = (segments: { start: string; end: string; text: string }[]) => {
    if (!segments || segments.length === 0) return [];

    // 1. Sort strictly by Start Time
    segments.sort((a, b) => timeToMs(a.start) - timeToMs(b.start));

    // 2. Split long segments first (Pre-processing)
    let splitSegments: { start: string; end: string; text: string }[] = [];
    for (const seg of segments) {
        const subSegments = splitLongSegment(seg);
        splitSegments = splitSegments.concat(subSegments);
    }

    // 3. Fix Overlaps (Post-processing)
    for (let i = 0; i < splitSegments.length - 1; i++) {
        const current = splitSegments[i];
        const next = splitSegments[i + 1];

        const currentEndMs = timeToMs(current.end);
        const nextStartMs = timeToMs(next.start);

        // If Current overlaps into Next, CUT Current short.
        if (currentEndMs > nextStartMs) {
            // Buffer: Leave a 50ms gap between lines
            const newEndMs = Math.max(timeToMs(current.start) + 300, nextStartMs - 50); 
            current.end = msToTime(newEndMs);
        }
    }

    return splitSegments;
};

async function transcribeWithGoogle(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const audioBuffer = await audioBlob.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioBuffer);
    
    // WAV Mime Type
    const audioParts = [{ inlineData: { data: base64Audio, mimeType: 'audio/wav' } }];

    // PROMPT: Optimized for short lines
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
    
    // Add Timeout to prevent infinite hanging
    const apiCall = ai.models.generateContent({ 
        model: modelId, 
        contents: [{ role: "user", parts: [{ text: prompt }, ...audioParts] }],
        config: generationConfig
    });

    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request timed out. The model may be busy or the file is too large.")), 180000) // 3 min timeout
    );

    const result = await Promise.race([apiCall, timeoutPromise]) as any;
    
    const responseText = result.text;
    if (!responseText) throw new Error("No transcription generated.");
    
    try {
        const safeJsonStr = cleanAndRepairJSON(responseText);
        const jsonSegments = JSON.parse(safeJsonStr);
        
        if (!Array.isArray(jsonSegments)) throw new Error("AI returned invalid JSON structure.");
        
        // APPLY SPLITTING & SYNC LOGIC
        const finalizedSegments = fixTimestampIssues(jsonSegments);

        return jsonToSRT(finalizedSegments);
    } catch (e) {
        console.error("Failed to parse AI JSON response:", responseText);
        throw new Error("AI generated invalid transcription data. Please try again.");
    }
}

async function transcribeWithOpenAI(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    // OpenAI requires a File object with a name and type
    const audioFile = new File([audioBlob], "audio.wav", { type: 'audio/wav' });

    const options: OpenAI.Audio.Transcriptions.TranscriptionCreateParams = {
        file: audioFile,
        model: modelId, 
        response_format: 'srt', 
    };

    if (sourceLang !== 'auto') {
        const langData = LANGUAGES.find(l => l.name === sourceLang);
        if (langData) options.language = langData.code;
    }
    
    await enforceRateLimit();
    const transcription = await openai.audio.transcriptions.create(options) as any;
    
    if (typeof transcription !== 'string') throw new Error('OpenAI transcription returned an invalid result.');
    return transcription;
}

export async function transcribeAudio(audioBlob: Blob, sourceLang: string, apiKey: string, model: AIModel): Promise<string> {
    if (model.provider === 'openai') {
        if (!model.transcriptionModel) throw new Error("Transcription model not defined for the selected OpenAI model.");
        return transcribeWithOpenAI(audioBlob, sourceLang, apiKey, model.transcriptionModel);
    }
    return transcribeWithGoogle(audioBlob, sourceLang, apiKey, model.id);
}


// --- Translation ---

const getTranslationPrompt = (sourceLang: string, targetLang: string, contentToTranslate: { id: number; text: string }[]) => {
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

async function translateWithGoogle(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
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

async function translateWithOpenAI(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));
    const systemPrompt = getTranslationPrompt(sourceLang, targetLang, contentToTranslate);

    await enforceRateLimit();
    const response = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
    });
    
    const responseText = response.choices[0].message.content;
    if (!responseText) throw new Error("Received empty response from OpenAI.");
    
    const parsed = JSON.parse(responseText);
    const arrayResult = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray);

    if (!arrayResult) throw new Error("Invalid JSON format from OpenAI.");
    return arrayResult;
}

export const translateBatch = async (
  subtitles: SubtitleNode[],
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  model: AIModel
): Promise<{ id: number; text: string }[]> => {
  let lastError: any;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (model.provider === 'openai') {
        return await translateWithOpenAI(subtitles, sourceLang, targetLang, apiKey, model.id);
      }
      return await translateWithGoogle(subtitles, sourceLang, targetLang, apiKey, model.id);
    } catch (error: any) {
      console.warn(`Attempt ${attempt} failed for ${model.provider}:`, error);
      lastError = error;
      if (attempt < MAX_RETRIES) {
        const backoffTime = RETRY_DELAY_MS * Math.pow(1.5, attempt - 1);
        await delay(backoffTime);
      }
    }
  }
  throw lastError;
};

export const processFullSubtitleFile = async (
  subtitles: SubtitleNode[],
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  model: AIModel,
  onProgress: (processedCount: number) => void,
  onBatchComplete: (updatedSubtitles: SubtitleNode[]) => void
): Promise<SubtitleNode[]> => {
  
  if (!apiKey) throw new Error(`API Key for ${model.provider} is missing.`);

  const results: SubtitleNode[] = [...subtitles];
  let processedCount = 0;

  for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
    const batch = subtitles.slice(i, i + BATCH_SIZE);
    
    try {
      const translatedBatch = await translateBatch(batch, sourceLang, targetLang, apiKey, model);
      
      translatedBatch.forEach(t => {
        const index = results.findIndex(r => r.id === t.id);
        if (index !== -1) {
          results[index] = { ...results[index], text: t.text };
        }
      });

      processedCount += batch.length;
      onProgress(Math.min(processedCount, subtitles.length));
      onBatchComplete([...results]);
      
    } catch (e) {
      console.error(`Batch starting at ${i} failed after retries`, e);
      throw new Error(`Translation failed at subtitle #${batch[0].id}. The server might be busy.`);
    }
  }

  return results;
};