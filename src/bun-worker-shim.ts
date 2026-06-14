// Bun workers don't expose globalThis.close, but opentui's isGlobalWorkerRuntime()
// requires it to detect the worker context. This shim defines it, then lazily imports
// the real parser worker so that detection runs after the polyfill is in place.
import * as wt from "node:worker_threads"

if (!("close" in globalThis) && wt.parentPort) {
  ;(globalThis as any).close = () => process.exit(0)
}

await import("@opentui/core/parser.worker")
