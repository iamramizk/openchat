# openchat - Project Learnings

This file tracks critical architectural decisions, non-obvious technical discoveries, and breaking changes. Entries should remain concise, dense, and high-impact.

---

### [YYYY-MM-DD] Example Entry Title

- **Context:** Brief description of what was being built or investigated.
- **Discovery/Solution:** The non-obvious insight, technical resolution, or constraint that was uncovered.

---

### [2026-06-10] Bun + React 19 required by @opentui/react 0.4.0

- **Context:** Initial project scaffold — choosing runtime and React version.
- **Discovery/Solution:** `@opentui/react@0.4.0` peer-depends on `react >= 19.2.0`. Using React 18 causes silent peer-dep warnings and likely runtime breakage. Always install `react@^19` + `@types/react@^19`. Bun is required over Node because `createCliRenderer()` uses native Zig FFI; Node only supports this at v26.3+ with `--experimental-ffi`, while Bun handles it out of the box. Using `moduleResolution: "bundler"` in tsconfig requires `allowImportingTsExtensions: true` when extensions (`.ts`, `.tsx`) are present in import paths.

### [2026-06-10] opentui StyleDefinitionInput does not support `strikethrough`

- **Context:** Building the SyntaxStyle for the `<markdown>` component.
- **Discovery/Solution:** `SyntaxStyle.fromStyles()` accepts `StyleDefinitionInput` objects with `fg`, `bg`, `bold`, `italic`, `underline` — but NOT `strikethrough`. Passing `strikethrough` causes a TypeScript compile error. Use a colour change (e.g. muted fg) to visually represent strikethrough text instead.

---

### [2026-06-10] Bun worker compat shim required for opentui tree-sitter

- **Context:** Wiring up `treeSitterClient` to enable code-block syntax highlighting. `treeSitterClient.initialize()` always timed out after 10 s.
- **Discovery/Solution:** opentui's `parser.worker.js` detects its own worker context via `isGlobalWorkerRuntime()`, which checks `typeof globalThis.close === "function"`. Bun workers do not expose `close` on `globalThis` (confirmed empirically). This makes `isWorkerRuntime = false`, so the worker's `onmessage` handler is never registered and the INIT handshake never completes. Fix: `src/bun-worker-shim.ts` uses a static import of `node:worker_threads` (available in Bun workers) to confirm we're on a worker thread, defines `globalThis.close = () => process.exit(0)`, then **dynamically** imports `@opentui/core/parser.worker` so that the real worker's top-level detection code runs after the polyfill is in place. Set `process.env.OTUI_TREE_SITTER_WORKER_PATH` to the shim's absolute path **before** calling `getTreeSitterClient()` (which triggers `new TreeSitterClient()` → `startWorker()` → reads the env var).

---

### [2026-06-10] Tree-sitter client boot order and `<markdown>` wiring

- **Context:** Enabling syntax highlighting for fenced code blocks inside assistant messages.
- **Discovery/Solution:** `MarkdownRenderable` accepts an optional `treeSitterClient` prop; without it code fences render as plain text. The client is a global singleton (`getTreeSitterClient()`). Boot order matters: `addDefaultParsers(EXTRA_PARSERS)` must run **before** `initialize()` so extra language definitions are registered before the bundled parsers load. The client must then be threaded as a prop all the way down: `index.tsx → App → ChatPane → Message → <markdown treeSitterClient={…}>`. Extra language WASM + highlight queries are downloaded lazily on first use and cached under `getDataPaths().globalDataPath` (set via `dataPaths.appName = "openchat"`); bundled languages (js/ts/jsx/tsx/markdown/zig) highlight instantly with no network.

---

### [2026-06-11] OpenRouter model variant suffixes (`:nitro`, `:free`) are absent from `/models`

- **Context:** Status bar `ctx:` always showed `—`; `fetchModelInfo` was returning `null` despite a valid model being used.
- **Discovery/Solution:** OpenRouter's `/models` listing only contains base model ids (e.g. `openai/gpt-oss-20b`). Variant/routing suffixes like `:nitro`, `:free`, `:floor` are accepted by the chat completions endpoint but are **not** present in the models list. An exact `m.id === config.model` match always fails for suffixed ids. Fix in `openrouter.ts`: try exact match first (future-proofs if they're ever added), then fall back to `config.model.split(":")[0]` for the base id lookup.

---

