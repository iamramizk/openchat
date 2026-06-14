import { useEffect, useRef, useState } from "react"
import type { TextareaRenderable } from "@opentui/core"
import { colors } from "../theme.ts"

interface Props {
  isStreaming: boolean
  inputKey: number
  promptChar: string
  promptColor: string
  onContentChange: (text: string) => void
  onSubmit: () => void
}

export function InputBar({ isStreaming, inputKey, promptChar, promptColor, onContentChange, onSubmit }: Props) {
  const textareaRef = useRef<TextareaRenderable>(null)
  const [textHeight, setTextHeight] = useState(1)

  // Reset height when textarea remounts after a send (inputKey increments)
  useEffect(() => {
    setTextHeight(1)
  }, [inputKey])

  const placeholder = isStreaming
    ? "waiting for response..."
    : "message  ⏎ send · shift+⏎ newline"
  const borderColor = isStreaming ? colors.textFaint : colors.border

  function handleContentChange() {
    const text = textareaRef.current?.plainText ?? ""
    onContentChange(text)
    const lines = (text.match(/\n/g) ?? []).length + 1
    const clamped = Math.min(Math.max(lines, 1), 8)
    if (clamped !== textHeight) setTextHeight(clamped)
  }

  return (
    <box
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
        height={textHeight}
        style={{ flexGrow: 1 }}
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
