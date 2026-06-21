import { useTerminalDimensions } from "@opentui/react"
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

function formatCost(cost: number, compact: boolean): string {
  if (compact) {
    if (cost === 0) return "$0.000"
    if (cost < 0.0001) return `$${cost.toFixed(5)}`
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(3)}`
  }
  if (cost === 0) return "$0.0000"
  if (cost < 0.0001) return `$${cost.toFixed(6)}`
  if (cost < 0.01) return `$${cost.toFixed(5)}`
  return `$${cost.toFixed(4)}`
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function formatContext(
  stats: SessionStats,
  { showPrefix, showTokens }: { showPrefix: boolean; showTokens: boolean },
): string {
  const prefix = showPrefix ? "ctx: " : ""
  if (stats.contextLength === 0) return `${prefix}—`
  const pct = Math.round((stats.totalTokens / stats.contextLength) * 100)
  if (stats.totalTokens === 0 || !showTokens) return `${prefix}${pct}%`
  return `${prefix}${pct}% ${formatTokens(stats.totalTokens)}`
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
  const { width } = useTerminalDimensions()
  const personaTitle = persona.charAt(0).toUpperCase() + persona.slice(1)
  const statusDot = isStreaming ? "●" : "○"
  const statusLabel = isStreaming ? "streaming" : "ready"
  const statusColor = isStreaming ? colors.greenBright : colors.textFaint

  // Responsive right side: as the terminal narrows, progressively compact the
  // status/ctx/cost/hint cluster (see LEVELS below) rather than letting it overlap
  // the left side. Each divider (│) occupies: gap(2) + char(1) + gap(2) = 5 cols when
  // shown, or just the box's gap(2) once hidden; outer padding = 4 cols.
  const HINT = "ctrl+p models · shift+tab persona · ctrl+c exit"
  const modelDisplay = modelEntry?.name ?? ""
  const leftW = modelDisplay.length + personaTitle.length + 5 // model │ persona

  // level: 0 = full layout, 6 = maximally compact. See plan for the step ordering.
  function rightWidthForLevel(level: number): number {
    const hideHint = level >= 1
    const hideLabel = level >= 2
    const hideCtxPrefix = level >= 3
    const hideTokens = level >= 4
    const compactCost = level >= 5
    const hideDividers = level >= 6

    const statusStr = hideLabel ? statusDot : `${statusDot} ${statusLabel}`
    const ctxStr = formatContext(stats, { showPrefix: !hideCtxPrefix, showTokens: !hideTokens })
    const costStr = formatCost(stats.cumulativeCost, compactCost)
    const segments = [statusStr, ctxStr, costStr]
    if (!hideHint) segments.push(HINT)

    const jointWidth = hideDividers ? 2 : 5
    const joints = segments.length - 1
    return segments.reduce((sum, s) => sum + s.length, 0) + joints * jointWidth
  }

  let level = 0
  while (level < 6 && width < 4 + leftW + rightWidthForLevel(level) + 1) {
    level++
  }

  const hideHint = level >= 1
  const hideLabel = level >= 2
  const hideCtxPrefix = level >= 3
  const hideTokens = level >= 4
  const compactCost = level >= 5
  const hideDividers = level >= 6

  const statusText = hideLabel ? statusDot : `${statusDot} ${statusLabel}`
  const ctxText = formatContext(stats, { showPrefix: !hideCtxPrefix, showTokens: !hideTokens })
  const costText = formatCost(stats.cumulativeCost, compactCost)

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
        <text fg={statusColor}>{statusText}</text>
        {!hideDividers && <text fg={colors.textFaint}>│</text>}
        <text fg={colors.textMuted}>{ctxText}</text>
        {!hideDividers && <text fg={colors.textFaint}>│</text>}
        <text fg={costColor}>{costText}</text>
        {!hideHint && !hideDividers && <text fg={colors.textFaint}>│</text>}
        {!hideHint && <text fg={colors.textFaint}>{HINT}</text>}
      </box>
    </box>
  )
}