### [2026-06-11] opentui auto-copy: useSelectionHandler, OSC 52, backgroundColor prop

- **Context:** Implementing mouse-drag auto-copy to clipboard with a toast confirmation.
- **Discovery/Solution:** Three non-obvious details: (1) The React hook is **`useSelectionHandler`** (not `useSelection`) — exported from `@opentui/react`; call `selection.getSelectedText()` inside it. Mouse capture is on by default (`useMouse: true`), so no extra renderer config needed. (2) The renderer exposes **`copyToClipboardOSC52(text)`** and **`isOsc52Supported()`** as built-in clipboard helpers — prefer these over spawning `pbcopy`; they work over SSH. (3) Background colour on `<box>` is the prop **`backgroundColor`** (not `bg` and not a style property) — both `bg` as a direct prop and `bg` inside `style` fail TypeScript. Use `<box backgroundColor={hex}>`.

---

### [2026-06-11] Layered, runtime-swappable persona system replaced static `config.system_prompt`

- **Context:** Adding Shift+Tab persona cycling with a shared global preamble across all roles.
- **Discovery/Solution:** The system prompt is reconstructed on every `streamCompletion` call, so swapping persona mid-session is free — history is preserved and only the next request gets the new system message. The architecture uses two layers: `prompts/_global.md` (always-prepended base) + the active numbered persona file (`0-default.md`, `1-hacker.md`, etc.). Files prefixed `_` are excluded from the cycle by convention. The `<textarea>` in InputBar does not capture Tab (no `traits`/`capture` set), so Shift+Tab falls through to the global `useKeyboard` handler in App.tsx — no extra wiring needed. `config.system_prompt` was removed entirely; `default_persona` (string, matched against filename stem) replaced it. Persona index is mirrored in a `useRef` so the async `sendMessage` closure always captures the value at call time.

---

### [2026-06-13] XDG config/secrets split, multi-provider support, /connect + /models

- **Context:** The original single `config.yaml` in the project root mixed secrets (API keys) with preferences, was single-provider, and hard-crashed on a missing key. Replaced with a proper per-user XDG layout supporting multiple providers and models.
- **Architecture:**
  - **Secrets** → `~/.local/share/openchat/auth.json` (`0600`). Written only by the `/connect` command; never by the config loader. Using JSON (not YAML) so the app can rewrite it without losing formatting.
  - **Preferences** → `~/.config/openchat/config.yaml`. The app never rewrites this file — the `yaml` library drops comments, and `config.yaml` is user-maintained. Both paths honor `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME`.
  - **A "model" is a (provider + model-id) pair.** `config.yaml` holds a `models[]` list; each entry names a `provider` (matched against `auth.json`). `resolveConnection(config, auth, index)` combines them at runtime into an `ActiveConnection { base_url, api_key, model }`. This is what `openrouter.ts` now receives instead of the old flat `Config`.
  - **Prompts seed:** Repo `prompts/` is the bundled template; on first run `ensureDirectories()` copies it to `~/.config/openchat/prompts/`. The runtime reads only from the user path. Editing repo `prompts/` does not affect existing installs.
  - **Boot never crashes on missing credentials.** `loadAuth()` returns `{ providers: {} }` if `auth.json` is absent. The app renders in a "no model" state with status bar hint `no model — type /connect`; sending a message shows a toast instead of crashing.
- **Provider differences — ctx% and cost:**
  - OpenRouter: `/models` returns `context_length` + `pricing`; SSE streams `usage.cost`.
  - Groq: `/models` returns `context_window` (different key!); no `usage.cost` in SSE. `fetchModelInfo` reads both keys; per-entry `context_length` override in config.yaml handles gaps.
  - OpenAI: `/models` returns neither context nor pricing; ditto for cost. Cost display shows `—`/`$0`.
