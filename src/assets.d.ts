// Type declarations for file types imported with `with { type: "text" }` or `{ type: "file" }`.
// Bun's bundler and `bun run` both resolve these as string at runtime.
// The `*.yaml` type is already covered by bun-types; `.md` and `.wasm` are not.

/** `with { type: "text" }` — returns the file contents as a string. */
declare module "*.md" {
  const content: string
  export default content
}

/**
 * `with { type: "file" }` — returns the path to the file.
 * In `bun run`: absolute filesystem path.
 * In `bun build --compile`: bunfs path (accessible via readFileSync in all threads).
 */
declare module "*.wasm" {
  const path: string
  export default path
}

/** `with { type: "text" }` — returns a pre-built JS bundle as a string. */
declare module "*.js" {
  const content: string
  export default content
}
