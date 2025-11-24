import { GoogleGenAI, GenerationConfig } from "@google/genai";
import { SubtitleNode } from "../types";

export const BATCH_SIZE = 10; 
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey || !apiKey.startsWith('AIzaSy')) {
    return false;
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    // This is a lightweight call to check for model accessibility, which confirms API key validity.
    await ai.models.countTokens({
      model: "gemini-pro",
      contents: [{ role: "user", parts: [{ text: "test" }] }]
    });
    return true; // If the call succeeds without throwing, the key is valid.
  } catch (error) {
    console.error("API Key validation failed:", error);
    return false; // Any error (e.g., 400, 403, 401) indicates an invalid or incorrectly configured key.
  }
};

export async function transcribeAudio(audioBlob: Blob, sourceLang: string, apiKey: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });

    const audioBuffer = await audioBlob.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioBuffer);

    const audioParts = [{
        inlineData: {
            data: base64Audio,
            mimeType: audioBlob.type,
        }
    }];

    const prompt = `You are an expert audio transcription service. 
    Transcribe the following audio which is in ${sourceLang === 'auto' ? 'the auto-detected language' : sourceLang}.
    Your output MUST be ONLY in the SRT (SubRip) format. 
    Do not include any other text, explanations, or markdown formatting.
    Ensure the timestamps are accurate.
    
    Example output format:
    1
    00:00:01,000 --> 00:00:04,500
    This is the first line of dialogue.
    
    2
    00:00:05,100 --> 00:00:08,000
    And this is the second.`;

    const result = await ai.models.generateContent({
        model: "gemini-1.5-pro-latest",
        contents: [{ role: "user", parts: [{ text: prompt }, ...audioParts] }]
    });

    const text = result.text;
    
    // Clean up potential markdown code blocks from the response
    return text.replace(/```srt\n|```/g, '').trim();
}

export const translateBatch = async (
  subtitles: SubtitleNode[],
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  modelId: string
): Promise<{ id: number; text: string }[]> => {
  
  const ai = new GoogleGenAI({ apiKey });

  const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));

  const systemInstruction = `You are a professional subtitle translator. 
  Your task is to translate subtitles from ${sourceLang === 'auto' ? 'the detected language' : sourceLang} to ${targetLang}.
  
  CRITICAL RULES:
  1. Maintain the context of the dialogue. Look at surrounding lines in the batch to understand incomplete sentences.
  2. Keep the translation concise to fit within subtitle timing constraints.
  3. Do NOT translate proper nouns or technical terms if they are standard in the target region.
  4. Return ONLY a JSON array containing objects with 'id' and 'text' (the translated text).
  5. The 'id' must match the input 'id' exactly.
  6. Do not include timestamps in the output, only the ID and the translated text.
  `;

  let lastError: any;
  const generationConfig: GenerationConfig = {
      responseMimeType: 'application/json',
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: modelId,
        contents: [
          { role: "system", parts: [{ text: systemInstruction }] },
          { role: "user", parts: [{ text: JSON.stringify(contentToTranslate) }] }
        ],
        config: generationConfig,
      });

      const responseText = result.text;

      if (responseText) {
        const parsed = JSON.parse(responseText);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      console.warn(`Attempt ${attempt}: Received invalid response format`, responseText);
      throw new Error("Invalid response format received from AI.");

    } catch (error: any) {
      console.warn(`Attempt ${attempt} failed:`, error);
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
  customApiKey: string | null,
  modelId: string,
  onProgress: (processedCount: number) => void,
  onBatchComplete: (updatedSubtitles: SubtitleNode[]) => void
): Promise<SubtitleNode[]> => {
  
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing. Please add your Key in Settings.");

  const results: SubtitleNode[] = [...subtitles];
  let processedCount = 0;

  for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
    const batch = subtitles.slice(i, i + BATCH_SIZE);
    
    try {
      const translatedBatch = await translateBatch(batch, sourceLang, targetLang, apiKey, modelId);
      
      translatedBatch.forEach(t => {
        const index = results.findIndex(r => r.id === t.id);
        if (index !== -1) {
          results[index] = { ...results[index], text: t.text };
        }
      });

      processedCount += batch.length;
      onProgress(Math.min(processedCount, subtitles.length));
      onBatchComplete([...results]);
      
      await delay(1000);
      
    } catch (e) {
      console.error(`Batch starting at ${i} failed after retries`, e);
      throw new Error(`Translation failed at subtitle #${batch[0].id}. The server might be busy or the content too complex. Please try again.`);
    }
  }

  return results;
};