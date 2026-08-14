import { AIModel } from '../../types';
import { isMainTextModel, deduplicateToMainModels, sortModelsNewestFirst } from './openRouterModelFetcher';

const BACKEND_LITELLM_PROXY = 'http://localhost:4000/api/proxy/ai/litellm/model_prices_and_context_window.json';

export async function fetchFromLiteLLM(): Promise<AIModel[]> {
  let data: Record<string, any>;

  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
    );
    if (!response.ok) {
      throw new Error(`LiteLLM returned status ${response.status}`);
    }
    data = await response.json();
  } catch (directErr: any) {
    console.warn('[LiteLLM] Direct fetch failed, trying backend AI proxy...', directErr?.message);
    try {
      const proxyRes = await fetch(BACKEND_LITELLM_PROXY);
      if (!proxyRes.ok) {
        throw new Error(`Backend LiteLLM proxy returned status ${proxyRes.status}`);
      }
      data = await proxyRes.json();
    } catch (proxyErr: any) {
      console.warn('[LiteLLM] Backend proxy also failed:', proxyErr?.message);
      throw directErr;
    }
  }

  const modelsList: AIModel[] = [];

  for (const [rawId, info] of Object.entries(data)) {
    let provider: 'google' | 'openai' | 'anthropic' | null = null;
    let normalizedId = rawId;

    if (rawId.startsWith('google/') || rawId.includes('gemini')) {
      provider = 'google';
      normalizedId = rawId.replace(/^(google\/|vertex_ai\/)/, '');
    } else if (rawId.startsWith('openai/') || rawId.startsWith('gpt-')) {
      provider = 'openai';
      normalizedId = rawId.replace(/^openai\//, '');
    } else if (rawId.startsWith('anthropic/') || rawId.includes('claude')) {
      provider = 'anthropic';
      normalizedId = rawId.replace(/^anthropic\//, '');
    } else {
      continue;
    }

    if (!isMainTextModel(normalizedId, normalizedId, info.modalities)) {
      continue;
    }

    if (normalizedId.includes('/') || normalizedId.includes(':')) {
      continue;
    }

    const tags: string[] = [];
    if (info.max_input_tokens || info.max_tokens) {
      const tokens = info.max_input_tokens || info.max_tokens;
      const kTokens = Math.round(tokens / 1000);
      tags.push(`${kTokens >= 1000 ? Math.round(kTokens / 1000) + 'M' : kTokens + 'k'} Context`);
    }

    modelsList.push({
      id: normalizedId,
      name: normalizedId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: `Frontier ${provider.toUpperCase()} text AI model automatically discovered.`,
      tags,
      provider,
      transcriptionModel: provider === 'openai' || provider === 'anthropic' ? 'whisper-1' : undefined,
      contextLength: info.max_input_tokens || info.max_tokens,
      isDynamic: true,
    });
  }

  const deduplicated = deduplicateToMainModels(modelsList);
  return sortModelsNewestFirst(deduplicated);
}
