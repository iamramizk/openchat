import { readFileSync, writeFileSync } from "fs"
import { parse, stringify } from "yaml"
import type { Config, ModelEntry } from "./types.ts"
import { colors as theme } from "./theme.ts"
import { configFile, ensureDirectories } from "./paths.ts"

// ---------------------------------------------------------------------------
// Config loader — reads ~/.config/openchat/config.yaml (no secrets)
// Runs first-run bootstrap (ensureDirectories) before parsing.
// Never hard-exits on missing/invalid config — caller decides.
// ---------------------------------------------------------------------------

export function loadConfig(): Config {
  // Bootstrap: create dirs, seed config.yaml and prompts/ if they don't exist
  ensureDirectories()

  let raw: string
  try {
    raw = readFileSync(configFile(), "utf-8")
  } catch {
    throw new Error(`Cannot read config at ${configFile()}`)
  }

  const parsed = parse(raw) as Record<string, unknown>
  const c = (parsed.colors ?? {}) as Record<string, unknown>

  // Parse models[]
  const rawModels = Array.isArray(parsed.models) ? parsed.models : []
  const models: ModelEntry[] = rawModels
    .filter(
      (m): m is Record<string, unknown> =>
        m !== null && typeof m === "object",
    )
    .reduce<ModelEntry[]>((acc, m) => {
      const name = m.name ? String(m.name).trim() : ""
      const provider = m.provider ? String(m.provider).trim() : ""
      const model = m.model ? String(m.model).trim() : ""
      if (!name || !provider || !model) return acc  // skip incomplete entries
      const entry: ModelEntry = { name, provider, model }
      if (m.context_length !== undefined) {
        entry.context_length = Number(m.context_length)
      }
      acc.push(entry)
      return acc
    }, [])

  // Resolve default_model → index
  const defaultModelName = String(parsed.default_model ?? "").trim()
  let defaultModelIndex = 0
  if (defaultModelName && models.length > 0) {
    const idx = models.findIndex((m) => m.name === defaultModelName)
    if (idx >= 0) {
      defaultModelIndex = idx
    } else if (defaultModelName) {
      console.warn(
        `openchat: default_model "${defaultModelName}" not found in models[], using first entry`,
      )
    }
  }

  const config: Config = {
    models,
    defaultModelIndex,
    default_persona: String(parsed.default_persona ?? ""),
    colors: {
      model:   String(c.model   ?? "#58A6FF"),
      persona: String(c.persona ?? "#79C0FF"),
      cost:    String(c.cost    ?? "#A5D6FF"),
      popup:   String(c.popup   ?? theme.bgPanel),
    },
    prompt_char:  String(parsed.prompt_char  ?? ">"),
    prompt_color: String(parsed.prompt_color ?? theme.accent),
  }

  return config
}

// ---------------------------------------------------------------------------
// Config writer — serialises Config back to config.yaml.
// Note: yaml.stringify produces clean YAML without comments; any comments
// in the user's original file are dropped on first write.
// ---------------------------------------------------------------------------

export function saveConfig(config: Config): void {
  const { models, defaultModelIndex, default_persona, colors, prompt_char, prompt_color } = config

  const plain = {
    default_model: models[defaultModelIndex]?.name ?? "",
    models: models.map((m) => {
      const entry: Record<string, unknown> = {
        name: m.name,
        provider: m.provider,
        model: m.model,
      }
      if (m.context_length !== undefined) entry.context_length = m.context_length
      return entry
    }),
    default_persona,
    colors: {
      model:   colors.model,
      persona: colors.persona,
      cost:    colors.cost,
      popup:   colors.popup,
    },
    prompt_char,
    prompt_color,
  }

  writeFileSync(configFile(), stringify(plain), "utf-8")
}

// ---------------------------------------------------------------------------
// Resolve the active connection from config + auth for a given model index.
// Returns null if the model list is empty or the provider has no key.
// ---------------------------------------------------------------------------

import type { AuthStore } from "./auth.ts"
import type { ActiveConnection } from "./types.ts"
import { PROVIDERS } from "./providers.ts"

export function resolveConnection(
  config: Config,
  auth: AuthStore,
  modelIndex: number,
): ActiveConnection | null {
  if (config.models.length === 0) return null
  const entry = config.models[modelIndex]
  if (!entry) return null

  const providerDef = PROVIDERS[entry.provider]
  const keyless = providerDef?.keyless ?? false
  const creds = auth.providers[entry.provider]
  if (!keyless && !creds?.api_key) return null

  const base_url = creds?.base_url ?? providerDef?.base_url ?? ""
  if (!base_url) return null

  return {
    providerName: entry.provider,
    base_url,
    api_key: creds?.api_key ?? "",
    model: entry.model,
    contextLengthOverride: entry.context_length,
  }
}
