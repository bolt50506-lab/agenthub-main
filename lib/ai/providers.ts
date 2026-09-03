export type AIProvider = 'gemini' | 'groq' | 'ollama';

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  businessId?: string;
}

export interface ProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  apiUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface AIProviderAdapter {
  isConfigured(config?: ProviderConfig): boolean;

  generate(
    request: AIRequest,
    config: ProviderConfig
  ): Promise<AIResponse>;
}

function getEnv(name: string): string | undefined {
  const value = process.env[name];

  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed || undefined;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function buildMessages(request: AIRequest): AIMessage[] {
  const messages: AIMessage[] = [];

  if (request.systemPrompt?.trim()) {
    messages.push({
      role: 'system',
      content: request.systemPrompt.trim(),
    });
  }

  for (const message of request.messages || []) {
    if (!message || !message.content?.trim()) {
      continue;
    }

    messages.push({
      role: message.role,
      content: message.content.trim(),
    });
  }

  return messages;
}

/*
|--------------------------------------------------------------------------
| Per-provider timeout
|--------------------------------------------------------------------------
|
| Without this, a slow/hanging provider (rate-limited Gemini, a cold-start
| or overloaded local Ollama, a stalled TCP connection to Groq) could sit
| on its fetch() indefinitely. The outer WhatsApp service's 45s timeout
| would eventually fire, but by then the whole fallback chain had already
| been silently stuck on one provider. Capping each provider at 15s means
| a bad provider fails fast and the loop moves on to the next one instead
| of burning the entire request budget on a single stalled call.
|
*/

const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_PROVIDER_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'AbortError'
  );
}

async function readJsonSafely(
  response: Response
): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

function getErrorMessage(
  data: unknown,
  fallback: string
): string {
  if (!data) {
    return fallback;
  }

  if (
    typeof data === 'object' &&
    data !== null
  ) {
    const obj = data as Record<string, unknown>;

    if (typeof obj.error === 'string') {
      return obj.error;
    }

    if (
      typeof obj.error === 'object' &&
      obj.error !== null
    ) {
      const errorObj =
        obj.error as Record<string, unknown>;

      if (
        typeof errorObj.message === 'string'
      ) {
        return errorObj.message;
      }
    }

    if (typeof obj.message === 'string') {
      return obj.message;
    }

    if (typeof obj.raw === 'string') {
      return obj.raw;
    }
  }

  return fallback;
}

/* =========================================================
   GEMINI PROVIDER
========================================================= */

