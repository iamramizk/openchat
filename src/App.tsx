import { useEffect, useRef, useState } from "react"
import { useKeyboard, useRenderer, useSelectionHandler } from "@opentui/react"
import type { TreeSitterClient } from "@opentui/core"
import { streamCompletion, fetchModelInfo } from "./openrouter.ts"
import { composeSystemPrompt } from "./personas.ts"
import { syntaxStyle, colors } from "./theme.ts"
import { resolveConnection, saveConfig } from "./config.ts"
import { setProviderKey } from "./auth.ts"
import type { Config, ChatMessage, ModelEntry, ModelInfo, Persona, SessionStats, ActiveConnection } from "./types.ts"
import type { AuthStore } from "./auth.ts"
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

interface Props {
  config: Config
  initialAuth: AuthStore
  treeSitterClient: TreeSitterClient
  personas: Persona[]
  globalPrompt: string
  initialPersonaIndex: number
}

export function App({
  config,
  initialAuth,
  treeSitterClient,
  personas,
  globalPrompt,
  initialPersonaIndex,
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

  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const personaIndexRef = useRef(initialPersonaIndex)
  personaIndexRef.current = personaIndex

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // -------------------------------------------------------------------------
  // Transient toast helper
  // -------------------------------------------------------------------------

  function showToast(msg: string, durationMs = 2500) {
    setToastMsg(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), durationMs)
  }

  // -------------------------------------------------------------------------
  // Keyboard shortcuts (global)
  // -------------------------------------------------------------------------

  useKeyboard((key) => {
    if (modal) return // modal has its own keyboard handling

    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
    }
    if (key.shift && key.name === "tab") {
      setPersonaIndex((i) => (i + 1) % personas.length)
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

  async function sendMessage(text: string) {
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

    try {
      const reqMessages = [...history, { role: "user" as const, content: text }]

      for await (const chunk of streamCompletion(connection, reqMessages, systemPrompt)) {
        if (chunk.done) break

        if (chunk.delta) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk.delta } : m,
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
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
      )
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `**Error:** ${errorText}`, isStreaming: false }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  // -------------------------------------------------------------------------
  // Submit handler — intercepts slash commands
  // -------------------------------------------------------------------------

  function handleSubmit() {
    const text = pendingInputRef.current.trim()
    if (!text || isStreaming) return
    pendingInputRef.current = ""
    setInputValue("")
    setInputKey((k) => k + 1) // remount input to clear visual state

    if (text.startsWith("/")) {
      const token = text.split(/\s/)[0].toLowerCase()
      // Exact match first, then unique prefix match
      const exactMatch = COMMANDS.find((c) => c.name === token)
      const prefixMatches = COMMANDS.filter((c) => c.name.startsWith(token))
      const resolved = exactMatch ?? (prefixMatches.length === 1 ? prefixMatches[0] : null)

      if (resolved?.name === "/models") {
        setModal("models")
      } else if (resolved?.name === "/connect") {
        setModal("connect")
      } else if (prefixMatches.length > 1) {
        showToast(`Ambiguous command: ${token}  (did you mean ${prefixMatches.map((c) => c.name).join(" or ")}?)`)
      } else {
        showToast(`Unknown command: ${token}  (available: ${COMMANDS.map((c) => c.name).join(", ")})`)
      }
      return
    }

    void sendMessage(text)
  }

  // -------------------------------------------------------------------------
  // /connect save handler
  // -------------------------------------------------------------------------

  function handleConnectSave(providerName: string, apiKey: string) {
    const updated = setProviderKey(auth, providerName, apiKey)
    setAuth(updated)
    const providerLabel = providerName.charAt(0).toUpperCase() + providerName.slice(1)
    showToast(`✓ ${providerLabel} key saved to auth.json`)
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
          onClose={() => setModal(null)}
        />
      )}
      {modal === "connect" && (
        <ConnectModal
          auth={auth}
          bgColor={popupBg}
          onSave={handleConnectSave}
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
