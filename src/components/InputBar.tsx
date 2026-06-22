import { useRef } from "react"
import type { TextareaRenderable } from "@opentui/core"
import { colors } from "../theme.ts"

interface Props {
  isStreaming: boolean
  inputKey: number
  promptChar: string
  promptColor: string
  /** Border title shown when piped stdin content is attached, e.g. "◆ piped input · 1.2k chars" */
  pipedTitle?: string
  onContentChange: (text: string) => void
  onSubmit: () => void
}

export function InputBar({ isStreaming, inputKey, promptChar, promptColor, pipedTitle, onContentChange, onSubmit }: Props) {
  const textareaRef = useRef<TextareaRenderable>(null)

  const placeholder = isStreaming
    ? "waiting for response..."
    : "message  ⏎ send · shift+⏎ newline"
  const borderColor = isStreaming ? colors.textFaint : colors.border

  function handleContentChange() {
    onContentChange(textareaRef.current?.plainText ?? "")
  }

  return (
    <box
      title={pipedTitle}
      titleColor={colors.textMuted}
      titleAlignment="right"
      style={{
        width: "100%",
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "flex-start",
        border: true,
        borderStyle: "rounded",
        borderColor,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {/* Prompt marker */}
      <text fg={isStreaming ? colors.textFaint : promptColor} style={{ marginRight: 1 }}>
        {promptChar}
      </text>

      <textarea
        ref={textareaRef}
        key={inputKey}
        placeholder={placeholder}
        focused={!isStreaming}
        wrapMode="word"
        height="auto"
        style={{ flexGrow: 1, maxHeight: 8 }}
        textColor={colors.text}
        placeholderColor={colors.textFaint}
        cursorColor={colors.accent}
        keyBindings={[
          { name: "return", action: "submit" },
          { name: "return", shift: true, action: "newline" },
        ]}
        onContentChange={handleContentChange}
        onSubmit={onSubmit}
      />
    </box>
  )
}
