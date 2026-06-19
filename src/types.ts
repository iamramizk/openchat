// ---------------------------------------------------------------------------
// Model entry: a (provider + model-id) pair defined in config.yaml
// ---------------------------------------------------------------------------

export interface ModelEntry {
  name: string            // display name + /models key
  provider: string        // must match a provider in auth.json
  model: string           // model id sent to the API
  context_length?: number // optional override when provider /models lacks it
}

// ---------------------------------------------------------------------------
// App config — loaded from ~/.config/openchat/config.yaml (no secrets)
// ---------------------------------------------------------------------------

export interface Config {
  models: ModelEntry[]
  defaultModelIndex: number
  default_persona: string
  colors: {
    model: string
    persona: string
    cost: string
    popup: string
  }
  prompt_char: string
  prompt_color: string
}

// ---------------------------------------------------------------------------
// Active connection: the resolved (provider creds + model) for the current turn
// ---------------------------------------------------------------------------

export interface ActiveConnection {
  providerName: string
  base_url: string
  api_key: string
  model: string
  contextLengthOverride?: number  // from ModelEntry.context_length
}

// ---------------------------------------------------------------------------
// Chat & streaming
// ---------------------------------------------------------------------------

export interface Persona {
  name: string
  content: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming: boolean
  /** True while the model is emitting reasoning tokens and no answer content has arrived yet. */
  isThinking?: boolean
  /** Accumulated reasoning/thinking text, shown as a scrolling preview while isThinking. */
  reasoning?: string
  /** Display-only override for user messages with large piped payloads.
   *  Never sent to the model or replayed in conversation history. */
  displayContent?: string
  /** True when an assistant reply was cut short by Esc — renders a dim "⏹ stopped" marker. */
  stopped?: boolean
}

export interface ModelInfo {
  id: string
  context_length: number
  pricing: {
    prompt: number    // cost per token (USD)
    completion: number
  }
}

export interface SessionStats {
  totalTokens: number
  contextLength: number
  cumulativeCost: number
}

export interface StreamChunk {
  delta: string
  /** Reasoning/thinking token from models that emit a separate reasoning field. */
  reasoning?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    cost?: number
  }
  done: boolean
}