class GeminiProvider
  implements AIProviderAdapter
{
  isConfigured(
    config?: ProviderConfig
  ): boolean {
    return Boolean(
      config?.apiKey?.trim() ||
        getEnv('GEMINI_API_KEY')
    );
  }

  async generate(
    request: AIRequest,
    config: ProviderConfig
  ): Promise<AIResponse> {
    const provider: AIProvider = 'gemini';

    const apiKey =
      config.apiKey?.trim() ||
      getEnv('GEMINI_API_KEY');

    const model =
      config.model?.trim() ||
      'gemini-2.5-flash';

    if (!apiKey) {
      return {
        content: '',
        provider,
        model,
        error:
          'Gemini API key is not configured.',
      };
    }

    const cleanModel = model.startsWith(
      'models/'
    )
      ? model.slice('models/'.length)
      : model;

    const baseUrl = normalizeUrl(
      config.apiUrl?.trim() ||
        'https://generativelanguage.googleapis.com/v1beta'
    );

    const url =
      baseUrl +
      '/models/' +
      encodeURIComponent(cleanModel) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const messages = buildMessages(request);

    const systemMessage = messages.find(
      (message) =>
        message.role === 'system'
    );

    const conversationMessages =
      messages.filter(
        (message) =>
          message.role !== 'system'
      );

    const contents = conversationMessages.map(
      (message) => ({
        role:
          message.role === 'assistant'
            ? 'model'
            : 'user',
        parts: [
          {
            text: message.content,
          },
        ],
      })
    );

    /*
    Gemini 3.x and 2.5 models "think" before answering by default, which
    adds real latency even for a short chat reply (observed: 165 thinking
    tokens for a one-word "hi"). Gemini 3.x can't fully disable thinking,
    but thinkingLevel: "low" cuts it down; 2.5-series models use a
    separate thinkingBudget: 0 to disable it outright. This keeps replies
    snappy for a WhatsApp bot where reasoning depth rarely matters.
    */
    const thinkingConfig = cleanModel.startsWith(
      'gemini-3'
    )
      ? { thinkingLevel: 'low' }
      : cleanModel.startsWith('gemini-2.5')
      ? { thinkingBudget: 0 }
      : undefined;

    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          ...(systemMessage
            ? {
                systemInstruction: {
                  parts: [
                    {
                      text: systemMessage.content,
                    },
                  ],
                },
              }
            : {}),
          contents,
          generationConfig: {
            temperature:
              request.temperature ??
              config.temperature ??
              0.7,
            maxOutputTokens:
              request.maxTokens ??
              config.maxTokens ??
              1024,
            ...(thinkingConfig
              ? { thinkingConfig }
              : {}),
          },
        }),
      });

      const data =
        await readJsonSafely(response);

      if (!response.ok) {
        return {
          content: '',
          provider,
          model,
          error: getErrorMessage(
            data,
            'Gemini request failed with status ' +
              response.status
          ),
        };
      }

      const result =
        data as Record<string, unknown>;

      const candidates =
        result.candidates as
          | Array<Record<string, unknown>>
          | undefined;

      const firstCandidate =
        candidates?.[0];

      const content =
        firstCandidate?.content as
          | Record<string, unknown>
          | undefined;

      const parts =
        content?.parts as
          | Array<Record<string, unknown>>
          | undefined;

      const text =
        parts
          ?.map((part) =>
            typeof part.text === 'string'
              ? part.text
              : ''
          )
          .join('')
          .trim() || '';

      if (!text) {
        return {
          content: '',
          provider,
          model,
          error:
            'Gemini returned an empty response.',
        };
      }

      const usageMetadata =
        result.usageMetadata as
          | Record<string, unknown>
          | undefined;

      return {
        content: text,
        provider,
        model,
        usage: usageMetadata
          ? {
              promptTokens:
                typeof usageMetadata.promptTokenCount ===
                'number'
                  ? usageMetadata.promptTokenCount
                  : undefined,

              completionTokens:
                typeof usageMetadata.candidatesTokenCount ===
                'number'
                  ? usageMetadata.candidatesTokenCount
                  : undefined,

              totalTokens:
                typeof usageMetadata.totalTokenCount ===
                'number'
                  ? usageMetadata.totalTokenCount
                  : undefined,
            }
          : undefined,
      };
    } catch (error) {
      return {
        content: '',
        provider,
        model,
        error: isTimeoutError(error)
          ? 'Gemini request timed out after ' +
            DEFAULT_PROVIDER_TIMEOUT_MS / 1000 +
            's.'
          : error instanceof Error
          ? error.message
          : 'Gemini request failed.',
      };
    }
  }
}

/* =========================================================
   GROQ PROVIDER
========================================================= */

