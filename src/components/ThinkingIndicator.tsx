import { useEffect, useState } from "react"
import { useTerminalDimensions } from "@opentui/react"
import { colors } from "../theme.ts"

// ---------------------------------------------------------------------------
// Animated braille dots spinner shown while the model is in its reasoning phase,
// plus a live scrolling preview of the last few lines of reasoning text.
// ---------------------------------------------------------------------------

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const FRAME_MS = 80

const PREVIEW_MAX_LINES = 5
// Only the tail of the reasoning text can ever be visible — cap how much we
// re-wrap on every update to keep this cheap even for long-winded models.
const PREVIEW_TAIL_CHARS = 2000

/** Word-wrap `text` to `width` columns and return the last `maxLines` wrapped lines. */
function tailWrap(text: string, width: number, maxLines: number): string[] {
  if (width <= 0) return []
  const tail = text.length > PREVIEW_TAIL_CHARS ? text.slice(-PREVIEW_TAIL_CHARS) : text

  const lines: string[] = []
  for (const paragraph of tail.split("\n")) {
    if (paragraph === "") {
      lines.push("")
      continue
    }
    let current = ""
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > width && current) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    lines.push(current)
  }

  return lines.slice(-maxLines)
}

interface Props {
  /** Accumulated reasoning/thinking text streamed so far. */
  reasoning?: string
}

export function ThinkingIndicator({ reasoning }: Props) {
  const [frame, setFrame] = useState(0)
  const { width } = useTerminalDimensions()

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length)
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [])

  // Matches Message.tsx's paddingLeft + paddingRight (2 + 2).
  const previewWidth = width - 4
  const previewLines = reasoning ? tailWrap(reasoning, previewWidth, PREVIEW_MAX_LINES) : []

  return (
    <box style={{ flexDirection: "column", marginBottom: 1 }}>
      <text fg={colors.textFaint}>
        {FRAMES[frame]} Thinking
      </text>
      {previewLines.length > 0 && (
        <>
          <text fg={colors.textFaint}> </text>
          <box style={{ flexDirection: "column" }}>
            {previewLines.map((line, i) => (
              <text key={i} fg={colors.textFaint}>
                {line || " "}
              </text>
            ))}
          </box>
        </>
      )}
    </box>
  )
}
