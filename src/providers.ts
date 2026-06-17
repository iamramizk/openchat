// ---------------------------------------------------------------------------
// Provider registry
// All listed providers use the OpenAI-compatible API shape.
// base_url is the canonical default; auth.json may override per-provider.
// ---------------------------------------------------------------------------

export interface ProviderDef {
  label: string
  base_url: string
  /** If true the provider needs no API key (e.g. local Ollama). */
  keyless?: boolean
}

export const PROVIDERS: Record<string, ProviderDef> = {
  openrouter: {
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
  },
  groq: {
    label: "Groq",
    base_url: "https://api.groq.com/openai/v1",
  },
  openai: {
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
  },
  ollama: {
    label: "Ollama",
    base_url: "http://localhost:11434/v1",
    keyless: true,
  },
}

/** Sorted list of provider entries for display in /connect. */
export const PROVIDER_LIST: Array<{ id: string } & ProviderDef> = Object.entries(PROVIDERS).map(
  ([id, def]) => ({ id, ...def }),
)
