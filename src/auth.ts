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
  const providerDef = PROVIDERS[providerName]
  const updated: AuthStore = {
    providers: {
      ...store.providers,
      [providerName]: {
        api_key,
        base_url: providerDef?.base_url,
      },
    },
  }
  saveAuth(updated)
  return updated
}
