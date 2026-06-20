import { createCliRenderer, getTreeSitterClient, addDefaultParsers, getDataPaths } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { loadConfig } from "./config.ts"
import { loadAuth } from "./auth.ts"
import { loadPersonas } from "./personas.ts"
import { EXTRA_PARSERS } from "./parsers.ts"
import { ensureWorker } from "./paths.ts"
import { UPDATE_SH, UNINSTALL_SH } from "./bundled-assets.ts"
import { reconcilePrompts } from "./prompt-sync.ts"
import { App } from "./App.tsx"
import { writeFileSync, unlinkSync, openSync } from "fs"
import { ReadStream } from "node:tty"
import { tmpdir } from "os"
import { createInterface } from "readline/promises"
import pkg from "../package.json"

// The wasm file embedded alongside the pre-built worker bundle.
// `{ type: "file" }` embeds this asset in the binary's bunfs and returns its
// bunfs path at runtime — or the real filesystem path in `bun run` mode.
import wasmSourcePath from "./worker/tree-sitter.wasm" with { type: "file" }

// ---------------------------------------------------------------------------
// Shared y/N prompt for prompt-sync's edited-file decision — used both by the
// standalone `reconcile-prompts` subcommand and the startup reconcile below.
// ---------------------------------------------------------------------------

async function confirmPersonaReplace(editedFiles: string[]): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(
      `Back up your edited persona${editedFiles.length > 1 ? "s" : ""} and install the new defaults? [y/N] `,
    )
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

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
    `  reconcile-prompts  Sync bundled persona prompts onto your config (also runs automatically on launch)\n` +
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
// reconcile-prompts — run interactively in the plain terminal (no TUI) right
// after `update.sh` swaps in a new binary, so newly-bundled persona defaults
// reach existing installs. Unedited files are updated silently; edited files
// trigger a single combined y/N prompt (see src/prompt-sync.ts for the
// classification logic and src/prompt-hashes.ts for the hash history).
// ---------------------------------------------------------------------------

if (_cmd === "reconcile-prompts") {
  await reconcilePrompts({ version: pkg.version, confirmReplace: confirmPersonaReplace })
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Piped stdin — read before the renderer so we capture the pipe fully before
// opentui takes ownership of the stdin stream.
//
// When the user runs `cat file.txt | openchat`, process.stdin is the pipe and
// is NOT a TTY. We drain it here, then open /dev/tty for keyboard input and
// pass it to createCliRenderer via the `stdin` override — otherwise the renderer
// would attach its key-input listener to the (now-exhausted) pipe and the
// keyboard would be dead.
// ---------------------------------------------------------------------------

let pipedInput = ""
let rendererStdin: NodeJS.ReadStream | undefined

if (!process.stdin.isTTY) {
  // Drain the pipe to EOF before the renderer starts.
  pipedInput = (await Bun.stdin.text()).trim()

  if (pipedInput) {
    // Open the controlling terminal so the renderer can still read keystrokes.
    try {
      rendererStdin = new ReadStream(openSync("/dev/tty", "r"))
      // Unref immediately: a custom ReadStream keeps the event loop alive after
      // the renderer tears down (opentui only calls .pause() on stdin, never
      // .destroy() or .unref()). Without this, Ctrl+C requires two presses.
      rendererStdin.unref()
    } catch {
      console.warn("openchat: no controlling terminal — interactive input unavailable")
    }
  }
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

// ---------------------------------------------------------------------------
// Startup prompt reconciliation — syncs ~/.config/openchat/prompts/ onto the
// bundled defaults in *this* binary. This can't be left to `openchat update`
// alone: its embedded update.sh is whatever shipped in the *previous*
// version, so an update from a binary that predates this feature never
// triggers it, and install.sh / manual-download users never run `update` at
// all. Running it here means every launch of a newer binary self-heals.
//
// Only runs when stdin is a TTY — the edited-file decision needs a live y/N
// prompt, and this happens before createCliRenderer() takes over the
// terminal (raw mode isn't engaged yet). A failure here must never block
// boot. The result is surfaced as an in-TUI toast (not console output) below
// — opentui's renderer repaints from row 1 without an alt-screen buffer, so
// anything printed here would be invisibly overwritten by the first frame.
// ---------------------------------------------------------------------------

let startupNotice: string | undefined
if (process.stdin.isTTY) {
  try {
    const result = await reconcilePrompts({ version: pkg.version, confirmReplace: confirmPersonaReplace })
    if (!result.skipped) {
      if (result.edited.length > 0) {
        startupNotice = result.backedUp
          ? "✓ Persona prompts updated — your edits were backed up to prompts/backup/"
          : "Persona updates saved to prompts/new/ — your edits were kept as-is"
      } else if (result.updated.length > 0) {
        startupNotice = "✓ Default persona prompts updated"
      }
    }
  } catch (err) {
    console.warn(`openchat: prompt sync skipped (${err instanceof Error ? err.message : err})`)
  }
}

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
  ...(rendererStdin ? { stdin: rendererStdin } : {}),
  // Belt-and-suspenders: promptly close the /dev/tty fd when the renderer
  // tears down so nothing lingers even if unref() wasn't enough.
  ...(rendererStdin ? { onDestroy: () => { try { rendererStdin!.destroy() } catch {} } } : {}),
})

renderer.setTerminalTitle("openchat")

// ---------------------------------------------------------------------------
// Tree-sitter: register extra languages and initialize the global client.
// The client reference itself is needed synchronously as an <App> prop, but
// the actual worker setup + wasm init is deferred until after the first
// render — the first frame (empty chat + status bar) needs none of it, and
// it's only exercised once the first assistant markdown message streams.
// ---------------------------------------------------------------------------

const treeSitterClient = getTreeSitterClient()
const dataPaths = getDataPaths()
dataPaths.appName = "openchat"

// ---------------------------------------------------------------------------

createRoot(renderer).render(
  <App
    config={config}
    initialAuth={initialAuth}
    treeSitterClient={treeSitterClient}
    personas={personas}
    globalPrompt={globalPrompt}
    initialPersonaIndex={initialPersonaIndex}
    initialPipedInput={pipedInput || undefined}
    startupNotice={startupNotice}
  />,
)

// ---------------------------------------------------------------------------
// Warm tree-sitter in the background — addDefaultParsers must run before
// initialize() so definitions are available.
// Individual WASM files are fetched lazily on first use, then cached.
//
// Bun workers don't expose globalThis.close, which opentui uses to detect the
// worker context — so `bun-worker-shim.ts` polyfills it before importing the
// real parser worker.
//
// In a compiled binary, workers cannot be spawned from bunfs paths (Bun 1.3.x).
// The workaround: ensureWorker() writes a pre-built worker bundle + its wasm
// dependency to the data dir (only if missing or stale), then we point opentui
// at that on-disk file. Both files are small (~200KB each).
// ---------------------------------------------------------------------------

void (async () => {
  try {
    process.env.OTUI_TREE_SITTER_WORKER_PATH = ensureWorker(wasmSourcePath)
    addDefaultParsers(EXTRA_PARSERS)
    await treeSitterClient.initialize()
  } catch (err) {
    // Non-fatal: syntax highlighting won't work but the TUI will still boot.
    console.warn(`openchat: tree-sitter unavailable (${err instanceof Error ? err.message : err}) — code highlighting disabled`)
  }
})()
