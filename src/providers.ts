// ---------------------------------------------------------------------------
// Provider registry
// All listed providers use the OpenAI-compatible API shape.
// base_url is the canonical default; auth.json may override per-provider.
// ---------------------------------------------------------------------------

import type { AuthStore } from "./auth.ts"

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

// ---------------------------------------------------------------------------
// Custom providers — user-added OpenAI-compatible endpoints, persisted as
// enriched credential entries in auth.json (see ProviderCredential.custom).
// These helpers merge them with the built-in registry at call sites.
// ---------------------------------------------------------------------------

/** Built-in providers merged with any custom providers found in auth.json. */
export function effectiveProviders(auth: AuthStore): Record<string, ProviderDef> {
  const merged: Record<string, ProviderDef> = { ...PROVIDERS }
  for (const [id, cred] of Object.entries(auth.providers)) {
    if (cred.custom && !merged[id]) {
      merged[id] = { label: cred.label ?? id, base_url: cred.base_url ?? "", keyless: cred.keyless }
    }
  }
  return merged
}

/** Sorted list form of effectiveProviders, for display in /connect and /models. */
export function effectiveProviderList(auth: AuthStore): Array<{ id: string } & ProviderDef> {
  return Object.entries(effectiveProviders(auth)).map(([id, def]) => ({ id, ...def }))
}

/** True if `id` is a user-added provider (deletable), not a built-in. */
export function isCustomProvider(auth: AuthStore, id: string): boolean {
  return Boolean(auth.providers[id]?.custom) && !PROVIDERS[id]
}

function slugifyProviderId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "custom"
}

/** Derive a stable provider id from a label, disambiguating against existing ids. */
export function uniqueProviderId(auth: AuthStore, label: string): string {
  const base = slugifyProviderId(label)
  if (!PROVIDERS[base] && !auth.providers[base]) return base
  let n = 2
  while (PROVIDERS[`${base}-${n}`] || auth.providers[`${base}-${n}`]) n++
  return `${base}-${n}`
}
