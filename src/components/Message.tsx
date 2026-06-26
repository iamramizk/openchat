import type { SyntaxStyle, TreeSitterClient } from "@opentui/core"
import { t, link, fg } from "@opentui/core"
import { colors } from "../theme.ts"
import type { ChatMessage } from "../types.ts"
import { ThinkingIndicator, WorkingIndicator } from "./ThinkingIndicator.tsx"
import { normalizeCitations, extractSources } from "../markdown.ts"

interface Props {
  msg: ChatMessage
  syntaxStyle: SyntaxStyle
  treeSitterClient: TreeSitterClient
}

// Mirrors the marker line produced by trimForDisplay() in App.tsx — rendered as a dim
// inline span so it stands apart from the surrounding piped-input preview text.
const HIDDEN_LINES_RE = /^… [\d,]+ lines hidden …$/m

/** Split `text` around the (at most one) hidden-lines marker and dim it via a nested span. */
function renderUserContent(text: string) {
  const match = text.match(HIDDEN_LINES_RE)
  if (!match || match.index === undefined) return text
  const before = text.slice(0, match.index)
  const marker = match[0]
  const after = text.slice(match.index + marker.length)
  return (
    <>
      {before}
      <span fg={colors.textFaint}>{marker}</span>
      {after}
    </>
  )
}

export function Message({ msg, syntaxStyle, treeSitterClient }: Props) {
  const isUser = msg.role === "user"
  const roleLabel = isUser ? "you" : "assistant"
  const roleColor = isUser ? colors.accent : colors.green
  const sources = isUser ? [] : extractSources(msg.content)

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

      {/* Thinking indicator — shown while reasoning tokens arrive, before answer text */}
      {!isUser && msg.isThinking && <ThinkingIndicator reasoning={msg.reasoning} />}

      {/* Working indicator — shown while waiting for the first token (no content or reasoning yet) */}
      {!isUser && msg.isStreaming && !msg.isThinking && msg.content === "" && !msg.stopped && (
        <WorkingIndicator />
      )}

      {/* Message content */}
      {isUser ? (
        <text fg={colors.text} style={{ width: "100%" }}>
          {renderUserContent(msg.displayContent ?? msg.content ?? "")}
        </text>
      ) : (
        <>
          <markdown
            content={normalizeCitations(msg.content) || " "}
            syntaxStyle={syntaxStyle}
            treeSitterClient={treeSitterClient}
            streaming={msg.isStreaming}
            width="100%"
            fg={colors.text}
          />
          {msg.stopped && (
            <text fg={colors.textFaint} style={msg.content ? { marginTop: 1 } : undefined}>
              ⏹ stopped
            </text>
          )}
          {!msg.isStreaming && sources.length > 0 && (
            <box
              style={{
                flexDirection: "column",
                marginTop: msg.stopped ? 0 : 1,
              }}
            >
              <text fg={colors.textFaint}>
                {`↗ ${sources.length} source${sources.length === 1 ? "" : "s"}`}
              </text>
              {sources.map((s, i) => (
                <text
                  key={i}
                  content={t`  ${fg(colors.textFaint)(`[${s.label}] `)}${link(s.url)(fg(colors.textFaint)(s.url))}`}
                />
              ))}
            </box>
          )}
        </>
      )}
    </box>
  )
}
