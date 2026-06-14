import { colors } from "../theme.ts"

export interface CommandDef {
  name: string
  description: string
}

interface Props {
  suggestions: CommandDef[]
  bottomOffset: number // rows above the bottom of the screen (sits just above the input bar)
  bgColor: string
}

/**
 * Floating display-only popup that appears just above the input bar when the
 * user is typing a slash command. No focus is stolen.
 */
export function CommandSuggestions({ suggestions, bottomOffset, bgColor }: Props) {
  if (suggestions.length === 0) return null

  return (
    <box
      backgroundColor={bgColor}
      style={{
        position: "absolute",
        left: 2,
        bottom: bottomOffset,
        zIndex: 100,
        flexDirection: "column",
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        paddingBottom: 1,
      }}
    >
      {suggestions.map((cmd) => (
        <box key={cmd.name} style={{ flexDirection: "row", gap: 2 }}>
          <text fg={colors.accent}>{cmd.name}</text>
          <text fg={colors.textFaint}>{cmd.description}</text>
        </box>
      ))}
    </box>
  )
}
