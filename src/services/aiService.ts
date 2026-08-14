import { SubtitleNode, AIModel } from "../types";
import { setGlobalRPM, delay } from "./ai/rateLimiter";
import { validateGoogleApiKey, transcribeWithGoogle, translateWithGoogle } from "./ai/geminiService";
import { validateOpenAIApiKey, transcribeWithOpenAI, translateWithOpenAI } from "./ai/openaiService";
import { validateAnthropicApiKey, translateWithAnthropic } from "./ai/anthropicService";

export { setGlobalRPM };
export { validateGoogleApiKey, validateOpenAIApiKey, validateAnthropicApiKey };

export const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function transcribeAudio(audioBlob: Blob, sourceLang: string, apiKey: string, model: AIModel): Promise<string> {
  if (model.provider === 'openai' || model.provider === 'anthropic') {
    if (!model.transcriptionModel) throw new Error(`Transcription model not defined for ${model.name}.`);
    return transcribeWithOpenAI(audioBlob, sourceLang, apiKey, model.transcriptionModel);
  }
  return transcribeWithGoogle(audioBlob, sourceLang, apiKey, model.id);
}

// ponytail: parse retry delay from 429 error messages (e.g. "Please retry in 11.24s")
const parseRetryDelay = (error: any): number => {
  const msg = error?.message || error?.toString() || '';
  const match = msg.match(/retry in (\d+\.?\d*)/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) return 15000;
  return 0;
};

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
      if (model.provider === 'anthropic') {
        return await translateWithAnthropic(subtitles, sourceLang, targetLang, apiKey, model.id);
      }
      return await translateWithGoogle(subtitles, sourceLang, targetLang, apiKey, model.id);
    } catch (error: any) {
      console.warn(`Attempt ${attempt} failed for ${model.provider}:`, error);
      lastError = error;
      if (attempt < MAX_RETRIES) {
        const serverDelay = parseRetryDelay(error);
        const backoffTime = serverDelay || (RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        console.log(`Retrying in ${backoffTime}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
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