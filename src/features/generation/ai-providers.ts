import { AppError } from '@/src/lib/errors';
import type { AIProviderType, SettingsRecord } from '@/src/lib/zod-schemas';

export interface AICompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseSchema?: Record<string, unknown>;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AICompletionResult {
  text: string;
  provider: AIProviderType;
  model: string;
  latencyMs: number;
}

export const DEFAULT_MODELS_BY_PROVIDER: Record<AIProviderType, string[]> = {
  none: [],
  gemini: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'],
  ollama: ['llama3.2', 'llama3.1', 'mistral', 'gemma2', 'qwen2.5', 'deepseek-r1'],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
  openrouter: [
    'meta-llama/llama-3.2-3b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'deepseek/deepseek-r1:free',
    'anthropic/claude-3.5-sonnet',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
  proxy: ['gemini-3.5-flash', 'llama3.2', 'gpt-4o-mini'],
};

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Cancelled', 'AbortError'));
      },
      { once: true }
    );
  });
}

async function fetchWithTimeoutAndRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Request cancelled by user', 'AbortError');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok) return response;

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
        const bodyText = await response.text().catch(() => '');
        throw new AppError(
          `AI provider returned HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`,
          { code: `AI_HTTP_${response.status}` }
        );
      }
    } catch (err) {
      if (externalSignal?.aborted) {
        throw new DOMException('Request cancelled by user', 'AbortError');
      }
      lastError = err;
      if (attempt === maxAttempts) {
        if (err instanceof AppError) throw err;
        throw new AppError(
          err instanceof Error && err.name === 'AbortError'
            ? `AI request timed out after ${Math.round(timeoutMs / 1000)}s.`
            : err instanceof Error
              ? err.message
              : 'Network error calling AI provider.',
          { code: 'AI_NETWORK_ERROR', cause: err }
        );
      }
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }

    await sleep(600 * attempt, externalSignal);
  }

  throw lastError instanceof Error ? lastError : new AppError('AI request failed.');
}

export function isAIConfigured(
  settings: Pick<SettingsRecord, 'aiProvider' | 'aiApiKey' | 'proxyEndpoint'> & {
    ollamaEndpoint?: string;
  }
): boolean {
  if (settings.aiProvider === 'none') return false;
  if (settings.aiProvider === 'ollama') return true;
  if (settings.aiProvider === 'proxy') return Boolean(settings.proxyEndpoint.trim());
  return Boolean(settings.aiApiKey.trim());
}

