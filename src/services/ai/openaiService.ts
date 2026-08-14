import OpenAI from 'openai';
import { SubtitleNode, LANGUAGES } from "../../types";
import { enforceRateLimit } from "./rateLimiter";
import { getTranslationPrompt } from "./geminiService";

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

export async function transcribeWithOpenAI(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
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

export async function translateWithOpenAI(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
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
