import { useEffect, useRef } from "react"
import type { SyntaxStyle, TreeSitterClient, ScrollBoxRenderable } from "@opentui/core"
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
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  // Remove the vertical scrollbar from layout entirely (sets yogaNode display:none,
  // sticky via _manualVisibility so recalculateVisibility() won't re-show it).
  // Scrolling (wheel/keyboard) still works — it's driven by the scrollbox itself.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.verticalScrollBar.visible = false
  }, [])

  return (
    <scrollbox
      ref={scrollRef as React.Ref<any>}
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
