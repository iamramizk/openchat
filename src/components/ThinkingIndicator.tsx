import { useEffect, useState } from "react"
import { colors } from "../theme.ts"

// ---------------------------------------------------------------------------
// Animated braille dots spinner shown while the model is in its reasoning phase.
// ---------------------------------------------------------------------------

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const FRAME_MS = 80

export function ThinkingIndicator() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length)
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <text fg={colors.textFaint} style={{ marginBottom: 1 }}>
      {FRAMES[frame]} Thinking
    </text>
  )
}
