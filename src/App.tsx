import { useEffect, useRef, useState } from "react"
import { useKeyboard, useRenderer, useSelectionHandler } from "@opentui/react"
import type { TreeSitterClient } from "@opentui/core"
import { streamCompletion, fetchModelInfo } from "./openrouter.ts"
import { composeSystemPrompt } from "./personas.ts"
import { syntaxStyle, colors } from "./theme.ts"
import { resolveConnection, saveConfig } from "./config.ts"
import { setProviderKey, setProviderBaseUrl, setCustomProvider, removeProvider } from "./auth.ts"
import type { Config, ChatMessage, ModelEntry, ModelInfo, Persona, SessionStats, ActiveConnection } from "./types.ts"
import type { AuthStore } from "./auth.ts"
import { effectiveProviders, uniqueProviderId } from "./providers.ts"
import { ChatPane } from "./components/ChatPane.tsx"
import { InputBar } from "./components/InputBar.tsx"
import { StatusBar } from "./components/StatusBar.tsx"
import { Toast } from "./components/Toast.tsx"
import { ModelsModal, ConnectModal } from "./components/CommandPalette.tsx"
import { CommandSuggestions } from "./components/CommandSuggestions.tsx"
import type { CommandDef } from "./components/CommandSuggestions.tsx"

// ---------------------------------------------------------------------------
// Available slash commands — drives both suggestions and prefix-aware submit
// ---------------------------------------------------------------------------

const COMMANDS: CommandDef[] = [
  { name: "/models",  description: "switch model" },
  { name: "/connect", description: "add provider credentials" },
  { name: "/reset",   description: "clear conversation, keep persona & model" },
]

let _nextId = 0
function genId() {
  return String(++_nextId)
}

// ---------------------------------------------------------------------------
// Clipboard: OSC 52 built-in (SSH-friendly), native fallback per platform
// macOS  → pbcopy
// Linux  → wl-copy (Wayland) or xclip -selection clipboard (X11)
// ---------------------------------------------------------------------------

function nativeClipboardCmd(): string[] | null {
  if (process.platform === "darwin") return ["pbcopy"]
  if (process.platform === "linux") {
    const wayland = process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === "wayland"
    return wayland ? ["wl-copy"] : ["xclip", "-selection", "clipboard"]
  }
  return null
}

function copyToClipboard(renderer: ReturnType<typeof useRenderer>, text: string): void {
  if (renderer.isOsc52Supported() && renderer.copyToClipboardOSC52(text)) return
  const cmd = nativeClipboardCmd()
  if (!cmd) return
  try {
    const p = Bun.spawn(cmd, { stdin: "pipe" })
    p.stdin.write(text)
    p.stdin.end()
  } catch {
    // Clipboard unavailable — toast is still shown
  }
}

// ---------------------------------------------------------------------------
// Helpers for piped-input display
// ---------------------------------------------------------------------------

function formatCharCount(n: number): string {
  return n < 1000 ? `${n} chars` : `${(n / 1000).toFixed(1)}k chars`
}

const DISPLAY_HEAD = 10
const DISPLAY_TAIL = 10

/** Trim large piped content for display only (never affects the API payload). */
function trimForDisplay(text: string): string {
  const lines = text.split("\n")
  if (lines.length <= DISPLAY_HEAD + DISPLAY_TAIL) return text
  const hidden = lines.length - DISPLAY_HEAD - DISPLAY_TAIL
  return [
    ...lines.slice(0, DISPLAY_HEAD),
    `… ${hidden.toLocaleString()} lines hidden …`,
    ...lines.slice(-DISPLAY_TAIL),
  ].join("\n")
}

interface Props {
  config: Config
  initialAuth: AuthStore
  treeSitterClient: TreeSitterClient
  personas: Persona[]
  globalPrompt: string
  initialPersonaIndex: number
  initialPipedInput?: string
}

