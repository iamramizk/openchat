import type { FiletypeParserOptions } from "@opentui/core"

// Base URL for prebuilt tree-sitter WASM binaries (tree-sitter-wasms npm package via jsDelivr)
const WASM_BASE = "https://cdn.jsdelivr.net/npm/tree-sitter-wasms@latest/out"

// Highlights query sources: prefer the grammar's own repo; fall back to nvim-treesitter where
// the official grammar doesn't ship a usable highlights.scm.
const TS_BASE = "https://raw.githubusercontent.com/tree-sitter"
const TS_GRAMMARS_BASE = "https://raw.githubusercontent.com/tree-sitter-grammars"
const NVIM_TS_BASE = "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries"

// ---------------------------------------------------------------------------
// Extra language parser definitions (registered via addDefaultParsers before
// treeSitterClient.initialize()). WASM + queries are fetched lazily on first
// use of each language, then cached in the data path.
// ---------------------------------------------------------------------------

export const EXTRA_PARSERS: FiletypeParserOptions[] = [
  // Python
  {
    filetype: "python",
    aliases: ["py"],
    wasm: `${WASM_BASE}/tree-sitter-python.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-python/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // Bash / Shell
  {
    filetype: "bash",
    aliases: ["sh", "shell", "zsh"],
    wasm: `${WASM_BASE}/tree-sitter-bash.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-bash/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // JSON
  {
    filetype: "json",
    aliases: ["jsonc"],
    wasm: `${WASM_BASE}/tree-sitter-json.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-json/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // Go
  {
    filetype: "go",
    aliases: ["golang"],
    wasm: `${WASM_BASE}/tree-sitter-go.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-go/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // Rust
  {
    filetype: "rust",
    aliases: ["rs"],
    wasm: `${WASM_BASE}/tree-sitter-rust.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-rust/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // YAML
  {
    filetype: "yaml",
    aliases: ["yml"],
    wasm: `${WASM_BASE}/tree-sitter-yaml.wasm`,
    queries: {
      highlights: [
        `${TS_GRAMMARS_BASE}/tree-sitter-yaml/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // TOML
  {
    filetype: "toml",
    aliases: [],
    wasm: `${WASM_BASE}/tree-sitter-toml.wasm`,
    queries: {
      highlights: [
        `${TS_GRAMMARS_BASE}/tree-sitter-toml/refs/heads/main/queries/highlights.scm`,
      ],
    },
  },

  // HTML (nvim-treesitter queries are more reliable for HTML)
  {
    filetype: "html",
    aliases: [],
    wasm: `${WASM_BASE}/tree-sitter-html.wasm`,
    queries: {
      highlights: [
        `${NVIM_TS_BASE}/html/highlights.scm`,
      ],
    },
  },

  // CSS
  {
    filetype: "css",
    aliases: [],
    wasm: `${WASM_BASE}/tree-sitter-css.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-css/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // C
  {
    filetype: "c",
    aliases: [],
    wasm: `${WASM_BASE}/tree-sitter-c.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-c/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // C++
  {
    filetype: "cpp",
    aliases: ["c++", "cxx", "cc"],
    wasm: `${WASM_BASE}/tree-sitter-cpp.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-cpp/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // Ruby
  {
    filetype: "ruby",
    aliases: ["rb"],
    wasm: `${WASM_BASE}/tree-sitter-ruby.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-ruby/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // Java
  {
    filetype: "java",
    aliases: [],
    wasm: `${WASM_BASE}/tree-sitter-java.wasm`,
    queries: {
      highlights: [
        `${TS_BASE}/tree-sitter-java/refs/heads/master/queries/highlights.scm`,
      ],
    },
  },

  // PHP
  {
    filetype: "php",
    aliases: [],
    wasm: `${WASM_BASE}/tree-sitter-php.wasm`,
    queries: {
      highlights: [
        `${NVIM_TS_BASE}/php/highlights.scm`,
      ],
    },
  },

  // SQL
  {
    filetype: "sql",
    aliases: [],
    wasm: `${WASM_BASE}/tree-sitter-sql.wasm`,
    queries: {
      highlights: [
        `${TS_GRAMMARS_BASE}/tree-sitter-sql/refs/heads/main/queries/highlights.scm`,
      ],
    },
  },
]
