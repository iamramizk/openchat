import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import type { Persona } from "./types.ts"
import { promptsDir } from "./paths.ts"

// ---------------------------------------------------------------------------
// Persona loader
// Reads prompts/_global.md (base preamble) + numeric-prefixed *.md files.
// Files starting with _ are excluded from the cycle (reserved for _global.md).
// Cycle order is determined by the leading integer: 0-default.md < 1-hacker.md etc.
// Reads from ~/.config/openchat/prompts/ (populated from bundled prompts/ on first run).
// ---------------------------------------------------------------------------

const NUMERIC_PREFIX = /^(\d+)-(.+)\.md$/

export function loadPersonas(dir = promptsDir()): { global: string; personas: Persona[] } {
  // _global.md is mandatory — mirror loadConfig's explicit failure messages
  let global: string
  try {
    global = readFileSync(join(dir, "_global.md"), "utf-8").trim()
  } catch {
    throw new Error(`Cannot read ${dir}/_global.md. Does the prompts folder exist?`)
  }

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    throw new Error(`Cannot read prompts directory: ${dir}`)
  }

  type Ordered = Persona & { order: number }

  const personas: Persona[] = entries
    .reduce<Ordered[]>((acc, filename) => {
      if (filename.startsWith("_") || !filename.endsWith(".md")) return acc
      const match = NUMERIC_PREFIX.exec(filename)
      if (!match) return acc
      const order = parseInt(match[1], 10)
      const name = match[2] // e.g. "developer" from "2-developer.md"
      let content: string
      try {
        content = readFileSync(join(dir, filename), "utf-8").trim()
      } catch {
        throw new Error(`Cannot read persona file: ${join(dir, filename)}`)
      }
      acc.push({ name, content, order })
      return acc
    }, [])
    .sort((a, b) => a.order - b.order)
    .map(({ name, content }) => ({ name, content }))

  if (personas.length === 0) {
    throw new Error(
      `No persona files found in ${dir}/. Expected numbered files like 0-default.md.`,
    )
  }

  return { global, personas }
}

// ---------------------------------------------------------------------------
// Compose the final system prompt: global preamble + active persona role
// ---------------------------------------------------------------------------

export function composeSystemPrompt(global: string, persona: Persona): string {
  return `${global}\n\n${persona.content}`.trim()
}
