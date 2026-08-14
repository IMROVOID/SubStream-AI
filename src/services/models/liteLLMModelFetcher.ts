import { AIModel } from '../../types';
import { isMainTextModel, deduplicateToMainModels, sortModelsNewestFirst } from './openRouterModelFetcher';

export async function fetchFromLiteLLM(): Promise<AIModel[]> {
  const response = await fetch(
    'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
  );

  if (!response.ok) {
    throw new Error(`LiteLLM returned status ${response.status}`);
  }

  const data: Record<string, any> = await response.json();
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
