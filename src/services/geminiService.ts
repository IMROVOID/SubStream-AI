import { GoogleGenAI, Type } from "@google/genai";
import { SubtitleNode } from "../types";

// Further reduced batch size to prevent 500 Rpc/Xhr errors
export const BATCH_SIZE = 10; 
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validates a Google Gemini API Key by making a lightweight, non-generative request.
 * @param apiKey The API key to validate.
 * @returns A promise that resolves to true if the key is valid, false otherwise.
 */
export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  // Basic check for format and non-empty string
  if (!apiKey || !apiKey.startsWith('AIzaSy')) {
    return false;
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    // This is a lightweight call to check for model accessibility, which confirms API key validity.
    // We use a fast, common model for this check.
    await ai.models.get({ model: 'gemini-2.0-flash' });
    return true; // If the call succeeds without throwing, the key is valid.
  } catch (error) {
    console.error("API Key validation failed:", error);
    return false; // Any error (e.g., 400, 403, 401) indicates an invalid or incorrectly configured key.
  }
};


export const translateBatch = async (
  subtitles: SubtitleNode[],
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  modelId: string
): Promise<{ id: number; text: string }[]> => {
  
  const ai = new GoogleGenAI({ apiKey });

  // Construct a prompt that includes the subtitles
  const contentToTranslate = subtitles.map(s => ({
    id: s.id,
    text: s.text
  }));

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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: JSON.stringify(contentToTranslate),
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                text: { type: Type.STRING }
              },
              required: ['id', 'text']
            }
          }
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      // If response is valid but empty/unexpected format
      console.warn(`Attempt ${attempt}: Received invalid response format`, response.text);
      throw new Error("Invalid response format received from AI.");

    } catch (error: any) {
      console.warn(`Attempt ${attempt} failed:`, error);
      lastError = error;
      
      if (attempt < MAX_RETRIES) {
        // Exponential backoff with jitter
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

  const results: SubtitleNode[] = [...subtitles]; // Clone to modify
  let processedCount = 0;

  for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
    const batch = subtitles.slice(i, i + BATCH_SIZE);
    
    try {
      const translatedBatch = await translateBatch(batch, sourceLang, targetLang, apiKey, modelId);
      
      // Map translations back to the results
      translatedBatch.forEach(t => {
        const index = results.findIndex(r => r.id === t.id);
        if (index !== -1) {
          results[index] = {
            ...results[index],
            text: t.text
          };
        }
      });

      processedCount += batch.length;
      onProgress(Math.min(processedCount, subtitles.length));
      onBatchComplete([...results]); // Send live update
      
      // Increased delay to 1000ms to ensure stability and avoid 500/rate-limit errors
      await delay(1000);
      
    } catch (e) {
      console.error(`Batch starting at ${i} failed after retries`, e);
      // Propagate error to stop processing and alert user
      throw new Error(`Translation failed at subtitle #${batch[0].id}. The server might be busy or the content too complex. Please try again.`);
    }
  }

  return results;
};