class GroqProvider
  implements AIProviderAdapter
{
  isConfigured(
    config?: ProviderConfig
  ): boolean {
    return Boolean(
      config?.apiKey?.trim() ||
        getEnv('GROQ_API_KEY')
    );
  }

  async generate(
    request: AIRequest,
    config: ProviderConfig
  ): Promise<AIResponse> {
    const provider: AIProvider = 'groq';

    const apiKey =
      config.apiKey?.trim() ||
      getEnv('GROQ_API_KEY');

    const model =
      config.model?.trim() ||
      'openai/gpt-oss-120b';

    if (!apiKey) {
      return {
        content: '',
        provider,
        model,
        error:
          'Groq API key is not configured.',
      };
    }

    const baseUrl = normalizeUrl(
      config.apiUrl?.trim() ||
        'https://api.groq.com/openai/v1'
    );

    const url =
      baseUrl.endsWith(
        '/chat/completions'
      )
        ? baseUrl
        : baseUrl +
          '/chat/completions';

    const messages = buildMessages(request);

    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
          Authorization:
            'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature:
            request.temperature ??
            config.temperature ??
            0.7,
          max_tokens:
            request.maxTokens ??
            config.maxTokens ??
            1024,
        }),
      });

      const data =
        await readJsonSafely(response);

      if (!response.ok) {
        return {
          content: '',
          provider,
          model,
          error: getErrorMessage(
            data,
            'Groq request failed with status ' +
              response.status
          ),
        };
      }

      const result =
        data as Record<string, unknown>;

      const choices =
        result.choices as
          | Array<Record<string, unknown>>
          | undefined;

      const firstChoice =
        choices?.[0];

      const message =
        firstChoice?.message as
          | Record<string, unknown>
          | undefined;

      const content =
        typeof message?.content ===
        'string'
          ? message.content.trim()
          : '';

      if (!content) {
        return {
          content: '',
          provider,
          model,
          error:
            'Groq returned an empty response.',
        };
      }

      const usage =
        result.usage as
          | Record<string, unknown>
          | undefined;

      return {
        content,
        provider,
        model,
        usage: usage
          ? {
              promptTokens:
                typeof usage.prompt_tokens ===
                'number'
                  ? usage.prompt_tokens
                  : undefined,

              completionTokens:
                typeof usage.completion_tokens ===
                'number'
                  ? usage.completion_tokens
                  : undefined,

              totalTokens:
                typeof usage.total_tokens ===
                'number'
                  ? usage.total_tokens
                  : undefined,
            }
          : undefined,
      };
    } catch (error) {
      return {
        content: '',
        provider,
        model,
        error: isTimeoutError(error)
          ? 'Groq request timed out after ' +
            DEFAULT_PROVIDER_TIMEOUT_MS / 1000 +
            's.'
          : error instanceof Error
          ? error.message
          : 'Groq request failed.',
      };
    }
  }
}

/* =========================================================
   OLLAMA PROVIDER
========================================================= */

class OllamaProvider
  implements AIProviderAdapter
{
  isConfigured(
    config?: ProviderConfig
  ): boolean {
    /*
    BUG THIS FIXES: the trailing `|| true` meant this always returned
    true regardless of whether an Ollama URL was actually configured,
    so the fallback loop would attempt Ollama even with nothing set up
    - wasting the connection-attempt time on every request that reached
    it instead of skipping straight past.
    */
    return Boolean(
      config?.apiUrl?.trim() ||
        getEnv('OLLAMA_BASE_URL')
    );
  }

  async generate(
    request: AIRequest,
    config: ProviderConfig
  ): Promise<AIResponse> {
    const provider: AIProvider = 'ollama';

    const model =
      config.model?.trim() ||
      'llama3.2';

    const configuredUrl =
      config.apiUrl?.trim() ||
      getEnv('OLLAMA_BASE_URL') ||
      'http://127.0.0.1:11434';

    const baseUrl =
      normalizeUrl(configuredUrl);

    const url = baseUrl.endsWith(
      '/api/chat'
    )
      ? baseUrl
      : baseUrl + '/api/chat';

    const messages = buildMessages(request);

    /*
    Ollama runs locally and can legitimately be slower than a hosted API
    (cold model load, CPU-only inference), so it gets a longer budget
    than Gemini/Groq - but still bounded, so it can't eat the entire
    outer request timeout on its own.
    */
    const OLLAMA_TIMEOUT_MS = 25000;

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            options: {
              temperature:
                request.temperature ??
                config.temperature ??
                0.7,
              num_predict:
                request.maxTokens ??
                config.maxTokens ??
                1024,
            },
          }),
        },
        OLLAMA_TIMEOUT_MS
      );

      const data =
        await readJsonSafely(response);

      if (!response.ok) {
        return {
          content: '',
          provider,
          model,
          error: getErrorMessage(
            data,
            'Ollama request failed with status ' +
              response.status
          ),
        };
      }

      const result =
        data as Record<string, unknown>;

      const message =
        result.message as
          | Record<string, unknown>
          | undefined;

      const content =
        typeof message?.content ===
        'string'
          ? message.content.trim()
          : '';

      if (!content) {
        return {
          content: '',
          provider,
          model,
          error:
            'Ollama returned an empty response.',
        };
      }

      return {
        content,
        provider,
        model,
      };
    } catch (error) {
      return {
        content: '',
        provider,
        model,
        error: isTimeoutError(error)
          ? 'Ollama request timed out after ' +
            OLLAMA_TIMEOUT_MS / 1000 +
            's.'
          : error instanceof Error
          ? error.message
          : 'Ollama request failed.',
      };
    }
  }
}

