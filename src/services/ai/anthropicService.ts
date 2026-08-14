import { SubtitleNode } from "../../types";
import { enforceRateLimit } from "./rateLimiter";
import { cleanAndRepairJSON, getTranslationPrompt } from "./geminiService";

const DIRECT_ANTHROPIC_URL = 'https://api.anthropic.com/v1';
const BACKEND_ANTHROPIC_PROXY = 'http://localhost:4000/api/proxy/ai/anthropic/v1';

async function fetchAnthropic(
  endpoint: string,
  options: RequestInit
): Promise<Response> {
  await enforceRateLimit();

  // Try direct first
  try {
    const directRes = await fetch(`${DIRECT_ANTHROPIC_URL}${endpoint}`, options);
    // If the server responded (even with a 4xx/5xx status code), return it directly
    return directRes;
  } catch (err: any) {
    console.warn("[Anthropic Service] Direct request failed with network error, retrying via backend AI proxy...", err?.message);
    try {
      const proxyRes = await fetch(`${BACKEND_ANTHROPIC_PROXY}${endpoint}`, options);
      return proxyRes;
    } catch (proxyErr: any) {
      console.error("[Anthropic Service] Proxy request also failed:", proxyErr?.message);
      throw err;
    }
  }
}

export const validateAnthropicApiKey = async (apiKey: string): Promise<boolean> => {
  const trimmed = apiKey?.trim();
  if (!trimmed || (!trimmed.startsWith('sk-ant-') && !trimmed.startsWith('sk-'))) return false;

  try {
    const response = await fetchAnthropic('/models', {
      method: 'GET',
      headers: {
        'x-api-key': trimmed,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      }
    });

    if (response.ok) return true;
    if (response.status === 401) return false;

    const msgResponse = await fetchAnthropic('/messages', {
      method: 'POST',
      headers: {
        'x-api-key': trimmed,
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

    if (msgResponse.ok) return true;
    if (msgResponse.status === 401) return false;
    return trimmed.length > 20;
  } catch (error) {
    // Fallback to length check if network/proxy is offline or unreachable
    return trimmed.length > 20;
  }
};

export async function translateWithAnthropic(subtitles: SubtitleNode[], sourceLang: string, targetLang: string, apiKey: string, modelId: string): Promise<{ id: number; text: string }[]> {
  const contentToTranslate = subtitles.map(s => ({ id: s.id, text: s.text }));
  const systemPrompt = getTranslationPrompt(sourceLang, targetLang, contentToTranslate);

  const response = await fetchAnthropic('/messages', {
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
