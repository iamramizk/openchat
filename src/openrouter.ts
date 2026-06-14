import type { ActiveConnection, ModelInfo, StreamChunk } from "./types.ts"

// ---------------------------------------------------------------------------
// Model metadata
// Accepts both context_length (OpenRouter) and context_window (Groq).
// Falls back to entry override, then a sane default.
// ---------------------------------------------------------------------------

export async function fetchModelInfo(conn: ActiveConnection): Promise<ModelInfo | null> {
  try {
    const res = await fetch(`${conn.base_url}/models`, {
      headers: { Authorization: `Bearer ${conn.api_key}` },
    })
    if (!res.ok) return null

    const data = (await res.json()) as {
      data: Array<{
        id: string
        context_length?: number
        context_window?: number   // Groq uses this key
        pricing?: { prompt?: string; completion?: string }
      }>
    }

    const baseId = conn.model.split(":")[0]
    const model =
      data.data.find((m) => m.id === conn.model) ??
      data.data.find((m) => m.id === baseId)
    if (!model) {
      // Model not found in /models — use override or default
      return {
        id: conn.model,
        context_length: conn.contextLengthOverride ?? 128_000,
        pricing: { prompt: 0, completion: 0 },
      }
    }

    const contextLength =
      model.context_length ??
      model.context_window ??
      conn.contextLengthOverride ??
      128_000

    return {
      id: model.id,
      context_length: contextLength,
      pricing: {
        prompt: parseFloat(model.pricing?.prompt ?? "0"),
        completion: parseFloat(model.pricing?.completion ?? "0"),
      },
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Streaming completions — OpenAI-compatible SSE
// ---------------------------------------------------------------------------

export async function* streamCompletion(
  conn: ActiveConnection,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
): AsyncGenerator<StreamChunk> {
  const body = {
    model: conn.model,
    stream: true,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream_options: { include_usage: true },
  }

  const res = await fetch(`${conn.base_url}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.api_key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/openchat",
      "X-Title": "openchat",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }

  if (!res.body) throw new Error("No response body from API")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === ":") continue // SSE keep-alive
        if (!trimmed.startsWith("data: ")) continue

        const data = trimmed.slice(6)
        if (data === "[DONE]") {
          yield { delta: "", done: true }
          return
        }

        try {
          const json = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string | null }
              finish_reason?: string | null
            }>
            usage?: {
              prompt_tokens: number
              completion_tokens: number
              total_tokens: number
              cost?: number
            }
          }

          const delta = json.choices?.[0]?.delta?.content ?? ""
          const usage = json.usage

          if (delta || usage) {
            yield { delta, usage, done: false }
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.cancel()
  }
}
