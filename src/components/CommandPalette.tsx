import { useEffect, useRef, useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import type { SelectOption } from "@opentui/core"
import type { ModelEntry } from "../types.ts"
import type { AuthStore } from "../auth.ts"
import { effectiveProviderList, effectiveProviders, isCustomProvider } from "../providers.ts"
import { fetchInstalledModels } from "../completions.ts"
import { colors } from "../theme.ts"
import { configFile, authFile } from "../paths.ts"

/**
 * How many lines `text` word-wraps to at `width` columns (mirrors the wrap rule used
 * by the renderer's own word-wrap, see ThinkingIndicator.tsx's `tailWrap`). Used to
 * reserve a fixed number of rows for hint text so swapping between two hint strings of
 * different lengths doesn't change a modal's overall height (and re-center it).
 */
function countWrappedLines(text: string, width: number): number {
  if (width <= 0) return 1
  let lines = 0
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines++
      continue
    }
    let current = ""
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > width && current) {
        lines++
        current = word
      } else {
        current = candidate
      }
    }
    lines++ // final (or only) line of the paragraph
  }
  return Math.max(lines, 1)
}

// ---------------------------------------------------------------------------
// /models modal — list, add (a), delete (d), set-default (f), select (enter)
// ---------------------------------------------------------------------------

interface ModelsModalProps {
  models: ModelEntry[]
  auth: AuthStore
  activeModelIndex: number
  defaultModelIndex: number
  bgColor: string
  onSelect: (index: number) => void
  onAddModel: (entry: ModelEntry) => void
  onDeleteModel: (index: number) => void
  onSetDefault: (index: number) => void
  onRenameModel: (index: number, newName: string) => void
  onClose: () => void
}

type ModelsMode =
  | "list"
  | "add-provider"
  | "add-model"
  | "add-ollama-models"
  | "add-name"
  | "confirm-delete"
  | "rename"

