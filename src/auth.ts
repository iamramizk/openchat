import { readFileSync, writeFileSync, existsSync } from "fs"
import { mkdirSync } from "fs"
import { dirname } from "path"
import { authFile, dataDir } from "./paths.ts"
import { PROVIDERS } from "./providers.ts"

// ---------------------------------------------------------------------------
// Auth store — ~/.local/share/openchat/auth.json (mode 0600)
// Holds per-provider credentials.  The app only writes this file; config.yaml
// is never touched by the runtime.
// ---------------------------------------------------------------------------

export interface ProviderCredential {
  api_key: string
  base_url?: string  // override; falls back to PROVIDERS[name].base_url at resolve time
  /** Display label for custom (user-added) providers — unused for built-ins. */
  label?: string
  /** True if this provider needs no API key. Built-ins read this from PROVIDERS instead. */
  keyless?: boolean
  /** Marks a user-added provider (not in the built-in PROVIDERS registry) — deletable via /connect. */
  custom?: boolean
}

export interface AuthStore {
  providers: Record<string, ProviderCredential>
}

export function loadAuth(): AuthStore {
  const file = authFile()
  if (!existsSync(file)) return { providers: {} }
  try {
    const raw = readFileSync(file, "utf-8")
    const parsed = JSON.parse(raw) as AuthStore
    // Defensive: ensure shape is correct
    if (!parsed || typeof parsed.providers !== "object") return { providers: {} }
    return parsed
  } catch {
    return { providers: {} }
  }
}

export function saveAuth(store: AuthStore): void {
  const file = authFile()
  mkdirSync(dirname(file), { recursive: true })
  // Ensure data dir exists
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(file, JSON.stringify(store, null, 2) + "\n", { mode: 0o600, encoding: "utf-8" })
}

/**
 * Set or update credentials for a named provider.
 * base_url is sourced from PROVIDERS if not explicitly provided.
 * Persists immediately to auth.json.
 */
export function setProviderKey(
  store: AuthStore,
  providerName: string,
  api_key: string,
): AuthStore {
  const existing = store.providers[providerName]
  const providerDef = PROVIDERS[providerName]
  const updated: AuthStore = {
    providers: {
      ...store.providers,
      [providerName]: {
        ...existing,
        api_key,
        base_url: existing?.base_url ?? providerDef?.base_url,
      },
    },
  }
  saveAuth(updated)
  return updated
}

/**
 * Register a keyless provider (e.g. Ollama) with an optional base_url override.
 * Stores api_key as "" so the entry exists in auth.json for base_url resolution.
 * Persists immediately to auth.json.
 */
export function setProviderBaseUrl(
  store: AuthStore,
  providerName: string,
  base_url: string,
): AuthStore {
  const existing = store.providers[providerName]
  const updated: AuthStore = {
    providers: {
      ...store.providers,
      [providerName]: {
        ...existing,
        api_key: existing?.api_key ?? "",
        base_url,
      },
    },
  }
  saveAuth(updated)
  return updated
}

/**
 * Add or update a custom OpenAI-compatible provider (e.g. a local server).
 * An empty api_key marks the provider keyless so resolveConnection accepts it
 * without credentials. Persists immediately to auth.json.
 */
export function setCustomProvider(
  store: AuthStore,
  providerId: string,
  def: { label: string; base_url: string; api_key: string },
): AuthStore {
  const updated: AuthStore = {
    providers: {
      ...store.providers,
      [providerId]: {
        api_key: def.api_key,
        base_url: def.base_url,
        label: def.label,
        keyless: def.api_key.trim() === "",
        custom: true,
      },
    },
  }
  saveAuth(updated)
  return updated
}

/** Remove a provider's credentials/definition entirely. Persists immediately. */
export function removeProvider(store: AuthStore, providerId: string): AuthStore {
  const providers = { ...store.providers }
  delete providers[providerId]
  const updated: AuthStore = { providers }
  saveAuth(updated)
  return updated
}
