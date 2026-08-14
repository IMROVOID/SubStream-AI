import OpenAI from 'openai';
import { SubtitleNode, LANGUAGES } from "../../types";
import { enforceRateLimit } from "./rateLimiter";
import { getTranslationPrompt } from "./geminiService";

const BACKEND_OPENAI_PROXY = 'http://localhost:4000/api/proxy/ai/openai/v1';

export const validateOpenAIApiKey = async (apiKey: string): Promise<boolean> => {
  const trimmed = apiKey?.trim();
  if (!trimmed || !trimmed.startsWith('sk-') || trimmed.length < 20) return false;

  await enforceRateLimit();

  // Try direct connection first
  try {
    const directClient = new OpenAI({ apiKey: trimmed, dangerouslyAllowBrowser: true });
    await directClient.models.list();
    return true;
  } catch (directErr: any) {
    // If 401 Unauthorized or auth failure, the API key is genuinely invalid
    const status = directErr?.status || directErr?.response?.status;
    const msg = directErr?.message || '';
    if (status === 401 || (status === 403 && (msg.includes('Incorrect API key') || msg.includes('invalid_api_key')))) {
      return false;
    }

    // Otherwise, direct browser access might be blocked/filtered (e.g. ERR_CERT_COMMON_NAME_INVALID).
    // Try via the backend AI proxy
    try {
      const proxyClient = new OpenAI({
        apiKey: trimmed,
        baseURL: BACKEND_OPENAI_PROXY,
        dangerouslyAllowBrowser: true
      });
      await proxyClient.models.list();
      return true;
    } catch (proxyErr: any) {
      const proxyStatus = proxyErr?.status || proxyErr?.response?.status;
      const proxyMsg = proxyErr?.message || '';
      if (proxyStatus === 401 || (proxyStatus === 403 && (proxyMsg.includes('Incorrect API key') || proxyMsg.includes('invalid_api_key')))) {
        return false;
      }
      console.warn("[OpenAI] Validation failed on both direct and proxy:", directErr?.message, proxyErr?.message);
      // ponytail: Fallback to syntactic length validation if network/proxy is offline or unreachable
      return trimmed.length > 20 && trimmed.startsWith('sk-');
    }
  }
};

async function executeWithOpenAIFallback<T>(
  apiKey: string,
  fn: (client: OpenAI) => Promise<T>
): Promise<T> {
  await enforceRateLimit();

  try {
    const directClient = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    return await fn(directClient);
  } catch (err: any) {
    const isNetworkError = !err.status || err.status === 502 || err.status === 504 ||
      (err.message && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch') || err.message.includes('certificate')));

    if (isNetworkError) {
      console.warn("[OpenAI Service] Direct request failed with network error, retrying via backend AI proxy...");
      const proxyClient = new OpenAI({
        apiKey,
        baseURL: BACKEND_OPENAI_PROXY,
        dangerouslyAllowBrowser: true
      });
      return await fn(proxyClient);
    }
    throw err;
  }
}

export async function transcribeWithOpenAI(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
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
  
  return executeWithOpenAIFallback(apiKey, async (client) => {
    const transcription = await client.audio.transcriptions.create(options) as any;
    if (typeof transcription !== 'string') throw new Error('OpenAI transcription returned an invalid result.');
    return transcription;
  });
}

export async function translateWithOpenAI(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
  const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));
  const systemPrompt = getTranslationPrompt(sourceLang, targetLang, contentToTranslate);

  return executeWithOpenAIFallback(apiKey, async (client) => {
    const response = await client.chat.completions.create({
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
  });
}
