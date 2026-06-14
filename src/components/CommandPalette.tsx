import { useRef, useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import type { SelectOption } from "@opentui/core"
import type { ModelEntry } from "../types.ts"
import type { AuthStore } from "../auth.ts"
import { PROVIDER_LIST } from "../providers.ts"
import { colors } from "../theme.ts"
import { configFile, authFile } from "../paths.ts"

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

  const modelIdRef = useRef<{ plainText?: string } | null>(null)
  const nameRef = useRef<{ plainText?: string } | null>(null)

  useKeyboard((key) => {
    if (mode === "list") {
      if (key.name === "escape") { onClose(); return }
      if (key.name === "a") { setMode("add-provider"); return }
      if (key.name === "d" && models.length > 0) { setMode("confirm-delete"); return }
      if (key.name === "f" && models.length > 0) { onSetDefault(highlightIndex); return }
      if (key.name === "r" && models.length > 0) { setMode("rename"); return }
    }

    if (mode === "confirm-delete") {
      if (key.name === "d" || key.name === "y") {
        onDeleteModel(highlightIndex)
        setHighlightIndex(0)
        setMode("list")
        return
      }
      // any other key (including esc) cancels
      setMode("list")
      return
    }

    if (mode === "add-provider" || mode === "add-model" || mode === "add-name") {
      if (key.name === "escape") {
        if (mode === "add-name") setMode("add-model")
        else if (mode === "add-model") setMode("add-provider")
        else setMode("list")
        return
      }
    }

    if (mode === "rename") {
      if (key.name === "escape") { setMode("list"); return }
    }
  })

  // ---- empty state ----
  if (models.length === 0 && mode === "list") {
    return (
      <Overlay>
        <ModalShell
          title="/models  a add · esc cancel"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
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
    const connectedProviders = PROVIDER_LIST.filter((p) => Boolean(auth.providers[p.id]?.api_key))
    if (connectedProviders.length === 0) {
      return (
        <Overlay>
          <ModalShell
            title="/models · add model — no connected providers"
            innerWidth={innerW}
            bgColor={bgColor}
            footer={configFile()}
          >
            <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
              <text fg={colors.textMuted}>
                {"No providers connected.\nRun /connect first to add API credentials."}
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
          title="/models · add — pick provider · esc back"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
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
              setPendingProvider(option.value as string)
              setMode("add-model")
            }}
          />
        </ModalShell>
      </Overlay>
    )
  }

  // ---- add: enter model id ----
  if (mode === "add-model") {
    const providerLabel =
      PROVIDER_LIST.find((p) => p.id === pendingProvider)?.label ?? pendingProvider

    return (
      <Overlay>
        <ModalShell
          title={`/models · add · ${providerLabel} — model id · esc back`}
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
          title="/models · add — display name · esc back"
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
                ref={nameRef as React.Ref<any>}
                height={1}
                style={{ flexGrow: 1 }}
                textColor={colors.text}
                cursorColor={colors.accent}
                placeholderColor={colors.textFaint}
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
          title="/models · rename — new name · esc back"
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
          title="/models · delete — confirm"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={configFile()}
        >
          <box style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 }}>
            <text fg={colors.yellow}>
              {`Delete "${target}"?  press d or y to confirm · any other key to cancel`}
            </text>
          </box>
        </ModalShell>
      </Overlay>
    )
  }

  // ---- main list ----
  const options = models.map((entry, idx) => {
    const hasKey = Boolean(auth.providers[entry.provider]?.api_key)
    const isDefault = idx === defaultModelIndex
    const descParts: string[] = [`${entry.provider} · ${entry.model}`]
    if (!hasKey) descParts.push("(no key — run /connect)")
    if (isDefault) descParts.push("★ default")
    return { name: entry.name, description: descParts.join("  "), value: entry.name }
  })

  const listHeight = Math.min(models.length, 6) * 2

  return (
    <Overlay>
      <ModalShell
        title="/models  ↑↓ navigate · enter select · a add · d delete · f default · r rename · esc cancel"
        innerWidth={innerW}
        bgColor={bgColor}
        footer={configFile()}
      >
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
  onClose: () => void
}

export function ConnectModal({ auth, bgColor, onSave, onClose }: ConnectModalProps) {
  const { width } = useTerminalDimensions()
  const innerW = Math.min(64, Math.max(40, width - 4))

  const [step, setStep] = useState<"pick" | "key">("pick")
  const [selectedProvider, setSelectedProvider] = useState<string>("")
  const inputRef = useRef<{ plainText?: string } | null>(null)

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (step === "key") {
        setStep("pick")
      } else {
        onClose()
      }
    }
  })

  if (step === "pick") {
    const options = PROVIDER_LIST.map((p) => ({
      name: p.label,
      description: auth.providers[p.id]?.api_key
        ? `${p.base_url}  ✓ key saved`
        : p.base_url,
      value: p.id,
    }))

    return (
      <Overlay>
        <ModalShell
          title="/connect  ↑↓ navigate · enter select · esc cancel"
          innerWidth={innerW}
          bgColor={bgColor}
          footer={authFile()}
        >
          <select
            options={options}
            width={innerW}
            height={PROVIDER_LIST.length * 2}
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
              setSelectedProvider(option.value as string)
              setStep("key")
            }}
          />
        </ModalShell>
      </Overlay>
    )
  }

  // Step 2: key entry
  const providerLabel = PROVIDER_LIST.find((p) => p.id === selectedProvider)?.label ?? selectedProvider
  const existing = auth.providers[selectedProvider]?.api_key ?? ""

  return (
    <Overlay>
      <ModalShell
        title={`/connect · ${providerLabel}  enter save · esc back`}
        innerWidth={innerW}
        bgColor={bgColor}
        footer={authFile()}
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
  innerWidth,
  bgColor,
  footer,
  children,
}: {
  title: string
  innerWidth: number
  bgColor: string
  footer?: string
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
      {/* Title bar */}
      <box
        style={{
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 1,
          paddingBottom: 1,
          flexShrink: 0,
        }}
      >
        <text fg={colors.accent}>{title}</text>
      </box>

      {children}

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
