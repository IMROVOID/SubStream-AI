import { GoogleGenAI, GenerationConfig } from "@google/genai";
import OpenAI from 'openai';
import { SubtitleNode, AIModel, LANGUAGES } from "../types";

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

// --- API Key Validation ---

export const validateGoogleApiKey = async (apiKey: string): Promise<boolean> => {
    if (!apiKey || !apiKey.startsWith('AIzaSy')) return false;
    try {
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.countTokens({ model: "gemini-pro", contents: [{ role: "user", parts: [{ text: "test" }] }] });
        return true;
    } catch (error) {
        console.error("Google API Key validation failed:", error);
        return false;
    }
};

export const validateOpenAIApiKey = async (apiKey: string): Promise<boolean> => {
    if (!apiKey || !apiKey.startsWith('sk-')) return false;
    try {
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        await openai.models.list(); // Simple API call to verify the key
        return true;
    } catch (error) {
        console.error("OpenAI API Key validation failed:", error);
        return false;
    }
};

// --- Transcription ---

async function transcribeWithGoogle(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const audioBuffer = await audioBlob.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioBuffer);
    const audioParts = [{ inlineData: { data: base64Audio, mimeType: audioBlob.type } }];

    const prompt = `You are an expert audio transcription service. 
    Transcribe the following audio which is in ${sourceLang === 'auto' ? 'the auto-detected language' : sourceLang}.
    Your output MUST be ONLY in the SRT (SubRip) format. 
    Do not include any other text, explanations, or markdown formatting.
    
    Example output format:
    1
    00:00:01,000 --> 00:00:04,500
    This is the first line of dialogue.
    
    2
    00:00:05,100 --> 00:00:08,000
    And this is the second.`;

    const result = await ai.models.generateContent({ model: modelId, contents: [{ role: "user", parts: [{ text: prompt }, ...audioParts] }] });
    const text = result.text;
    return text.replace(/```srt\n|```/g, '').trim();
}

async function transcribeWithOpenAI(audioBlob: Blob, sourceLang: string, apiKey: string, modelId: string): Promise<string> {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    const audioFile = new File([audioBlob], "audio.mp3", { type: audioBlob.type });

    const options: OpenAI.Audio.Transcriptions.TranscriptionCreateParams = {
        file: audioFile,
        model: modelId,
        response_format: 'srt',
    };

    if (sourceLang !== 'auto') {
        const langData = LANGUAGES.find(l => l.name === sourceLang);
        if (langData) options.language = langData.code;
    }
    
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
    1. Maintain the context of the dialogue. Look at surrounding lines in the batch to understand incomplete sentences.
    2. Keep the translation concise to fit within subtitle timing constraints.
    3. Do NOT translate proper nouns or technical terms if they are standard in the target region.
    4. Return ONLY a JSON array containing objects with 'id' and 'text' (the translated text).
    5. The 'id' must match the input 'id' exactly.
    6. Do not include timestamps in the output, only the ID and the translated text.
    
    The JSON to translate is below:
    ${JSON.stringify(contentToTranslate)}`;
};

async function translateWithGoogle(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
    const ai = new GoogleGenAI({ apiKey });
    const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));
    const systemInstruction = getTranslationPrompt(sourceLang, targetLang, contentToTranslate);
    const generationConfig: GenerationConfig = { responseMimeType: 'application/json' };

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

    const response = await openai.chat.completions.create({
        model: modelId,
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
    });
    
    const responseText = response.choices[0].message.content;
    if (!responseText) throw new Error("Received empty response from OpenAI.");
    
    const parsed = JSON.parse(responseText);
    const arrayResult = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray);

    if (!arrayResult) throw new Error("Invalid JSON format from OpenAI: could not find a JSON array in the response.");
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
  
  if (!apiKey) throw new Error(`API Key for ${model.provider} is missing. Please add the appropriate key in Settings.`);

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
      
      await delay(1000);
      
    } catch (e) {
      console.error(`Batch starting at ${i} failed after retries`, e);
      throw new Error(`Translation failed at subtitle #${batch[0].id}. The server might be busy or the content too complex. Please try again.`);
    }
  }

  return results;
};