- **`<select>` in opentui JSX:** `onSelect` fires ITEM_SELECTED (Enter key); `onChange` fires SELECTION_CHANGED (highlight moves). The `<select>` JSX element is confirmed in `@opentui/react` (mapped from `SelectRenderable`). Modal overlay is a full-screen `<box position="absolute">` with `justifyContent: "center"` + `alignItems: "center"`, not `transform: translate` (unsupported in opentui layout).
- **`useTerminalDimensions()`** is exported from `@opentui/react` and returns `{ width, height }` that tracks terminal resize events. Used to cap modal width to terminal width.
- **`<select>` height with descriptions:** Each option renders its `name` + `description` on two rows. Setting `height` to the raw item count shows only one item. Use `itemCount * 2` (capped) to make the full list visible. `showScrollIndicator` handles overflow when the list is longer than the cap.
- **`<select>` focused-background quirk:** When a `<select>` is `focused`, `SelectRenderable` fills the **entire list background** with `focusedBackgroundColor` (confirmed at `node_modules/@opentui/core/index.js:10764`) — `backgroundColor` only applies while the component is *unfocused*. The default `focusedBackgroundColor` is `#1a1a1a`, so passing a custom `backgroundColor` alone has no visible effect on a focused select. To make a focused list flush with a custom popup background, set **`focusedBackgroundColor`** (and `selectedBackgroundColor`) to the desired colour. Setting `backgroundColor` to the same value is harmless but effectively a no-op while focused.
- **`SelectOption.value` is typed as `optional any`** — the `onSelect` callback receives `SelectOption | null`. Always null-check the option and cast `.value` when using it as a specific type.

---

### [2026-06-13] Groq/OpenAI streaming 400 — `usage` vs `stream_options`