export async function callAIProvider(
  settings: Pick<SettingsRecord, 'aiProvider' | 'aiModel' | 'aiApiKey' | 'proxyEndpoint'> & {
    ollamaEndpoint?: string;
  },
  request: AICompletionRequest
): Promise<AICompletionResult> {
  if (settings.aiProvider === 'none') {
    throw new AppError('AI provider is set to Offline / Bank-Only mode.', { code: 'AI_DISABLED' });
  }

  const startedAt = Date.now();
  const timeoutMs = request.timeoutMs ?? 45_000;
  const temperature = request.temperature ?? 0.35;
  const maxTokens = request.maxTokens ?? 4096;
  const model =
    settings.aiModel.trim() || DEFAULT_MODELS_BY_PROVIDER[settings.aiProvider][0] || 'gemini-4-hydrogen';

  if (settings.aiProvider === 'gemini') {
    const key = settings.aiApiKey.trim();
    if (!key) throw new AppError('Missing Gemini API key in local settings.', { code: 'MISSING_API_KEY' });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;
    const isGemini4 = /^gemini-4/i.test(model);
    const isGemini3 = /^gemini-3/i.test(model);

    const generationConfig: Record<string, unknown> = {
      responseMimeType: 'application/json',
    };
    if (request.responseSchema) {
      generationConfig.responseSchema = request.responseSchema;
    }
    if (isGemini4) {
      // Gemini 4 models discourage deprecated sampling params & low maxOutputTokens caps
      // that include thinking tokens; use LOW thinking level so full JSON output fits cleanly.
      generationConfig.thinkingConfig = {
        thinkingLevel: request.thinkingLevel ?? 'LOW',
      };
    } else if (isGemini3) {
      generationConfig.thinkingConfig = {
        thinkingLevel: request.thinkingLevel ?? 'LOW',
      };
      generationConfig.maxOutputTokens = Math.max(maxTokens, 8192);
    } else {
      generationConfig.temperature = temperature;
      generationConfig.maxOutputTokens = Math.max(maxTokens, 8192);
    }

    let lastFinishReason: string | undefined;
    for (let emptyRetry = 0; emptyRetry < 2; emptyRetry++) {
      const res = await fetchWithTimeoutAndRetry(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
            generationConfig,
          }),
        },
        timeoutMs,
        request.signal
      );

      const payload = (await res.json()) as {
        candidates?: Array<{
          finishReason?: string;
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        }>;
        promptFeedback?: { blockReason?: string };
      };

      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      lastFinishReason = payload.candidates?.[0]?.finishReason;
      const text = parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text ?? '')
        .join('');

      if (text.trim()) {
        return { text, provider: 'gemini', model, latencyMs: Date.now() - startedAt };
      }

      const blockReason = payload.promptFeedback?.blockReason;
      if (blockReason) {
        throw new AppError(`Gemini blocked the request (${blockReason}).`, {
          code: 'AI_BLOCKED',
        });
      }

      if (emptyRetry === 0) {
        await sleep(500, request.signal);
      }
    }

    throw new AppError(
      lastFinishReason
        ? `Gemini returned an empty response (${lastFinishReason}).`
        : 'Gemini returned an empty response.',
      { code: 'EMPTY_AI_RESPONSE' }
    );
  }

  if (settings.aiProvider === 'openai') {
    const key = settings.aiApiKey.trim();
    if (!key) throw new AppError('Missing OpenAI API key in local settings.', { code: 'MISSING_API_KEY' });

    const res = await fetchWithTimeoutAndRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
      },
      timeoutMs,
      request.signal
    );

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new AppError('OpenAI returned an empty response.', { code: 'EMPTY_AI_RESPONSE' });
    }
    return { text, provider: 'openai', model, latencyMs: Date.now() - startedAt };
  }

  if (settings.aiProvider === 'anthropic') {
    const key = settings.aiApiKey.trim();
    if (!key) {
      throw new AppError('Missing Anthropic API key in local settings.', { code: 'MISSING_API_KEY' });
    }

    const res = await fetchWithTimeoutAndRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
        }),
      },
      timeoutMs,
      request.signal
    );

    const payload = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = payload.content?.find((c) => c.type === 'text')?.text ?? '';
    if (!text.trim()) {
      throw new AppError('Anthropic returned an empty response.', { code: 'EMPTY_AI_RESPONSE' });
    }
    return { text, provider: 'anthropic', model, latencyMs: Date.now() - startedAt };
  }

  // Local Ollama (100% Offline & Free)
  if (settings.aiProvider === 'ollama') {
    const rawEndpoint = (settings.ollamaEndpoint || 'http://localhost:11434').trim().replace(/\/+$/, '');
    const isV1 = rawEndpoint.endsWith('/v1') || rawEndpoint.endsWith('/v1/chat/completions');
    const endpoint = isV1
      ? rawEndpoint.endsWith('/chat/completions')
        ? rawEndpoint
        : `${rawEndpoint}/chat/completions`
      : `${rawEndpoint}/api/chat`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.aiApiKey.trim()) {
      headers['Authorization'] = `Bearer ${settings.aiApiKey.trim()}`;
    }

    try {
      if (isV1) {
        const res = await fetchWithTimeoutAndRetry(
          endpoint,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              temperature,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: request.systemPrompt },
                { role: 'user', content: request.userPrompt },
              ],
            }),
          },
          timeoutMs,
          request.signal
        );
        const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = payload.choices?.[0]?.message?.content ?? '';
        if (!text.trim()) {
          throw new AppError('Ollama returned an empty response.', { code: 'EMPTY_AI_RESPONSE' });
        }
        return { text, provider: 'ollama', model, latencyMs: Date.now() - startedAt };
      } else {
        const res = await fetchWithTimeoutAndRetry(
          endpoint,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: request.systemPrompt },
                { role: 'user', content: request.userPrompt },
              ],
              format: 'json',
              stream: false,
              options: {
                temperature,
              },
            }),
          },
          timeoutMs,
          request.signal
        );
        const payload = (await res.json()) as {
          message?: { content?: string };
          response?: string;
        };
        const text = payload.message?.content ?? payload.response ?? '';
        if (!text.trim()) {
          throw new AppError('Ollama returned an empty response.', { code: 'EMPTY_AI_RESPONSE' });
        }
        return { text, provider: 'ollama', model, latencyMs: Date.now() - startedAt };
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/Failed to fetch|NetworkError|CORS|load failed/i.test(msg)) {
        throw new AppError(
          `Cannot connect to local Ollama at ${rawEndpoint}. Ensure Ollama is running ('ollama run ${model}') and permits browser connections: run 'set OLLAMA_ORIGINS=*' (Windows) or 'OLLAMA_ORIGINS=* ollama serve' before starting Ollama.`,
          { code: 'OLLAMA_CONNECTION_ERROR', cause: err }
        );
      }
      throw err;
    }
  }

  // Groq Ultra-Fast Cloud Inference
  if (settings.aiProvider === 'groq') {
    const key = settings.aiApiKey.trim();
    if (!key) {
      throw new AppError(
        'Missing Groq API key in local settings. Get a free high-speed key at https://console.groq.com/keys',
        { code: 'MISSING_API_KEY' }
      );
    }

    const res = await fetchWithTimeoutAndRetry(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: Math.min(maxTokens, 8192),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
      },
      timeoutMs,
      request.signal
    );

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new AppError('Groq returned an empty response.', { code: 'EMPTY_AI_RESPONSE' });
    }
    return { text, provider: 'groq', model, latencyMs: Date.now() - startedAt };
  }

  // OpenRouter Multi-Model Aggregator (supports free and open-source models)
  if (settings.aiProvider === 'openrouter') {
    const key = settings.aiApiKey.trim();
    if (!key) {
      throw new AppError(
        'Missing OpenRouter API key in local settings. Get an API key at https://openrouter.ai/keys',
        { code: 'MISSING_API_KEY' }
      );
    }

    const res = await fetchWithTimeoutAndRetry(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://edupulse-ai-gamma.vercel.app',
          'X-Title': 'EduPulse AI Studio',
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
      },
      timeoutMs,
      request.signal
    );

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new AppError('OpenRouter returned an empty response.', { code: 'EMPTY_AI_RESPONSE' });
    }
    return { text, provider: 'openrouter', model, latencyMs: Date.now() - startedAt };
  }

  // Stateless Proxy Mode
  const proxyUrl = settings.proxyEndpoint.trim() || '/api/ai/generate';
  const res = await fetchWithTimeoutAndRetry(
    proxyUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        systemPrompt: request.systemPrompt,
        userPrompt: request.userPrompt,
        temperature,
        maxTokens,
      }),
    },
    timeoutMs,
    request.signal
  );

  const payload = (await res.json()) as { text?: string };
  const text = payload.text ?? '';
  if (!text.trim()) {
    throw new AppError('Stateless proxy returned an empty response.', { code: 'EMPTY_AI_RESPONSE' });
  }
  return { text, provider: 'proxy', model, latencyMs: Date.now() - startedAt };
}

export async function testAIConnection(
  settings: Pick<SettingsRecord, 'aiProvider' | 'aiModel' | 'aiApiKey' | 'proxyEndpoint'> & {
    ollamaEndpoint?: string;
  }
): Promise<{ ok: boolean; latencyMs: number; model: string; message: string }> {
  const result = await callAIProvider(settings, {
    systemPrompt: 'Respond only with valid JSON.',
    userPrompt: 'Return {"ok": true, "status": "ready"}',
    temperature: 0,
    maxTokens: 64,
    timeoutMs: 15_000,
  });
  return {
    ok: true,
    latencyMs: result.latencyMs,
    model: result.model,
    message: `Connected to ${result.provider} (${result.model}) in ${result.latencyMs} ms.`,
  };
}
