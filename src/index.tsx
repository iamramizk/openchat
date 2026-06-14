import { createCliRenderer, getTreeSitterClient, addDefaultParsers, getDataPaths } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { loadConfig } from "./config.ts"
import { loadAuth } from "./auth.ts"
import { loadPersonas } from "./personas.ts"
import { EXTRA_PARSERS } from "./parsers.ts"
import { ensureWorker } from "./paths.ts"
import { UPDATE_SH, UNINSTALL_SH } from "./bundled-assets.ts"
import { App } from "./App.tsx"
import { writeFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import pkg from "../package.json"

// The wasm file embedded alongside the pre-built worker bundle.
// `{ type: "file" }` embeds this asset in the binary's bunfs and returns its
// bunfs path at runtime — or the real filesystem path in `bun run` mode.
import wasmSourcePath from "./worker/tree-sitter.wasm" with { type: "file" }

// ---------------------------------------------------------------------------
// Argv dispatcher — handle subcommands before the TUI boots so the renderer
// is never initialised for these lightweight commands.
//
// In a compiled binary, process.execPath is the binary itself.
// In `bun run src/index.tsx`, process.execPath is Bun — update/uninstall are
// binary-only operations and will fall back to `command -v openchat` in that case.
// ---------------------------------------------------------------------------

const _cmd = process.argv[2]

if (_cmd === "--version" || _cmd === "-v") {
  console.log(pkg.version)
  process.exit(0)
}

if (_cmd === "--help" || _cmd === "-h") {
  console.log(
    `openchat v${pkg.version}\n` +
    `\nUsage: openchat [command]\n` +
    `\nCommands:\n` +
    `  (none)       Launch the chat TUI\n` +
    `  update       Update openchat to the latest release\n` +
    `  uninstall    Remove openchat and all its config/data\n` +
    `  --version    Print version and exit\n` +
    `  --help       Show this help\n`
  )
  process.exit(0)
}

if (_cmd === "update" || _cmd === "uninstall") {
  const script = _cmd === "update" ? UPDATE_SH : UNINSTALL_SH
  const tmp = `${tmpdir()}/openchat-${_cmd}-${Date.now()}.sh`
  writeFileSync(tmp, script, { mode: 0o700 })
  const result = Bun.spawnSync(["bash", tmp], {
    env: {
      ...process.env,
      OPENCHAT_BIN: process.execPath,
      OPENCHAT_VERSION: pkg.version,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  try { unlinkSync(tmp) } catch { /* ignore */ }
  process.exit(result.exitCode ?? 0)
}

// ---------------------------------------------------------------------------
// Boot — config and personas are loaded from user config dir.
// Missing credentials are handled in-TUI via /connect, not by crashing.
// ---------------------------------------------------------------------------

function loadConfigOrExit() {
  try {
    return loadConfig()
  } catch (err) {
    console.error(`openchat: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

function loadPersonasOrExit() {
  try {
    return loadPersonas()
  } catch (err) {
    console.error(`openchat: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

const config = loadConfigOrExit()
const initialAuth = loadAuth() // never throws — returns empty store if file missing
const { global: globalPrompt, personas } = loadPersonasOrExit()

// Resolve boot persona — fall back to index 0 with a warning if name not found
let initialPersonaIndex = personas.findIndex((p) => p.name === config.default_persona)
if (initialPersonaIndex < 0) {
  if (config.default_persona) {
    console.warn(
      `openchat: default_persona "${config.default_persona}" not found, defaulting to "${personas[0].name}"`,
    )
  }
  initialPersonaIndex = 0
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 30,
  maxFps: 60,
})

renderer.setTerminalTitle("openchat")

// ---------------------------------------------------------------------------
// Tree-sitter: register extra languages and initialize the global client.
// addDefaultParsers must run before initialize() so definitions are available.
// Individual WASM files are fetched lazily on first use, then cached.
//
// Bun workers don't expose globalThis.close, which opentui uses to detect the
// worker context — so `bun-worker-shim.ts` polyfills it before importing the
// real parser worker.
//
// In a compiled binary, workers cannot be spawned from bunfs paths (Bun 1.3.x).
// The workaround: ensureWorker() writes a pre-built worker bundle + its wasm
// dependency to the data dir on every startup, then we point opentui at that
// on-disk file. Both files are small (~200KB each).
// ---------------------------------------------------------------------------

const workerJsPath = ensureWorker(wasmSourcePath)
process.env.OTUI_TREE_SITTER_WORKER_PATH = workerJsPath

addDefaultParsers(EXTRA_PARSERS)

const treeSitterClient = getTreeSitterClient()
const dataPaths = getDataPaths()
dataPaths.appName = "openchat"
try {
  await treeSitterClient.initialize()
} catch (err) {
  // Non-fatal: syntax highlighting won't work but the TUI will still boot.
  console.warn(`openchat: tree-sitter unavailable (${err instanceof Error ? err.message : err}) — code highlighting disabled`)
}

// ---------------------------------------------------------------------------

createRoot(renderer).render(
  <App
    config={config}
    initialAuth={initialAuth}
    treeSitterClient={treeSitterClient}
    personas={personas}
    globalPrompt={globalPrompt}
    initialPersonaIndex={initialPersonaIndex}
  />,
)
