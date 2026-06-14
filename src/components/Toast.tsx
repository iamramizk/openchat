import { colors } from "../theme.ts"

interface Props {
  visible: boolean
}

export function Toast({ visible }: Props) {
  if (!visible) return null

  return (
    <box
      backgroundColor={colors.bgPanel}
      style={{
        position: "absolute",
        right: 2,
        bottom: 5,
        zIndex: 100,
        paddingLeft: 2,
        paddingRight: 2,
        border: ["top", "bottom", "left", "right"] as ["top", "bottom", "left", "right"],
        borderColor: colors.border,
      }}
    >
      <text fg={colors.green}>✓ copied to clipboard</text>
    </box>
  )
}
