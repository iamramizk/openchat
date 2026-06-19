import { homedir } from "os"
import { join } from "path"
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs"
import { BUNDLED_CONFIG, BUNDLED_PROMPTS, BUNDLED_WORKER_JS } from "./bundled-assets.ts"

// ---------------------------------------------------------------------------
// XDG-aware base dirs
// Falls back to ~/.config and ~/.local/share when XDG vars are absent.
// ---------------------------------------------------------------------------

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(base, "openchat")
}

export function dataDir(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(base, "openchat")
}

// ---------------------------------------------------------------------------
// Derived path helpers
// ---------------------------------------------------------------------------

export function configFile(): string {
  return join(configDir(), "config.yaml")
}

export function promptsDir(): string {
  return join(configDir(), "prompts")
}

export function authFile(): string {
  return join(dataDir(), "auth.json")
}

// ---------------------------------------------------------------------------
// Bootstrap: ensure dirs exist; copy bundled prompts on first run;
// write a seed config.yaml if none exists.
//
// Seeding uses BUNDLED_CONFIG / BUNDLED_PROMPTS (statically embedded text)
// rather than import.meta.url filesystem paths — the latter do not resolve
// correctly inside a compiled `bun build --compile` binary.
// ---------------------------------------------------------------------------

export function ensureDirectories(): void {
  mkdirSync(configDir(), { recursive: true })
  mkdirSync(dataDir(), { recursive: true })

  // Seed config.yaml from the bundled config.example.yaml content
  if (!existsSync(configFile())) {
    writeFileSync(configFile(), BUNDLED_CONFIG, "utf-8")
  }

  // Copy bundled prompts into user config dir on first run
  const dest = promptsDir()
  if (!existsSync(dest) || readdirSync(dest).length === 0) {
    mkdirSync(dest, { recursive: true })
    for (const [filename, content] of Object.entries(BUNDLED_PROMPTS)) {
      writeFileSync(join(dest, filename), content, "utf-8")
    }
  }
}

// ---------------------------------------------------------------------------
// Tree-sitter worker: write the pre-built worker bundle to the data dir so
// Bun can spawn it as a Worker from a real filesystem path (not a bunfs path,
// which is not supported as a Worker entrypoint in compiled binaries).
//
// wasmSourcePath: the path to tree-sitter.wasm — either a real filesystem path
// (bun run) or a bunfs path (compiled binary). Both are readable with readFileSync.
//
// Returns the absolute path to the on-disk ts-worker.js that opentui should use.
// ---------------------------------------------------------------------------

/** Write `content` to `path` only if missing or its size differs from `content`'s. */
function writeIfStale(path: string, content: string | Buffer): void {
  const size = Buffer.byteLength(content)
  if (existsSync(path) && statSync(path).size === size) return
  writeFileSync(path, content)
}

export function ensureWorker(wasmSourcePath: string): string {
  const workerDir = join(dataDir(), "worker")
  mkdirSync(workerDir, { recursive: true })

  const workerJsPath = join(workerDir, "ts-worker.js")
  const workerWasmPath = join(workerDir, "tree-sitter.wasm")

  // Skip the write when the on-disk file already matches — keeps the worker in
  // sync with the running binary without paying redundant disk I/O on warm starts.
  writeIfStale(workerJsPath, BUNDLED_WORKER_JS)
  writeIfStale(workerWasmPath, readFileSync(wasmSourcePath))

  return workerJsPath
}
