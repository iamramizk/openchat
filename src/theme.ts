import { SyntaxStyle, RGBA } from "@opentui/core"

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

export const colors = {
  bg:            "#0D1117",
  bgPanel:       "#161B22",
  bgInput:       "#1C2128",
  bgUserMsg:     "#161B22",
  border:        "#30363D",
  borderMuted:   "#21262D",
  text:          "#E6EDF3",
  textMuted:     "#7D8590",
  textFaint:     "#484F58",
  accent:        "#58A6FF",  // user label / links
  green:         "#3FB950",  // assistant label / ready
  greenBright:   "#56D364",  // streaming / ctx bar
  purple:        "#D2A8FF",  // model name
  orange:        "#F0883E",  // cost
  red:           "#FF7B72",  // errors
  yellow:        "#E3B341",  // warnings
  cyan:          "#A5D6FF",  // inline code
  stringColor:   "#A5D6FF",
  keywordColor:  "#FF7B72",
  commentColor:  "#8B949E",
  numberColor:   "#79C0FF",
  typeColor:     "#FFA657",
  funcColor:     "#D2A8FF",
  opColor:       "#79C0FF",
} as const

// ---------------------------------------------------------------------------
// Syntax style for <markdown> component
// ---------------------------------------------------------------------------

export const syntaxStyle = SyntaxStyle.fromStyles({
  // Markdown structure
  "markup.heading":     { fg: RGBA.fromHex(colors.accent), bold: true },
  "markup.heading.1":   { fg: RGBA.fromHex(colors.accent), bold: true },
  "markup.heading.2":   { fg: RGBA.fromHex(colors.accent), bold: true },
  "markup.heading.3":   { fg: RGBA.fromHex(colors.accent), bold: true },
  "markup.heading.4":   { fg: RGBA.fromHex(colors.text), bold: true },
  "markup.heading.5":   { fg: RGBA.fromHex(colors.text), bold: true },
  "markup.heading.6":   { fg: RGBA.fromHex(colors.textMuted), bold: true },

  "markup.list":        { fg: RGBA.fromHex(colors.text) },
  "markup.list.bullet": { fg: RGBA.fromHex(colors.green) },

  "markup.raw.inline":  { fg: RGBA.fromHex(colors.cyan) },
  "markup.raw":         { fg: RGBA.fromHex(colors.cyan) },
  "markup.raw.block":   { fg: RGBA.fromHex(colors.text) },

  "markup.link":        { fg: RGBA.fromHex(colors.accent), underline: true },
  "markup.link.url":    { fg: RGBA.fromHex(colors.accent), underline: true },
  "markup.link.label":  { fg: RGBA.fromHex(colors.accent) },

  "markup.strong":      { fg: RGBA.fromHex(colors.text), bold: true },
  "markup.italic":      { italic: true },
  "markup.strikethrough": { fg: RGBA.fromHex(colors.textMuted) },

  "markup.quote":       { fg: RGBA.fromHex(colors.textMuted), italic: true },

  "punctuation":        { fg: RGBA.fromHex(colors.textMuted) },
  "punctuation.bracket": { fg: RGBA.fromHex(colors.textMuted) },

  // Code block syntax (tree-sitter scopes)
  "keyword":            { fg: RGBA.fromHex(colors.keywordColor), bold: true },
  "keyword.function":   { fg: RGBA.fromHex(colors.keywordColor), bold: true },
  "keyword.return":     { fg: RGBA.fromHex(colors.keywordColor), bold: true },
  "keyword.operator":   { fg: RGBA.fromHex(colors.keywordColor) },
  "keyword.import":     { fg: RGBA.fromHex(colors.keywordColor), bold: true },

  "string":             { fg: RGBA.fromHex(colors.stringColor) },
  "string.special":     { fg: RGBA.fromHex(colors.stringColor) },
  "string.escape":      { fg: RGBA.fromHex(colors.orange) },

  "comment":            { fg: RGBA.fromHex(colors.commentColor), italic: true },
  "comment.documentation": { fg: RGBA.fromHex(colors.commentColor), italic: true },

  "number":             { fg: RGBA.fromHex(colors.numberColor) },
  "float":              { fg: RGBA.fromHex(colors.numberColor) },
  "integer":            { fg: RGBA.fromHex(colors.numberColor) },

  "type":               { fg: RGBA.fromHex(colors.typeColor) },
  "type.builtin":       { fg: RGBA.fromHex(colors.typeColor) },

  "function":           { fg: RGBA.fromHex(colors.funcColor) },
  "function.call":      { fg: RGBA.fromHex(colors.funcColor) },
  "function.method":    { fg: RGBA.fromHex(colors.funcColor) },
  "function.method.call": { fg: RGBA.fromHex(colors.funcColor) },
  "function.builtin":   { fg: RGBA.fromHex(colors.funcColor) },

  "variable":           { fg: RGBA.fromHex(colors.text) },
  "variable.builtin":   { fg: RGBA.fromHex(colors.red) },
  "variable.parameter": { fg: RGBA.fromHex(colors.orange) },

  "property":           { fg: RGBA.fromHex(colors.text) },
  "tag":                { fg: RGBA.fromHex(colors.red) },
  "attribute":          { fg: RGBA.fromHex(colors.orange) },

  "operator":           { fg: RGBA.fromHex(colors.opColor) },

  "constant":           { fg: RGBA.fromHex(colors.numberColor) },
  "constant.builtin":   { fg: RGBA.fromHex(colors.keywordColor) },
  "constant.null":      { fg: RGBA.fromHex(colors.keywordColor) },

  "module":             { fg: RGBA.fromHex(colors.text) },
  "namespace":          { fg: RGBA.fromHex(colors.text) },

  "constructor":        { fg: RGBA.fromHex(colors.funcColor) },

  "label":              { fg: RGBA.fromHex(colors.accent) },

  default:              { fg: RGBA.fromHex(colors.text) },
})
