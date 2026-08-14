import { SubtitleNode } from "../../types";
import { enforceRateLimit } from "./rateLimiter";
import { cleanAndRepairJSON, getTranslationPrompt } from "./geminiService";

export const validateAnthropicApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey || (!apiKey.startsWith('sk-ant-') && !apiKey.startsWith('sk-'))) return false;
  try {
    await enforceRateLimit();
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    });
    if (response.ok) return true;

    const msgResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
    });
    return msgResponse.ok;
  } catch (error) {
    return false;
  }
};

export async function translateWithAnthropic(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
  const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));
  const systemPrompt = getTranslationPrompt(sourceLang, targetLang, contentToTranslate);

  await enforceRateLimit();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Respond ONLY with the requested JSON array.' }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Anthropic API error: ${response.statusText}`);
  }

  const data = await response.json();
  const responseText = data.content?.[0]?.text;
  if (!responseText) throw new Error("Received empty response from Anthropic.");

  const cleanedText = cleanAndRepairJSON(responseText);
  const parsed = JSON.parse(cleanedText);
  const arrayResult = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray);

  if (!arrayResult) throw new Error("Invalid JSON format from Anthropic.");
  return arrayResult;
}
