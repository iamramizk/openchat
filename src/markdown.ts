// ---------------------------------------------------------------------------
// Display-time markdown helpers
// These operate on content strings before rendering — never mutate msg.content
// (which is replayed verbatim in conversation history and /copy).
// ---------------------------------------------------------------------------

/**
 * Strip URLs from citation-style markdown links so they render as clean `[1]`
 * markers rather than leaking the URL as visible text.
 *
 * opentui's MarkdownRenderable defaults `conceal: true`, which renders every
 * link as `label (href)` — there is no mode that hides the URL. The only
 * clean solution is to remove the URL at the display layer so the renderer
 * sees a bare `[1]` reference and styles it as a compact blue marker.
 *
 * Two forms handled:
 *   [[1]](url)  → [1]   doubled-bracket (unambiguously a citation; any label)
 *   [1](url)    → [1]   single-bracket numeric-only labels (strong citation signal)
 *
 * Prose links like [OpenAI](https://openai.com) are left untouched because
 * their labels are not purely numeric.
 *
 * The URL is stripped from the *display* string only — msg.content is never
 * mutated, so `extractSources` (which runs on the original) still finds all
 * URLs correctly.
 */
export function normalizeCitations(content: string): string {
  return content
    // [[1]](url) → [1]   (doubled-bracket form — any label, strip URL)
    .replace(/\[\[([^\]]+)\]\]\([^)]*\)/g, "[$1]")
    // [1](url) → [1]     (single-bracket, numeric label only)
    .replace(/\[(\d+)\]\([^)]*\)/g, "[$1]")
}

// ---------------------------------------------------------------------------

export interface Source {
  label: string
  url: string
}

/**
 * Extract an ordered, deduplicated list of {label, url} source pairs from
 * citation markdown in the *original* msg.content (before any normalization).
 *
 * Three citation forms are recognised (same as normalizeCitations):
 *   [[1]](url)   — doubled-bracket inline
 *   [1](url)     — single-bracket inline, numeric label only
 *   [1]: url     — reference-style definition block
 *
 * URLs are deduplicated: if the same URL appears under different labels only
 * the first occurrence is kept (preserving display order).
 */
export function extractSources(content: string): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []

  const push = (label: string, url: string) => {
    if (!seen.has(url)) {
      seen.add(url)
      out.push({ label, url })
    }
  }

  for (const m of content.matchAll(/\[\[([^\]]+)\]\]\(\s*([^)\s]+)[^)]*\)/g))
    push(m[1], m[2])
  for (const m of content.matchAll(/\[(\d+)\]\(\s*([^)\s]+)[^)]*\)/g))
    push(m[1], m[2])
  for (const m of content.matchAll(/^\s*\[(\w+)\]:\s*(\S+)/gm))
    push(m[1], m[2])

  return out
}
