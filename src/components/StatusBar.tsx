import { colors } from "../theme.ts"
import type { SessionStats, ModelInfo, ModelEntry, ActiveConnection } from "../types.ts"

interface Props {
  modelEntry: ModelEntry | null
  connection: ActiveConnection | null
  persona: string
  modelColor: string
  personaColor: string
  costColor: string
  stats: SessionStats
  modelInfo: ModelInfo | null
  isStreaming: boolean
}

function formatCost(cost: number): string {
  if (cost === 0) return "$0.0000"
  if (cost < 0.0001) return `$${cost.toFixed(6)}`
  if (cost < 0.01) return `$${cost.toFixed(5)}`
  return `$${cost.toFixed(4)}`
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function formatContext(stats: SessionStats): string {
  if (stats.contextLength === 0) return "ctx: —"
  const pct = Math.round((stats.totalTokens / stats.contextLength) * 100)
  if (stats.totalTokens === 0) return `ctx: ${pct}%`
  return `ctx: ${pct}% ${formatTokens(stats.totalTokens)}`
}

export function StatusBar({
  modelEntry,
  connection,
  persona,
  modelColor,
  personaColor,
  costColor,
  stats,
  modelInfo: _modelInfo,
  isStreaming,
}: Props) {
  const personaTitle = persona.charAt(0).toUpperCase() + persona.slice(1)
  const ctx = formatContext(stats)
  const cost = formatCost(stats.cumulativeCost)
  const statusDot = isStreaming ? "●" : "○"
  const statusLabel = isStreaming ? "streaming" : "ready"
  const statusColor = isStreaming ? colors.greenBright : colors.textFaint

  // No model configured
  if (!modelEntry || !connection) {
    return (
      <box
        style={{
          flexDirection: "row",
          width: "100%",
          height: 1,
          flexShrink: 0,
          paddingLeft: 2,
          paddingRight: 2,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <text fg={colors.accent}>no model configured</text>
        <text fg={colors.textFaint}>/connect add credentials · /models switch model · ctrl+c exit</text>
      </box>
    )
  }

  const modelDisplay = modelEntry.name

  return (
    <box
      style={{
        flexDirection: "row",
        width: "100%",
        height: 1,
        flexShrink: 0,
        paddingLeft: 2,
        paddingRight: 2,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <box style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <text fg={modelColor}>{modelDisplay}</text>
        <text fg={colors.textFaint}>│</text>
        <text fg={personaColor}>{personaTitle}</text>
      </box>

      <box style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <text fg={statusColor}>{statusDot} {statusLabel}</text>
        <text fg={colors.textFaint}>│</text>
        <text fg={colors.textMuted}>{ctx}</text>
        <text fg={colors.textFaint}>│</text>
        <text fg={costColor}>{cost}</text>
        <text fg={colors.textFaint}>│</text>
        <text fg={colors.textFaint}>shift+tab persona · ctrl+c exit</text>
      </box>
    </box>
  )
}