export function ModelsModal({
  models,
  auth,
  activeModelIndex,
  defaultModelIndex,
  bgColor,
  onSelect,
  onAddModel,
  onDeleteModel,
  onSetDefault,
  onRenameModel,
  onClose,
}: ModelsModalProps) {
  const { width } = useTerminalDimensions()
  const innerW = Math.min(64, Math.max(40, width - 4))

  const [mode, setMode] = useState<ModelsMode>("list")
  const [highlightIndex, setHighlightIndex] = useState(activeModelIndex)
  const [pendingProvider, setPendingProvider] = useState("")
  const [pendingModelId, setPendingModelId] = useState("")
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)

  const modelIdRef = useRef<{ plainText?: string } | null>(null)
  const nameRef = useRef<{ plainText?: string } | null>(null)

  // "list" mode shows a filtered view of `models`; highlightIndex indexes into `filtered`
  // (translated back to a real `models` index — `.idx` — before acting on it).
  const q = query.trim().toLowerCase()
  const filtered = models
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => q === "" || `${entry.name} ${entry.provider} ${entry.model}`.toLowerCase().includes(q))

  useKeyboard((key) => {
    if (mode === "list") {
      if (searching) {
        if (key.name === "escape") { setSearching(false); return }
        if (key.name === "backspace") {
          setQuery((s) => s.slice(0, -1))
          setHighlightIndex(0)
          return
        }
        // Printable keys (letters/digits/symbols/space) extend the query; named keys
        // (arrows, return, tab…) fall through untouched to the focused <select> below,
        // so ↑↓ still moves the highlight and Enter still selects it while filtering.
        const isPrintable = !key.ctrl && !key.meta && (key.name === "space" || key.name.length === 1)
        if (isPrintable) {
          key.preventDefault()
          setQuery((s) => s + (key.name === "space" ? " " : key.sequence || key.name))
          setHighlightIndex(0)
        }
        return
      }

      if (key.name === "escape") {
        if (query) { setQuery(""); setHighlightIndex(0) } else { onClose() }
        return
      }
      if (key.name === "/" && models.length > 0) { setSearching(true); return }
      if (key.name === "a") { setMode("add-provider"); return }
      if (key.name === "d" && filtered.length > 0) {
        setHighlightIndex(filtered[highlightIndex]?.idx ?? 0)
        setMode("confirm-delete")
        return
      }
      if (key.name === "f" && filtered.length > 0) { onSetDefault(filtered[highlightIndex]?.idx ?? 0); return }
      if (key.name === "r" && filtered.length > 0) {
        setHighlightIndex(filtered[highlightIndex]?.idx ?? 0)
        setMode("rename")
        return
      }
    }

    if (mode === "confirm-delete") {
      if (key.name === "d" || key.name === "y") {
        onDeleteModel(highlightIndex)
        setHighlightIndex(0)
        setMode("list")
        return
      }
      // any other key (including esc) cancels
      setHighlightIndex(0)
      setMode("list")
      return
    }

    if (mode === "add-provider" || mode === "add-model" || mode === "add-ollama-models" || mode === "add-name") {
      if (key.name === "escape") {
        if (mode === "add-name") {
          // go back to model-id step (typed) or, for built-in Ollama, the install pick-list
          setMode(pendingProvider === "ollama" ? "add-ollama-models" : "add-model")
        } else if (mode === "add-model" || mode === "add-ollama-models") {
          setMode("add-provider")
        } else {
          setMode("list")
        }
        return
      }
    }

    if (mode === "rename") {
      if (key.name === "escape") { setHighlightIndex(0); setMode("list"); return }
    }
  })

  // ---- empty state ----
  if (models.length === 0 && mode === "list") {
    return (
      <Overlay>
        <ModalShell
          title="models"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
          hint="a add · esc cancel"
        >
          <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
            <text fg={colors.textMuted}>
              {"No models configured.\nPress 'a' to add a model, or edit config.yaml directly."}
            </text>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add: pick provider ----
  if (mode === "add-provider") {
    const providers = effectiveProviders(auth)
    const connectedProviders = effectiveProviderList(auth).filter(
      (p) => Boolean(auth.providers[p.id]?.api_key) || Boolean(providers[p.id]?.keyless),
    )
    if (connectedProviders.length === 0) {
      return (
        <Overlay>
          <ModalShell
            title="models"
            subtitle="add model — no connected providers"
            innerWidth={innerW}
            bgColor={bgColor}
            footer={configFile()}
          >
            <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
              <text fg={colors.textMuted}>
                {"No providers connected.\nRun /connect to add API credentials, or add an Ollama model (no key needed)."}
              </text>
            </box>
          </ModalShell>
        </Overlay>
      )
    }

    const options = connectedProviders.map((p) => ({
      name: p.label,
      description: p.base_url,
      value: p.id,
    }))

    return (
      <Overlay>
        <ModalShell
          title="models"
          subtitle="add — pick provider"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
          hint="esc back"
        >
          <select
            options={options}
            width={innerW}
            height={connectedProviders.length * 2}
            backgroundColor={bgColor}
            focusedBackgroundColor={bgColor}
            selectedBackgroundColor={bgColor}
            selectedTextColor={colors.text}
            textColor={colors.textMuted}
            descriptionColor={colors.textFaint}
            selectedDescriptionColor={colors.textMuted}
            focused
            onSelect={(_index: number, option: SelectOption | null) => {
              if (!option) return
              const id = option.value as string
              setPendingProvider(id)
              if (id === "ollama") {
                // Fetch installed models from the local Ollama server
                const savedBaseUrl = auth.providers[id]?.base_url ?? providers[id].base_url
                setOllamaModels([])
                setOllamaError(null)
                setOllamaLoading(true)
                fetchInstalledModels(savedBaseUrl, "")
                  .then((ids) => { setOllamaModels(ids); setOllamaLoading(false) })
                  .catch((e: unknown) => {
                    setOllamaError(e instanceof Error ? e.message : String(e))
                    setOllamaLoading(false)
                  })
                setMode("add-ollama-models")
              } else {
                // Built-in keyed/keyless providers and any custom provider all use
                // manual model-id entry — only Ollama has a live install pick-list.
                setMode("add-model")
              }
            }}
          />
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add: ollama installed-models pick-list ----
  if (mode === "add-ollama-models") {
    if (ollamaLoading) {
      return (
        <Overlay>
          <ModalShell
            title="models"
            subtitle="add · Ollama — fetching installed models…"
            innerWidth={innerW}
            bgColor={bgColor}
            footer={configFile()}
          >
            <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
              <text fg={colors.textMuted}>Contacting Ollama server…</text>
            </box>
          </ModalShell>
        </Overlay>
      )
    }

    if (ollamaError || ollamaModels.length === 0) {
      return (
        <Overlay>
          <ModalShell
            title="models"
            subtitle="add · Ollama — no models found"
            innerWidth={innerW}
            bgColor={bgColor}
            footer={configFile()}
            hint="esc back"
          >
            <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
              <text fg={colors.yellow}>
                {ollamaError
                  ? `Error: ${ollamaError}`
                  : "No models installed. Run: ollama pull <model>"}
              </text>
            </box>
          </ModalShell>
        </Overlay>
      )
    }

    const addedIds = new Set(
      models.filter((m) => m.provider === pendingProvider).map((m) => m.model),
    )
    const ollamaOptions = ollamaModels.map((id) => ({
      name: id,
      description: addedIds.has(id) ? "✓ already added" : "",
      value: id,
    }))
    return (
      <Overlay>
        <ModalShell
          title="models"
          subtitle="add · Ollama — pick model"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
          hint="esc back"
        >
          <select
            options={ollamaOptions}
            width={innerW}
            height={Math.min(ollamaModels.length, 8) * 2}
            backgroundColor={bgColor}
            focusedBackgroundColor={bgColor}
            selectedBackgroundColor={bgColor}
            selectedTextColor={colors.text}
            textColor={colors.textMuted}
            descriptionColor={colors.textFaint}
            selectedDescriptionColor={colors.textMuted}
            showScrollIndicator
            focused
            onSelect={(_index: number, option: SelectOption | null) => {
              if (!option) return
              const id = option.value as string
              if (addedIds.has(id)) return // already added — not selectable
              setPendingModelId(id)
              setMode("add-name")
            }}
          />
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add: enter model id ----
  if (mode === "add-model") {
    const providerLabel =
      effectiveProviderList(auth).find((p) => p.id === pendingProvider)?.label ?? pendingProvider

    return (
      <Overlay>
        <ModalShell
          title="models"
          subtitle={`add · ${providerLabel} — model id`}
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
          hint="esc back"
        >
          <box
            style={{
              flexDirection: "column",
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 1,
              paddingBottom: 1,
              gap: 1,
              width: innerW,
            }}
          >
            <text fg={colors.textFaint}>Enter the model id (e.g. deepseek/deepseek-v4-flash:nitro):</text>
            <box
              style={{
                flexDirection: "row",
                border: true,
                borderStyle: "rounded",
                borderColor: colors.border,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <textarea
                ref={modelIdRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
                placeholder="provider/model-id"
                focused
                keyBindings={[{ name: "return", action: "submit" }]}
                onSubmit={() => {
                  const id = (modelIdRef.current?.plainText ?? "").trim()
                  if (id) {
                    setPendingModelId(id)
                    setMode("add-name")
                  }
                }}
              />
            </box>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add: enter display name ----
  if (mode === "add-name") {
    return (
      <Overlay>
        <ModalShell
          title="models"
          subtitle="add — display name"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
          hint="esc back"
        >
          <box
            style={{
              flexDirection: "column",
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 1,
              paddingBottom: 1,
              gap: 1,
              width: innerW,
            }}
          >
            <text fg={colors.textFaint}>Short display name for the status bar (e.g. deepseek):</text>
            <box
              style={{
                flexDirection: "row",
                border: true,
                borderStyle: "rounded",
                borderColor: colors.border,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <textarea
                key={`name-${pendingModelId}`}
                ref={nameRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
                initialValue={pendingModelId}
                placeholder={pendingModelId}
                focused
                keyBindings={[{ name: "return", action: "submit" }]}
                onSubmit={() => {
                  const raw = (nameRef.current?.plainText ?? "").trim()
                  const name = raw || pendingModelId
                  onAddModel({ name, provider: pendingProvider, model: pendingModelId })
                  setMode("list")
                  onClose()
                }}
              />
            </box>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- rename ----
  if (mode === "rename") {
    const currentName = models[highlightIndex]?.name ?? ""
    return (
      <Overlay>
        <ModalShell
          title="models"
          subtitle="rename — new name"
          hint="esc back"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
        >
          <box
            style={{
              flexDirection: "column",
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 1,
              paddingBottom: 1,
              gap: 1,
              width: innerW,
            }}
          >
            <text fg={colors.textFaint}>New display name for "{currentName}":</text>
            <box
              style={{
                flexDirection: "row",
                border: true,
                borderStyle: "rounded",
                borderColor: colors.border,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <textarea
                ref={nameRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
                placeholder={currentName}
                focused
                keyBindings={[{ name: "return", action: "submit" }]}
                onSubmit={() => {
                  const raw = (nameRef.current?.plainText ?? "").trim()
                  if (raw) {
                    onRenameModel(highlightIndex, raw)
                  }
                  setHighlightIndex(0)
                  setMode("list")
                }}
              />
            </box>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- confirm delete ----
  if (mode === "confirm-delete") {
    const target = models[highlightIndex]?.name ?? "?"
    return (
      <Overlay>
        <ModalShell
          title="models"
          subtitle="delete — confirm"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
          hint="d or y confirm · any other key cancel"
        >
          <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
            <text fg={colors.yellow}>{`Delete "${target}"?`}</text>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- main list ----
  const providers = effectiveProviders(auth)
  const options = filtered.map(({ entry, idx }) => {
    const provDef = providers[entry.provider]
    const hasKey = Boolean(auth.providers[entry.provider]?.api_key)
    const isDefault = idx === defaultModelIndex
    const descParts: string[] = [`${entry.provider} · ${entry.model}`]
    if (!hasKey && !provDef?.keyless) descParts.push("(no key — run /connect)")
    if (isDefault) descParts.push("★ default")
    return { name: entry.name, description: descParts.join("  "), value: entry.name }
  })

  // Reserve list/hint heights based on the *unfiltered* model count and the *longer* of
  // the two hint strings, so toggling search mode or narrowing a filter never changes the
  // modal's overall height (it's vertically centered — any height change visibly jumps it).
  const listHeight = Math.min(models.length, 6) * 2
  const searchText = searching ? `${query}▏` : query || "Type / to filter"
  const searchColor = query || searching ? colors.text : colors.textFaint
  const listHint = "↑↓ navigate · enter select · / filter · a add · d delete · f default · r rename · esc cancel"
  const searchHint = "type to filter · ↑↓ navigate · enter select · esc done"
  const hint = searching ? searchHint : listHint
  const hintWrapWidth = innerW + 2 // ModalShell width (innerW + 6) minus the hint box's 2+2 padding
  const hintReserveLines = Math.max(
    countWrappedLines(listHint, hintWrapWidth),
    countWrappedLines(searchHint, hintWrapWidth),
  )

  return (
    <Overlay>
      <ModalShell
        title="models"
        innerWidth={innerW}
        bgColor={bgColor}
        footer={configFile()}
        hint={hint}
        hintReserveLines={hintReserveLines}
      >
        <box
          style={{
            flexDirection: "column",
            paddingLeft: 2,
            paddingRight: 2,
            paddingBottom: 1,
            gap: 1,
            width: innerW,
          }}
        >
          <box
            style={{
              flexDirection: "row",
              border: true,
              borderStyle: "rounded",
              borderColor: searching ? colors.accent : colors.border,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text fg={searchColor}>{searchText}</text>
          </box>

          {filtered.length === 0 ? (
            <box style={{ height: listHeight, justifyContent: "flex-start" }}>
              <text fg={colors.textMuted}>{`No models match "${query}"`}</text>
            </box>
          ) : (
            <select
              options={options}
              selectedIndex={highlightIndex}
              width={innerW}
              height={listHeight}
              backgroundColor={bgColor}
              focusedBackgroundColor={bgColor}
              selectedBackgroundColor={bgColor}
              selectedTextColor={colors.text}
              textColor={colors.textMuted}
              descriptionColor={colors.textFaint}
              selectedDescriptionColor={colors.textMuted}
              showScrollIndicator
              wrapSelection
              focused
              onChange={(index: number) => {
                setHighlightIndex(index)
              }}
              onSelect={(_index: number, option: SelectOption | null) => {
                if (!option) return
                const idx = models.findIndex((m) => m.name === option.value)
                if (idx >= 0) {
                  onSelect(idx)
                  onClose()
                }
              }}
            />
          )}
        </box>
      </ModalShell>
    </Overlay>
  )
}

// ---------------------------------------------------------------------------
// /connect modal — step 1: pick provider; step 2: enter API key
// ---------------------------------------------------------------------------

interface ConnectModalProps {
  auth: AuthStore
  bgColor: string
  onSave: (providerName: string, apiKey: string) => void
  onAddCustom: (def: { label: string; base_url: string; api_key: string }) => void
  onDeleteProvider: (providerId: string) => void
  onClose: () => void
}

type ConnectStep = "pick" | "key" | "add-name" | "add-url" | "add-key" | "confirm-delete"

export function ConnectModal({ auth, bgColor, onSave, onAddCustom, onDeleteProvider, onClose }: ConnectModalProps) {
  const { width } = useTerminalDimensions()
  const innerW = Math.min(64, Math.max(40, width - 4))

  const [step, setStep] = useState<ConnectStep>("pick")
  const [selectedProvider, setSelectedProvider] = useState<string>("")
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [pendingName, setPendingName] = useState("")
  const [pendingUrl, setPendingUrl] = useState("")
  const inputRef = useRef<{ plainText?: string } | null>(null)
  const nameRef = useRef<{ plainText?: string } | null>(null)
  const urlRef = useRef<{ plainText?: string } | null>(null)
  const keyRef = useRef<{ plainText?: string } | null>(null)

  const providerList = effectiveProviderList(auth)
  const highlighted = providerList[highlightIndex]

  useKeyboard((key) => {
    if (step === "pick") {
      if (key.name === "escape") { onClose(); return }
      if (key.name === "a") { setPendingName(""); setPendingUrl(""); setStep("add-name"); return }
      if (key.name === "d" && highlighted && isCustomProvider(auth, highlighted.id)) {
        setStep("confirm-delete")
        return
      }
      return
    }

    if (step === "confirm-delete") {
      if (key.name === "d" || key.name === "y") {
        onDeleteProvider(highlighted.id)
        setHighlightIndex(0)
      }
      // any other key (including esc) cancels
      setStep("pick")
      return
    }

    if (key.name === "escape") {
      if (step === "key") setStep("pick")
      else if (step === "add-key") setStep("add-url")
      else if (step === "add-url") setStep("add-name")
      else if (step === "add-name") setStep("pick")
    }
  })

  if (step === "pick") {
    const options = providerList.map((p) => {
      let description: string
      if (p.keyless) {
        const savedUrl = auth.providers[p.id]?.base_url ?? p.base_url
        description = `${savedUrl}  ✓ no key needed`
      } else {
        description = auth.providers[p.id]?.api_key
          ? `${p.base_url}  ✓ key saved`
          : p.base_url
      }
      if (isCustomProvider(auth, p.id)) description += "  · custom"
      return { name: p.label, description, value: p.id }
    })

    return (
      <Overlay>
        <ModalShell
          title="connect"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={authFile()}
          hint="↑↓ navigate · enter select · a add custom · d delete · esc cancel"
        >
          <select
            options={options}
            width={innerW}
            height={providerList.length * 2}
            backgroundColor={bgColor}
            focusedBackgroundColor={bgColor}
            selectedBackgroundColor={bgColor}
            selectedTextColor={colors.text}
            textColor={colors.textMuted}
            descriptionColor={colors.textFaint}
            selectedDescriptionColor={colors.textMuted}
            focused
            onChange={(index: number) => {
              setHighlightIndex(index)
            }}
            onSelect={(_index: number, option: SelectOption | null) => {
              if (!option) return
              setSelectedProvider(option.value as string)
              setStep("key")
            }}
          />
        </ModalShell>
      </Overlay>
    )
  }

  // ---- confirm delete (custom providers only) ----
  if (step === "confirm-delete") {
    const target = highlighted?.label ?? "?"
    return (
      <Overlay>
        <ModalShell
          title="connect"
          subtitle="delete — confirm"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={authFile()}
          hint="d or y confirm · any other key cancel"
        >
          <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
            <text fg={colors.yellow}>{`Delete "${target}"?`}</text>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add custom provider: step 1 — name ----
  if (step === "add-name") {
    return (
      <Overlay>
        <ModalShell
          title="connect"
          subtitle="add custom — name"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={authFile()}
          hint="esc back"
        >
          <box style={{ flexDirection: "column", paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, gap: 1, width: innerW }}>
            <text fg={colors.textFaint}>Display name for this provider (e.g. LM Studio):</text>
            <box style={{ flexDirection: "row", border: true, borderStyle: "rounded", borderColor: colors.border, paddingLeft: 1, paddingRight: 1 }}>
              <textarea
                key="add-name"
                ref={nameRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
                placeholder="My local server"
                focused
                keyBindings={[{ name: "return", action: "submit" }]}
                onSubmit={() => {
                  const text = (nameRef.current?.plainText ?? "").trim()
                  if (text) {
                    setPendingName(text)
                    setStep("add-url")
                  }
                }}
              />
            </box>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add custom provider: step 2 — base URL ----
  if (step === "add-url") {
    return (
      <Overlay>
        <ModalShell
          title="connect"
          subtitle={`add custom · ${pendingName} — base URL`}
          innerWidth={innerW}
          bgColor={bgColor}
          footer={authFile()}
          hint="esc back"
        >
          <box style={{ flexDirection: "column", paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, gap: 1, width: innerW }}>
            <text fg={colors.textFaint}>OpenAI-compatible base URL (e.g. http://localhost:1234/v1):</text>
            <box style={{ flexDirection: "row", border: true, borderStyle: "rounded", borderColor: colors.border, paddingLeft: 1, paddingRight: 1 }}>
              <textarea
                key="add-url"
                ref={urlRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
                placeholder="http://localhost:11434/v1"
                focused
                keyBindings={[{ name: "return", action: "submit" }]}
                onSubmit={() => {
                  const text = (urlRef.current?.plainText ?? "").trim()
                  if (text) {
                    setPendingUrl(text)
                    setStep("add-key")
                  }
                }}
              />
            </box>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add custom provider: step 3 — API key (empty allowed, for local servers) ----
  if (step === "add-key") {
    return (
      <Overlay>
        <ModalShell
          title="connect"
          subtitle={`add custom · ${pendingName} — API key`}
          innerWidth={innerW}
          bgColor={bgColor}
          footer={authFile()}
          hint="esc back"
        >
          <box style={{ flexDirection: "column", paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, gap: 1, width: innerW }}>
            <text fg={colors.textFaint}>API key (enter to save, leave blank if no key is needed):</text>
            <box style={{ flexDirection: "row", border: true, borderStyle: "rounded", borderColor: colors.border, paddingLeft: 1, paddingRight: 1 }}>
              <textarea
                key="add-key"
                ref={keyRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
                placeholder="sk-... (optional)"
                focused
                keyBindings={[{ name: "return", action: "submit" }]}
                onSubmit={() => {
                  const text = (keyRef.current?.plainText ?? "").trim()
                  onAddCustom({ label: pendingName, base_url: pendingUrl, api_key: text })
                  onClose()
                }}
              />
            </box>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // Step 2: key entry (keyed providers) or base-URL editor (keyless providers)
  const providers = effectiveProviders(auth)
  const providerLabel = providerList.find((p) => p.id === selectedProvider)?.label ?? selectedProvider
  const isKeyless = providers[selectedProvider]?.keyless ?? false

  if (isKeyless) {
    const defaultUrl = providers[selectedProvider]?.base_url ?? "http://localhost:11434/v1"
    const savedUrl = auth.providers[selectedProvider]?.base_url ?? defaultUrl

    return (
      <Overlay>
        <ModalShell
          title="connect"
          subtitle={providerLabel}
          innerWidth={innerW}
          bgColor={bgColor}
          footer={authFile()}
          hint="enter save · esc back"
        >
          <box
            style={{
              flexDirection: "column",
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 1,
              paddingBottom: 1,
              gap: 1,
              width: innerW,
            }}
          >
            <text fg={colors.textMuted}>
              {`${providerLabel} needs no API key — it runs locally.`}
            </text>
            <text fg={colors.textFaint}>Base URL (enter to save, blank = default):</text>
            <box
              style={{
                flexDirection: "row",
                border: true,
                borderStyle: "rounded",
                borderColor: colors.border,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <textarea
                key={`url-${selectedProvider}`}
                ref={inputRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
                placeholder={defaultUrl}
                focused
                keyBindings={[{ name: "return", action: "submit" }]}
                onSubmit={() => {
                  const text = (inputRef.current?.plainText ?? "").trim()
                  // Pass the typed URL, or the existing saved URL, or the default
                  onSave(selectedProvider, text || savedUrl || defaultUrl)
                  onClose()
                }}
              />
            </box>
            <text fg={colors.textFaint}>{`Current: ${savedUrl}`}</text>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  const existing = auth.providers[selectedProvider]?.api_key ?? ""

  return (
    <Overlay>
      <ModalShell
        title="connect"
        subtitle={providerLabel}
        innerWidth={innerW}
        bgColor={bgColor}
        footer={authFile()}
        hint="enter save · esc back"
      >
        <box
          style={{
            flexDirection: "column",
            paddingLeft: 2,
            paddingRight: 2,
            paddingTop: 1,
            paddingBottom: 1,
            gap: 1,
            width: innerW,
          }}
        >
          <text fg={colors.textMuted}>
            {existing
              ? `Current key: ${existing.slice(0, 6)}··········  (enter to overwrite)`
              : "No key saved for this provider."}
          </text>
          <text fg={colors.textFaint}>Paste new API key and press enter:</text>
          <box
            style={{
              flexDirection: "row",
              border: true,
              borderStyle: "rounded",
              borderColor: colors.border,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <textarea
              key={`key-${selectedProvider}`}
              ref={inputRef as React.Ref<any>}
              height={1}
              style={{ flexGrow: 1 }}
              textColor={colors.text}
              cursorColor={colors.accent}
              placeholderColor={colors.textFaint}
              placeholder="sk-..."
              focused
              keyBindings={[
                { name: "return", action: "submit" },
              ]}
              onSubmit={() => {
                const text = (inputRef.current?.plainText ?? "").trim()
                if (text) {
                  onSave(selectedProvider, text)
                  onClose()
                }
              }}
            />
          </box>
        </box>
      </ModalShell>
    </Overlay>
  )
}

// ---------------------------------------------------------------------------
// Shared overlay + modal chrome (borderless)
// ---------------------------------------------------------------------------

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 200,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {children}
    </box>
  )
}

function ModalShell({
  title,
  subtitle,
  innerWidth,
  bgColor,
  footer,
  hint,
  hintReserveLines,
  children,
}: {
  title: string
  /** Step description shown centered on its own line under `title`, in `colors.text` —
   * keeps the bare command name as the title while still naming the current step
   * (e.g. "add — pick provider", a provider label). Any keymap text belongs in `hint`. */
  subtitle?: string
  innerWidth: number
  bgColor: string
  footer?: string
  hint?: string
  /** Reserve this many content rows for `hint` regardless of how many lines it actually
   * wraps to — keeps the modal's overall height (and thus its centered position) stable
   * when the caller swaps in a shorter/longer hint string (e.g. /models search mode). */
  hintReserveLines?: number
  children: React.ReactNode
}) {
  return (
    <box
      style={{
        flexDirection: "column",
        backgroundColor: bgColor,
        width: innerWidth + 6,
      }}
    >
      {/* Title bar: command name, plus an optional step subtitle on the line below */}
      <box
        style={{
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 1,
          paddingBottom: 1,
          flexShrink: 0,
        }}
      >
        <text fg={colors.accent}>{title}</text>
        {subtitle && <text fg={colors.text}>{subtitle}</text>}
      </box>

      {children}

      {/* Shortcut hints, moved to the bottom so the title bar stays short */}
      {hint && (
        <box
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            paddingTop: 1,
            paddingBottom: footer ? 0 : 1,
            flexShrink: 0,
            ...(hintReserveLines !== undefined
              ? { height: hintReserveLines + 1 + (footer ? 0 : 1) }
              : {}),
          }}
        >
          <text fg={colors.textFaint}>{hint}</text>
        </box>
      )}

      {/* Footer: file path */}
      {footer && (
        <box
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            paddingTop: 1,
            paddingBottom: 1,
            flexShrink: 0,
          }}
        >
          <text fg={colors.textFaint}>{footer}</text>
        </box>
      )}
    </box>
  )
}