export function App({
  config,
  initialAuth,
  treeSitterClient,
  personas,
  globalPrompt,
  initialPersonaIndex,
  initialPipedInput,
}: Props) {
  const renderer = useRenderer()

  // -------------------------------------------------------------------------
  // Core state
  // -------------------------------------------------------------------------

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [stats, setStats] = useState<SessionStats>({
    totalTokens: 0,
    contextLength: 0,
    cumulativeCost: 0,
  })
  const [personaIndex, setPersonaIndex] = useState(initialPersonaIndex)
  const [copied, setCopied] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Mutable config state (models can be added/deleted/reordered at runtime)
  const [cfg, setCfg] = useState(config)

  function persistConfig(next: typeof config) {
    setCfg(next)
    saveConfig(next)
  }

  // Active model & auth
  const [activeModelIndex, setActiveModelIndex] = useState(cfg.defaultModelIndex)
  const [auth, setAuth] = useState<AuthStore>(initialAuth)

  // Modal state: null = no modal, "models" | "connect"
  const [modal, setModal] = useState<"models" | "connect" | null>(null)

  // Tracks live input value for slash-command suggestions
  const [inputValue, setInputValue] = useState("")

  // -------------------------------------------------------------------------
  // Derived: active connection
  // -------------------------------------------------------------------------

  const connection: ActiveConnection | null = resolveConnection(cfg, auth, activeModelIndex)

  // -------------------------------------------------------------------------
  // Model info (context length, pricing) — fetch when connection changes
  // -------------------------------------------------------------------------

  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)

  useEffect(() => {
    if (!connection) {
      setModelInfo(null)
      setStats((prev) => ({ ...prev, contextLength: 0 }))
      return
    }
    fetchModelInfo(connection).then((info) => {
      setModelInfo(info)
      if (info) {
        setStats((prev) => ({ ...prev, contextLength: info.context_length }))
      }
    })
  }, [connection?.providerName, connection?.model])

  // -------------------------------------------------------------------------
  // Input key + pending text tracking
  // -------------------------------------------------------------------------

  const pendingInputRef = useRef("")
  const [inputKey, setInputKey] = useState(0)

  // Piped stdin content (e.g. `cat file.txt | openchat`).
  // Held separately — never enters the textarea; composed into the API message
  // on first send, then cleared. Border title on InputBar signals its presence.
  const [pipedContent, setPipedContent] = useState(initialPipedInput ?? "")
  const pipedContentRef = useRef(initialPipedInput ?? "")
  pipedContentRef.current = pipedContent

  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const personaIndexRef = useRef(initialPersonaIndex)
  personaIndexRef.current = personaIndex

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Set while a stream is in flight; non-null doubles as "can Esc abort?" for the
  // keyboard handler below.
  const abortControllerRef = useRef<AbortController | null>(null)

  // -------------------------------------------------------------------------
  // Transient toast helper
  // -------------------------------------------------------------------------

  function showToast(msg: string, durationMs = 2500) {
    setToastMsg(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), durationMs)
  }

  // -------------------------------------------------------------------------
  // /reset: clear conversation + counters, mimicking a fresh session.
  // Persona, model, and credentials are untouched — they live in separate state.
  // -------------------------------------------------------------------------

  function handleReset() {
    setMessages([])
    messagesRef.current = []
    setStats((prev) => ({ ...prev, totalTokens: 0, cumulativeCost: 0 }))
    // Clear any leftover piped startup content so it truly behaves like a new session
    setPipedContent("")
    pipedContentRef.current = ""
    showToast("✓ Conversation reset")
  }

  // -------------------------------------------------------------------------
  // Keyboard shortcuts (global)
  // -------------------------------------------------------------------------

  useKeyboard((key) => {
    if (modal) return // modal has its own keyboard handling

    if (key.ctrl && key.name === "c") {
      renderer.destroy()
      return
    }
    if (key.name === "escape") {
      // While streaming, Esc aborts the request instead of quitting.
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      } else {
        renderer.destroy()
      }
      return
    }
    if (key.shift && key.name === "tab") {
      setPersonaIndex((i) => (i + 1) % personas.length)
    }
    if (key.ctrl && key.name === "p") {
      setModal("models")
    }
  })

  useSelectionHandler((selection) => {
    const text = selection.getSelectedText()
    if (!text.trim()) return
    copyToClipboard(renderer, text)
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  })

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

  async function sendMessage(text: string, displayText?: string) {
    if (!connection) {
      showToast("No model configured — type /connect to add credentials")
      return
    }

    const systemPrompt = composeSystemPrompt(globalPrompt, personas[personaIndexRef.current])

    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: text,
      isStreaming: false,
      // displayContent only set when it differs from content (i.e. piped trimming)
      ...(displayText !== undefined ? { displayContent: displayText } : {}),
    }
    const assistantId = genId()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    }

    const history = messagesRef.current.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const reqMessages = [...history, { role: "user" as const, content: text }]

      for await (const chunk of streamCompletion(connection, reqMessages, systemPrompt, controller.signal)) {
        if (chunk.done) break

        // Reasoning tokens arrive before the answer on thinking models.
        // Set isThinking while only reasoning is flowing (content still empty),
        // and accumulate the text for the live thinking preview.
        if (chunk.reasoning) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.content === ""
                ? { ...m, isThinking: true, reasoning: (m.reasoning ?? "") + chunk.reasoning }
                : m,
            ),
          )
        }

        if (chunk.delta) {
          // First real content delta — clear the thinking state in the same update.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk.delta, isThinking: false }
                : m,
            ),
          )
        }

        if (chunk.usage) {
          const usageData = chunk.usage
          setStats((prev) => ({
            ...prev,
            totalTokens: usageData.total_tokens,
            cumulativeCost: prev.cumulativeCost + (usageData.cost ?? 0),
          }))
        }
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false, isThinking: false } : m)),
      )
    } catch (err) {
      // Check the controller directly rather than err.name/err instanceof
      // DOMException — abort error shapes vary across runtimes.
      if (controller.signal.aborted) {
        // User pressed Esc — keep the partial reply, mark it as stopped.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, stopped: true, isStreaming: false, isThinking: false }
              : m,
          ),
        )
      } else {
        const errorText = err instanceof Error ? err.message : String(err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `**Error:** ${errorText}`, isStreaming: false, isThinking: false }
              : m,
          ),
        )
      }
    } finally {
      abortControllerRef.current = null
      setIsStreaming(false)
    }
  }

  // -------------------------------------------------------------------------
  // Submit handler — intercepts slash commands
  // -------------------------------------------------------------------------

  function handleSubmit() {
    const text = pendingInputRef.current.trim()
    // Allow empty typed message when piped content is attached
    if ((!text && !pipedContentRef.current) || isStreaming) return
    pendingInputRef.current = ""
    setInputValue("")
    setInputKey((k) => k + 1) // remount input to clear visual state

    if (text.startsWith("/")) {
      // Slash commands: don't consume piped content — keep it attached so the
      // user can open /models or /connect and still send their real message.
      const token = text.split(/\s/)[0].toLowerCase()
      // Exact match first, then unique prefix match
      const exactMatch = COMMANDS.find((c) => c.name === token)
      const prefixMatches = COMMANDS.filter((c) => c.name.startsWith(token))
      const resolved = exactMatch ?? (prefixMatches.length === 1 ? prefixMatches[0] : null)

      if (resolved?.name === "/models") {
        setModal("models")
      } else if (resolved?.name === "/connect") {
        setModal("connect")
      } else if (resolved?.name === "/reset") {
        handleReset()
      } else if (prefixMatches.length > 1) {
        showToast(`Ambiguous command: ${token}  (did you mean ${prefixMatches.map((c) => c.name).join(" or ")}?)`)
      } else {
        showToast(`Unknown command: ${token}  (available: ${COMMANDS.map((c) => c.name).join(", ")})`)
      }
      return
    }

    // Compose piped content (if any) before the user's typed query, XML-wrapped
    // so the model clearly distinguishes data from instruction.
    const piped = pipedContentRef.current
    if (piped) {
      setPipedContent("")
      pipedContentRef.current = ""
    }
    const composed = piped
      ? `<piped-input>\n${piped}\n</piped-input>\n\n${text}`
      : text
    // Build a trimmed display variant (top 10 + bottom 10 lines) so the chat
    // pane doesn't overflow with a massive paste. Full content goes to the model.
    const display = piped
      ? `<piped-input>\n${trimForDisplay(piped)}\n</piped-input>\n\n${text}`
      : undefined

    void sendMessage(composed, display)
  }

  // -------------------------------------------------------------------------
  // /connect save handler
  // -------------------------------------------------------------------------

  function handleConnectSave(providerName: string, valueOrUrl: string) {
    const providers = effectiveProviders(auth)
    const providerLabel = providers[providerName]?.label ?? (providerName.charAt(0).toUpperCase() + providerName.slice(1))
    let updated: AuthStore
    if (providers[providerName]?.keyless) {
      updated = setProviderBaseUrl(auth, providerName, valueOrUrl)
      showToast(`✓ ${providerLabel} base URL saved to auth.json`)
    } else {
      updated = setProviderKey(auth, providerName, valueOrUrl)
      showToast(`✓ ${providerLabel} key saved to auth.json`)
    }
    setAuth(updated)
  }

  function handleAddCustomProvider(def: { label: string; base_url: string; api_key: string }) {
    const id = uniqueProviderId(auth, def.label)
    setAuth(setCustomProvider(auth, id, def))
    showToast(`✓ Provider "${def.label}" added`)
  }

  function handleDeleteProvider(providerId: string) {
    const label = effectiveProviders(auth)[providerId]?.label ?? providerId
    setAuth(removeProvider(auth, providerId))
    showToast(`✓ Provider "${label}" removed`)
  }

  // -------------------------------------------------------------------------
  // /models: add / delete / set-default handlers
  // -------------------------------------------------------------------------

  function handleAddModel(entry: ModelEntry) {
    const next = { ...cfg, models: [...cfg.models, entry] }
    persistConfig(next)
    showToast(`✓ Model "${entry.name}" added`)
  }

  function handleDeleteModel(index: number) {
    const deleted = cfg.models[index]?.name ?? "?"
    const nextModels = cfg.models.filter((_, i) => i !== index)
    let nextDefault = cfg.defaultModelIndex
    if (index === cfg.defaultModelIndex) nextDefault = 0
    else if (index < cfg.defaultModelIndex) nextDefault = cfg.defaultModelIndex - 1
    const next = { ...cfg, models: nextModels, defaultModelIndex: nextDefault }
    persistConfig(next)

    // Adjust active model index too
    setActiveModelIndex((prev) => {
      if (index === prev) return 0
      if (index < prev) return prev - 1
      return prev
    })
    showToast(`✓ Model "${deleted}" removed`)
  }

  function handleSetDefault(index: number) {
    const name = cfg.models[index]?.name ?? "?"
    const next = { ...cfg, defaultModelIndex: index }
    persistConfig(next)
    showToast(`✓ "${name}" set as default model`)
  }

  function handleRenameModel(index: number, newName: string) {
    const old = cfg.models[index]?.name ?? "?"
    const nextModels = cfg.models.map((m, i) => (i === index ? { ...m, name: newName } : m))
    persistConfig({ ...cfg, models: nextModels })
    showToast(`✓ Renamed "${old}" → "${newName}"`)
  }

  // -------------------------------------------------------------------------
  // Determine active model name for status bar
  // -------------------------------------------------------------------------

  const activeModelEntry = cfg.models[activeModelIndex] ?? null

  // -------------------------------------------------------------------------
  // Slash-command suggestions
  // Show when the input starts with / (no spaces), no modal is open, not streaming
  // -------------------------------------------------------------------------

  const suggestions: CommandDef[] =
    !isStreaming && modal === null && inputValue.startsWith("/") && !inputValue.includes(" ")
      ? COMMANDS.filter((c) => c.name.startsWith(inputValue.toLowerCase()))
      : []

  const popupBg = cfg.colors.popup

  // Border title for the input box when piped content is attached
  const pipedTitle = pipedContent
    ? ` piped input · ${formatCharCount(pipedContent.length)} `
    : undefined

  // The input bar is 3 rows tall (border + 1 line + border) + 1 row status bar = 4 rows from bottom
  const SUGGESTION_BOTTOM = 4

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <ChatPane messages={messages} syntaxStyle={syntaxStyle} treeSitterClient={treeSitterClient} />

      <InputBar
        isStreaming={isStreaming || modal !== null}
        inputKey={inputKey}
        promptChar={cfg.prompt_char}
        promptColor={cfg.prompt_color}
        pipedTitle={pipedTitle}
        onContentChange={(v) => { pendingInputRef.current = v; setInputValue(v) }}
        onSubmit={handleSubmit}
      />

      <StatusBar
        modelEntry={activeModelEntry}
        connection={connection}
        persona={personas[personaIndex].name}
        modelColor={cfg.colors.model}
        personaColor={cfg.colors.persona}
        costColor={cfg.colors.cost}
        stats={stats}
        modelInfo={modelInfo}
        isStreaming={isStreaming}
      />

      {/* Slash-command suggestions (above input bar) */}
      <CommandSuggestions suggestions={suggestions} bottomOffset={SUGGESTION_BOTTOM} bgColor={popupBg} />

      {/* Clipboard copy toast */}
      <Toast visible={copied} />

      {/* Command toast (errors, confirmations) */}
      {toastMsg && <CommandToast message={toastMsg} />}

      {/* Modals */}
      {modal === "models" && (
        <ModelsModal
          models={cfg.models}
          auth={auth}
          activeModelIndex={activeModelIndex}
          defaultModelIndex={cfg.defaultModelIndex}
          bgColor={popupBg}
          onSelect={setActiveModelIndex}
          onAddModel={handleAddModel}
          onDeleteModel={handleDeleteModel}
          onSetDefault={handleSetDefault}
          onRenameModel={handleRenameModel}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "connect" && (
        <ConnectModal
          auth={auth}
          bgColor={popupBg}
          onSave={handleConnectSave}
          onAddCustom={handleAddCustomProvider}
          onDeleteProvider={handleDeleteProvider}
          onClose={() => setModal(null)}
        />
      )}
    </box>
  )
}

// ---------------------------------------------------------------------------
// Command toast (distinct from copy toast — bottom-left, different colour)
// ---------------------------------------------------------------------------

function CommandToast({ message }: { message: string }) {
  return (
    <box
      backgroundColor={colors.bgPanel}
      style={{
        position: "absolute",
        left: 2,
        bottom: 5,
        zIndex: 100,
        paddingLeft: 2,
        paddingRight: 2,
        border: ["top", "bottom", "left", "right"] as ["top", "bottom", "left", "right"],
        borderColor: colors.border,
      }}
    >
      <text fg={colors.yellow}>{message}</text>
    </box>
  )
}
