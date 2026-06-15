import type { SyntaxStyle, TreeSitterClient } from "@opentui/core"
import { colors } from "../theme.ts"
import type { ChatMessage } from "../types.ts"

interface Props {
  msg: ChatMessage
  syntaxStyle: SyntaxStyle
  treeSitterClient: TreeSitterClient
}

export function Message({ msg, syntaxStyle, treeSitterClient }: Props) {
  const isUser = msg.role === "user"
  const roleLabel = isUser ? "you" : "assistant"
  const roleColor = isUser ? colors.accent : colors.green

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        paddingBottom: 1,
      }}
    >
      {/* Role label */}
      <text fg={roleColor} style={{ marginBottom: 1 }}>
        {roleLabel}
      </text>

      {/* Message content */}
      {isUser ? (
        <text fg={colors.text} style={{ width: "100%" }}>
          {msg.displayContent ?? msg.content ?? ""}
        </text>
      ) : (
        <markdown
          content={msg.content || " "}
          syntaxStyle={syntaxStyle}
          treeSitterClient={treeSitterClient}
          streaming={msg.isStreaming}
          width="100%"
          fg={colors.text}
        />
      )}
    </box>
  )
}
