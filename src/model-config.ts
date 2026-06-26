// ---------------------------------------------------------------------------
// Per-model extra-params validation
// Shared between the /models config editor (live lint) and its save path.
// ---------------------------------------------------------------------------

/** Root-level request keys that the app owns — never let user config overwrite them. */
export const RESERVED_KEYS = ["model", "messages", "stream", "stream_options"] as const

export type ValidationResult =
  | { ok: true;  value?: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Validate and parse a JSON string that will be merged into the chat-completions
 * request body.
 *
 * - Empty / whitespace → ok, value undefined (removes config, nothing added to request).
 * - Must parse as a plain JSON object enclosed in `{ }` — arrays, strings, numbers,
 *   partial fragments (`"key": value`) all fail.
 * - Top-level keys matching RESERVED_KEYS are rejected.
 * - Types (numbers, booleans, null) are preserved exactly as JSON.parse returns them;
 *   no string coercion occurs.
 */
export function validateModelConfig(text: string): ValidationResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: undefined }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    const msg = err instanceof SyntaxError ? err.message : String(err)
    // Keep the error message short enough to fit in one line of the modal.
    const short = msg.length > 60 ? msg.slice(0, 57) + "…" : msg
    return { ok: false, error: `Syntax Error: ${short}` }
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return { ok: false, error: 'Must be a JSON object { … }' }
  }

  const obj = parsed as Record<string, unknown>
  for (const key of RESERVED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return { ok: false, error: `"${key}" is reserved and cannot be overridden` }
    }
  }

  return { ok: true, value: obj }
}