/* =========================================================
   PROVIDER REGISTRY
========================================================= */

const providers: Record<
  AIProvider,
  AIProviderAdapter
> = {
  gemini: new GeminiProvider(),
  groq: new GroqProvider(),
  ollama: new OllamaProvider(),
};

export function getAIProvider(
  provider: AIProvider
): AIProviderAdapter {
  return providers[provider];
}

/* =========================================================
   GENERATE WITH SINGLE PROVIDER
========================================================= */

export async function generateAIResponse(
  request: AIRequest,
  config: ProviderConfig
): Promise<AIResponse> {
  const provider =
    providers[config.provider];

  if (!provider) {
    return {
      content: '',
      provider: config.provider,
      model: config.model,
      error:
        'Unsupported AI provider: ' +
        config.provider,
    };
  }

  if (!provider.isConfigured(config)) {
    return {
      content: '',
      provider: config.provider,
      model: config.model,
      error:
        config.provider +
        ' is not configured.',
    };
  }

  return provider.generate(
    request,
    config
  );
}

/* =========================================================
   GENERATE WITH FALLBACK
========================================================= */

export async function generateAIResponseWithFallback(
  request: AIRequest,
  providerConfigs: ProviderConfig[]
): Promise<AIResponse> {
  if (
    !providerConfigs ||
    providerConfigs.length === 0
  ) {
    return {
      content: '',
      provider: 'gemini',
      model: '',
      error:
        'No AI providers are configured.',
    };
  }

  const errors: string[] = [];

  for (
    let index = 0;
    index < providerConfigs.length;
    index++
  ) {
    const config =
      providerConfigs[index];

    if (!config?.provider) {
      errors.push(
        'Invalid provider configuration.'
      );

      continue;
    }

    console.log(
      '[AI] Trying provider:',
      config.provider,
      'Model:',
      config.model
    );

    const attemptStartedAt = Date.now();

    const result =
      await generateAIResponse(
        request,
        config
      );

    const attemptDurationMs =
      Date.now() - attemptStartedAt;

    if (
      !result.error &&
      result.content?.trim()
    ) {
      console.log(
        '[AI] Success with provider:',
        result.provider,
        'Model:',
        result.model,
        'Duration:',
        attemptDurationMs + 'ms'
      );

      return result;
    }

    const errorMessage =
      result.error ||
      'Provider returned an empty response.';

    console.error(
      '[AI] Provider failed:',
      config.provider,
      errorMessage,
      'Duration:',
      attemptDurationMs + 'ms'
    );

    errors.push(
      config.provider +
        ': ' +
        errorMessage
    );
  }

  const lastConfig =
    providerConfigs[
      providerConfigs.length - 1
    ];

  return {
    content: '',
    provider:
      lastConfig?.provider ||
      'gemini',
    model:
      lastConfig?.model || '',
    error:
      'All AI providers failed. ' +
      errors.join(' | '),
  };
}