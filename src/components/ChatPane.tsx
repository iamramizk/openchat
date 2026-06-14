import type { SyntaxStyle, TreeSitterClient } from "@opentui/core"
import { colors } from "../theme.ts"
import type { ChatMessage } from "../types.ts"
import { Message } from "./Message.tsx"

interface Props {
  messages: ChatMessage[]
  syntaxStyle: SyntaxStyle
  treeSitterClient: TreeSitterClient
}

function EmptyState() {
  return (
    <box
      style={{
        flexGrow: 1,
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <text fg={colors.textFaint}>openchat</text>
      <text fg={colors.textFaint}>ask anything ↓</text>
    </box>
  )
}

export function ChatPane({ messages, syntaxStyle, treeSitterClient }: Props) {
  return (
    <scrollbox
      stickyScroll={true}
      stickyStart="bottom"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        minHeight: 0,
        width: "100%",
      }}
    >
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        messages.map((msg, i) => (
          <box key={msg.id} style={{ width: "100%", flexDirection: "column" }}>
            <Message msg={msg} syntaxStyle={syntaxStyle} treeSitterClient={treeSitterClient} />
            {i < messages.length - 1 && (
              <box
                style={{
                  width: "100%",
                  border: ["bottom"] as ["bottom"],
                  borderColor: colors.borderMuted,
                }}
              />
            )}
          </box>
        ))
      )}
    </scrollbox>
  )
}