- **Context:** Groq models rejected every request with `400: property 'usage' is unsupported`. The request body contained `usage: { include: true }`.
- **Discovery/Solution:** `usage: { include: true }` is an **OpenRouter-proprietary** field. Groq and OpenAI follow the strict OpenAI schema and reject unknown top-level body properties before streaming begins — so the error fires regardless of key tier (free or paid). The OpenAI-standard way to request streaming usage is `stream_options: { include_usage: true }`, which Groq and OpenAI both accept. Per current OpenRouter docs, both `usage: { include: true }` and `stream_options: { include_usage: true }` are now deprecated on OpenRouter (usage is always returned automatically), but the field is silently ignored rather than rejected. Fix in `src/openrouter.ts`: replace `usage: { include: true }` with `stream_options: { include_usage: true }` — works for all three providers with no branching. Existing SSE chunk parser was already correct: it tolerates an empty `choices` array (Groq's final usage chunk) and reads `usage.cost ?? 0` (OpenRouter only; others emit no cost).

---

### [2026-06-14] Runtime now writes config.yaml via saveConfig(); comments stripped on rewrite

- **Context:** In-TUI model management (add/delete/set-default via `/models`) required the runtime to persist changes to `config.yaml`. Previously the file was read-only from the app's perspective — only the user edited it.
- **Discovery/Solution:** Added `saveConfig(config: Config): void` in `src/config.ts` that builds a plain object from the `Config` struct and serialises it with `yaml.stringify`. **Comments in the user's `config.yaml` are irrecoverably stripped on the first in-app model mutation** — the `yaml` library's round-trip does not preserve them. This is acceptable (user-confirmed), but future sessions should not assume the file retains its original comments.
- **Takeaway:** Any code path that calls `saveConfig` will silently drop YAML comments. If preserving human-written comments ever becomes a requirement, switch to a line-patching strategy (read raw text, apply targeted regex substitution) rather than parse-and-reserialise.
- **Related:** First-run config seed changed from a hardcoded string (`DEFAULT_CONFIG` constant) to cloning `config.example.yaml` via the bundled-assets module — the example file is now the canonical source of truth for the seed content.

---

### [2026-06-14] Standalone binary via `bun build --compile` — asset embedding and native FFI

- **Context:** Packaging openchat as a self-contained binary (`dist/openchat`) that works identically to `bun run start`.
- **Asset embedding — `import.meta.url` paths do NOT work in compiled binaries.** `ensureDirectories()` originally seeded `config.yaml` and `prompts/` by `readFileSync`-ing paths built with `new URL("../…", import.meta.url).pathname`. Inside a compiled binary, `import.meta.url` points into the virtual `/$bunfs/` filesystem; the source-tree files are not auto-embedded, so the reads silently fail and first-run seeding breaks. **Fix:** Created `src/bundled-assets.ts` which imports all seed content with `with { type: "text" }` import attributes — Bun's bundler inlines these strings into the bundle at compile time, making them available in both `bun run` and the compiled binary. `src/paths.ts` was refactored to use these constants instead of `readFileSync`. TypeScript requires a `declare module "*.md"` declaration (`src/assets.d.ts`) because `bun-types` doesn't cover `.md` files.
- **Native FFI and Bun 1.1.10:** `@opentui/core-darwin-arm64/index.bun.js` uses `await import("./libopentui.dylib", { with: { type: "file" } })`. Bun 1.1.10's bundler mis-generates this: the `await` lands inside a non-async `__esm()` wrapper, causing `SyntaxError: Unexpected identifier 'Promise'` at binary runtime. **Fixed by upgrading to Bun 1.3.14**, which handles top-level await in native FFI packages correctly. Bun ≥ 1.2 is required to compile this project.
- **Worker path for compiled binaries — Workers cannot be spawned from bunfs paths (Bun 1.3.x).** `bun build --compile` does NOT embed files referenced only via `new URL("./x", import.meta.url)` string operations into the bunfs as spawnable Worker entrypoints — the source is kept as-is in the bundle, and `new Worker("/$bunfs/root/x")` fails at runtime with `ModuleNotFound`. The `new Worker(new URL(...))` pattern suggestion from Bun docs also does NOT trigger embedding when the URL is used indirectly (e.g. stored in a variable, then set as an env var consumed by a different module). **Verified**: even `const _w = new Worker(new URL("./shim.ts", import.meta.url)); _w.terminate()` as an explicit trigger did not cause the shim to appear in the bunfs. **Fix:** pre-bundle the worker shim (`bun run build:worker`) into `src/worker/bun-worker-shim.js` + `src/worker/tree-sitter.wasm`. Embed the JS as `with { type: "text" }` in `bundled-assets.ts` and the wasm as `with { type: "file" }` in `index.tsx` (so its bunfs path is available at runtime). `ensureWorker(wasmSourcePath)` (`src/paths.ts`) writes both files to `~/.local/share/openchat/worker/` on every startup; `OTUI_TREE_SITTER_WORKER_PATH` points to the on-disk JS. Workers spawned from real filesystem paths work correctly from compiled binaries, and the bunfs is accessible from any thread so grammar WASM paths (computed by the main thread and passed to the worker) resolve correctly.
- **build:worker must be re-run when @opentui/core updates** to keep the embedded worker in sync with the runtime's parser.worker. The `build:worker` script: `bun build src/bun-worker-shim.ts --target=bun --outdir src/worker --asset-naming=[name].[ext]`. These pre-built files are committed to the repo.
- **Tree-sitter boot guard:** Wrapped `await treeSitterClient.initialize()` in try/catch. On failure the TUI still boots normally; only syntax highlighting in code blocks is lost.
- **Build command:** `bun build src/index.tsx --compile --outfile dist/openchat` (single entrypoint, native platform, ~70MB arm64 binary including embedded worker assets). `dist/` is gitignored.

---

### [2026-06-14] Argv dispatch + embedded shell scripts for `openchat update` / `openchat uninstall`

- **Context:** Adding `openchat update` and `openchat uninstall` subcommands to the compiled binary. The binary had no argv handling at all — `index.tsx` booted the TUI immediately on import.
- **Discovery/Solution:** Added a synchronous dispatcher block at the top of `index.tsx` (after static imports, before `createCliRenderer`) that inspects `process.argv[2]`. Handlers for `--version`, `--help`, `update`, and `uninstall` exit before any TUI initialisation; unknown args fall through to the normal boot path. `update` and `uninstall` write their respective shell scripts to a temp file and exec via `Bun.spawnSync(["bash", tmp], { stdin/stdout/stderr: "inherit", env: { OPENCHAT_BIN, OPENCHAT_VERSION } })`. The scripts live in `scripts/` as canonical source and are embedded in the binary via `with { type: "text" }` imports in `bundled-assets.ts` — single source of truth, no logic duplication. In `bun run` mode `process.execPath` points to Bun (not the app binary), so the scripts fall back to `command -v openchat` for the binary path — fine since update/uninstall are binary-only operations. `resolveJsonModule: true` was added to `tsconfig.json` to allow `import pkg from "../package.json"` for the version string.
- **CI release:** `.github/workflows/release.yml` uses 4 native runners (macos-14 arm64, macos-13 x64, ubuntu-22.04 x64, ubuntu-24.04-arm arm64) to build platform binaries. Cross-compilation is explicitly not used — opentui FFI bindings are platform-native. The build matrix uploads per-binary artifacts; the release job merges checksums and publishes via `softprops/action-gh-release@v2`. Trigger: `git tag vX.Y.Z && git push --tags`. Tag must match `package.json version` (without the leading `v`).
