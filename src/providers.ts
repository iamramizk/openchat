// ---------------------------------------------------------------------------
// Provider registry
// All listed providers use the OpenAI-compatible API shape.
// base_url is the canonical default; auth.json may override per-provider.
// ---------------------------------------------------------------------------

export interface ProviderDef {
  label: string
  base_url: string
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
}

/** Sorted list of provider entries for display in /connect. */
export const PROVIDER_LIST: Array<{ id: string } & ProviderDef> = Object.entries(PROVIDERS).map(
  ([id, def]) => ({ id, ...def }),
)
