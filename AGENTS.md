# openchat

A simplified, non-agentic Terminal User Interface (TUI) for chatting with any OpenAI-compatible LLM provider, leveraging the `opentui` skill.

## Project Goal

To create a lightweight, streamlined terminal interface that facilitates fast, direct communication with LLM providers (OpenRouter, Groq, OpenAI, or any OpenAI-compatible endpoint) without agentic workflows. The interface mimics the visual aesthetic of `opencode` but in a vastly simplified manner, focusing strictly on clear chat presentation and real-time session statistics.

## Tech Stack & Dependencies

- **UI/Layout Skill:** `anomalyco/opentui` (installed locally at `.agents/skills/opentui/`)
- **Runtime:** **Bun** (opentui's renderer requires native FFI; Bun provides this out of the box)
- **UI Framework:** `@opentui/react` (React 19 + JSX bindings for opentui)
- **API Providers:** OpenRouter, Groq, OpenAI (all OpenAI-compatible)
- **Language:** TypeScript
- **Key Packages:** `yaml` (config parsing), native `fetch` (streaming SSE requests)

## Running

```bash
bun run start
```

On first run, the app seeds `~/.config/openchat/config.yaml` by **cloning the bundled
`config.example.yaml`** and copies the bundled `prompts/` directory to
`~/.config/openchat/prompts/`. Edit those files to customise the app. Use `/connect` in
the TUI to add API credentials for the providers referenced in the config.

Press `Ctrl+C` to exit.

## Building a Standalone Binary

Requires **Bun ≥ 1.2** (native FFI packaging in the bundler was fixed in 1.2; 1.1.x generates invalid output for the opentui dylib wrapper).

```bash
bun run build:mac          # dist/openchat-darwin-arm64  (macOS Apple Silicon)
bun run build:linux-x64    # dist/openchat-linux-x64     (Linux x64)
bun run build:linux-arm64  # dist/openchat-linux-arm64   (Linux ARM)
```

The binary is fully self-contained: no Bun installation required on the target machine.
`dist/` is in `.gitignore`.

**First-run behaviour is identical to `bun run start`:** on the first launch,
`~/.config/openchat/config.yaml` and all persona prompts are seeded from assets
embedded in the binary. Subsequent launches read the user's copies only.

**Linux cross-compilation from macOS is not supported** — opentui's native FFI bindings
must be compiled on the target OS. The CI release workflow (`.github/workflows/release.yml`)
handles this automatically using native runners for each platform (macos-14,
ubuntu-22.04, ubuntu-24.04-arm). macOS x64 (Intel, macos-13) is not supported —
queue times for that runner are prohibitively slow; Apple Silicon covers all
current Mac hardware. To cut a release, push a `v*.*.*` tag.

### Releasing

```bash
git tag v0.1.0 && git push --tags   # triggers .github/workflows/release.yml
```

This publishes a GitHub Release with 4 native binaries and a `checksums.txt` file.
The version tag must match `package.json` `version` (without the leading `v`).

## Config & Secrets Locations

| Path                                | Purpose                                                             |
| ----------------------------------- | ------------------------------------------------------------------- |
| `~/.config/openchat/config.yaml`    | App preferences: models list, colours, default persona, prompt char |
| `~/.config/openchat/prompts/`       | Persona prompt files (copied from repo `prompts/` on first run)     |
| `~/.local/share/openchat/auth.json` | API credentials per provider (`0600` permissions)                   |

Both dirs respect `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` overrides.

**The repo `prompts/` directory is the bundled seed** — it is copied once to the user
config dir on first run. Editing it in the repo has no effect on an existing install.

### config.yaml shape

```yaml
default_model: deepseek # name of an entry in models[]; falls back to first
models:
  - name: deepseek # display name used in /models and status bar
    provider: openrouter # must match a provider key in auth.json
    model: "deepseek/deepseek-v4-flash:nitro"
  - name: gpt-oss
    provider: groq
    model: "openai/gpt-oss-20b"
    context_length: 131072 # optional override when provider /models lacks it
default_persona: default
colors:
  model: "#58A6FF" # default blue palette
  persona: "#79C0FF"
  cost: "#A5D6FF"
  popup: "#161B22" # background colour for /models, /connect, and slash-suggestion popup
prompt_char: ">"
prompt_color: "#58A6FF"
```

New installs are seeded from `config.example.yaml`, which ships a set of example models with no
saved API keys. Run `/connect` to add credentials for each provider, then use `/models` to switch
between them. You can add, delete, or change the default model entirely from within the TUI (`a` /
`d` / `f`), or edit `config.yaml` directly.

**Note:** When models are added or deleted via the in-TUI `/models` commands (`a`/`d`), `config.yaml` is
rewritten by `saveConfig()`. Comments in the file are stripped on first rewrite — this is expected.

### auth.json shape (managed by /connect — do not edit manually)

```json
{
  "providers": {
    "openrouter": {
      "api_key": "sk-or-...",
      "base_url": "https://openrouter.ai/api/v1"
    },
    "groq": {
      "api_key": "gsk_...",
      "base_url": "https://api.groq.com/openai/v1"
    }
  }
}
```

## Interface Design (The Layout)

Three-region vertical layout:

```
┌──────────────────────────────────┐
│                                  │
│   Chat Pane  (flexGrow: 1)       │  <scrollbox stickyScroll bottom>
│   <markdown> streaming renders   │
│                                  │
├──────────────────────────────────┤
│   Input Bar  (height: 3)         │  <textarea> — Enter to send
├──────────────────────────────────┤
│  model │ persona │ ctx: 12% │ …  │  Status Bar (height: 1)
└──────────────────────────────────┘
```

- **Chat Pane:** `<scrollbox>` with sticky-bottom scroll. Assistant messages render via `<markdown streaming>` for token-by-token output with full syntax highlighting. The vertical scrollbar is fully hidden from layout (no column gutter reserved) via a mount-time `verticalScrollBar.visible = false`; wheel and keyboard scrolling remain functional.
- **Input Bar:** Multi-line `<textarea>` — Enter sends, Shift+Enter inserts newline, input clears automatically. Disabled while streaming or a modal is open. Typing `/` shows a floating autosuggestion popup listing available commands above the input bar.
- **Status Bar:** 1-row footer showing: active model name · active persona · streaming/ready indicator · context window % (with token count when > 0, e.g. `ctx: 10% 13k`) · cumulative session cost · keybinding hints (`shift+tab persona · ctrl+c exit`).
  - When no model is configured: shows `no model configured` in blue + `/connect`/`/models` guidance.

## Core Functional Requirements

- **Streaming Responses:** Token-by-token output via OpenAI-compatible SSE (`stream: true`, `stream_options: { include_usage: true }`). The `stream_options` field is the OpenAI-standard way to request streaming usage; the former `usage: { include: true }` was OpenRouter-proprietary and rejected by Groq/OpenAI.
- **Slash Commands:** `/models` and `/connect` open modal overlays. Any other `/x` input shows an error toast. Plain text is sent to the model.
- **State Management:** Full conversation history maintained in React state for ongoing context.
- **Context Tracking:** Accumulated from `usage.total_tokens` returned per completed turn; denominator from the provider's `/models` endpoint. Accepts both `context_length` (OpenRouter) and `context_window` (Groq); optional per-entry override in config.yaml.
- **Cost Tracking:** Accumulated from `usage.cost` in the final SSE chunk (OpenRouter only). Shows `—`/`$0` for providers that don't report cost.
- **Persona Cycling:** **Shift+Tab** cycles through personas at runtime. Conversation history is preserved; only the system prompt changes on the next turn. The active persona is shown in the status bar.
- **Auto-copy:** Mouse-drag selection automatically copies the selected text to the system clipboard (OSC 52 primary; `pbcopy` / `wl-copy` / `xclip` fallback per platform). A transient `✓ copied to clipboard` toast confirms each copy.

## In-TUI Commands

| Command    | Action                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/connect` | Opens a two-step modal: (1) pick a provider from the registry, (2) enter your API key. Saves to `auth.json` immediately. Already-saved keys are shown with a `✓` indicator. Footer shows the `auth.json` path.          |
| `/models`  | Opens a modal listing all entries from `models[]` in `config.yaml`. Keys: **enter** — switch active model; **a** — add a new model (provider → model-id → display name, writes to `config.yaml`); **d** — delete highlighted model (confirm with `d`/`y`); **f** — set highlighted model as the boot default (★); **r** — rename the highlighted model's display name. Entries missing a key are marked `(no key — run /connect)`. Footer shows the `config.yaml` path. |

Typing `/` or a partial command (e.g. `/m`, `/co`) in the input bar shows a floating autosuggestion list above the input. Partial prefix submission works: `/mod`+Enter opens `/models`, `/con`+Enter opens `/connect`.

## Source Layout

```
src/
  index.tsx             # entry: bootstrap, load config + auth + personas, init tree-sitter, createRoot + <App>
  config.ts             # loadConfig() (XDG path), saveConfig() (writes config.yaml), resolveConnection()
  auth.ts               # loadAuth(), saveAuth(), setProviderKey()
  paths.ts              # XDG path helpers: configDir/dataDir/configFile/authFile/promptsDir + ensureDirectories() + ensureWorker() (uses BUNDLED_* constants)
  bundled-assets.ts     # seed content + pre-built worker JS embedded via `with { type: "text" }` — safe in compiled binary (see LEARNINGS.md)
  assets.d.ts           # `declare module "*.md"` so TypeScript accepts the text-import attributes
  providers.ts          # PROVIDERS registry: openrouter | groq | openai + PROVIDER_LIST
  personas.ts           # loadPersonas() + composeSystemPrompt()
  openrouter.ts         # fetchModelInfo(conn) + streamCompletion(conn, …) — takes ActiveConnection
  types.ts              # ModelEntry, Config, ActiveConnection, Persona, ChatMessage, ModelInfo, SessionStats, StreamChunk
  theme.ts              # color palette + SyntaxStyle for <markdown>
  parsers.ts            # EXTRA_PARSERS: FiletypeParserOptions[] for addDefaultParsers()
  bun-worker-shim.ts    # Bun worker compat shim — polyfills globalThis.close then imports @opentui/core/parser.worker
  worker/               # pre-built worker sidecar (committed; regenerate with `bun run build:worker`)
    bun-worker-shim.js  # standalone worker bundle (~198KB) generated by build:worker; embedded as text in bundled-assets.ts
    tree-sitter.wasm    # web-tree-sitter runtime (~201KB); embedded via `with { type: "file" }` in index.tsx
  App.tsx               # root component: state, command dispatch, modal state, connection resolution
  components/
    ChatPane.tsx        # <scrollbox> + message list
    Message.tsx         # single turn (user text or assistant <markdown streaming treeSitterClient>)
    InputBar.tsx        # <textarea> with submit + clear; disabled while modal open
    StatusBar.tsx           # model · persona · status · ctx% · cost; no-model state (blue accent)
    Toast.tsx               # transient "✓ copied to clipboard" floating overlay
    CommandPalette.tsx      # /models (ModelsModal) + /connect (ConnectModal) — borderless overlays, colors.popup background
    CommandSuggestions.tsx  # floating slash-command autosuggestion popup above input bar — borderless, colors.popup background
prompts/                # bundled seed — copied to ~/.config/openchat/prompts/ on first run
  _global.md            # base preamble prepended to every persona (not cycled)
  0-default.md          # General Assistant
  1-hacker.md           # Kali Linux & Cybersecurity Researcher
  2-developer.md        # Senior Software Engineer & Architect
  3-writer.md           # Copywriter & Editor
scripts/                # standalone shell scripts; also embedded in the binary via bundled-assets.ts
  install.sh            # curl-bootstrap installer: detects OS/arch, downloads binary, verifies SHA256, installs to ~/.local/bin
  update.sh             # checks GitHub releases API, downloads newer binary if available, atomically replaces existing
  uninstall.sh          # lists all created paths (warns about auth.json API keys), prompts [y/N], removes
config.example.yaml     # canonical example config (no secrets); also cloned verbatim as the first-run seed
.github/
  workflows/
    release.yml         # tag-triggered CI: builds all 4 native binaries + checksums.txt, publishes GitHub Release
  assets/               # logo (dark + light) and screenshots for README
```

## Knowledge Handoff & Memory

Significant findings, architectural shifts, and non-obvious fixes must be documented in `LEARNINGS.md` to ensure continuity across development sessions.

### Rules for Updating `LEARNINGS.md`

- **Threshold for Entry:** Only log major architectural changes, structural shifts, or non-obvious technical discoveries (e.g., handling specific streaming quirks with OpenRouter, or undocumented `opentui` layout behaviours). Do not log trivial bug fixes or routine code updates.
- **Format:** Append entries to the bottom of the file using a clean list format with the current date, a concise headline, the context of the problem, and the concrete takeaway or solution.
- **Timing:** Update `LEARNINGS.md` immediately after completing a significant implementation phase or resolving a complex issue before concluding the session.
