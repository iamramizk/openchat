import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs"
import { join } from "path"
import { promptsDir, configDir } from "./paths.ts"
import { BUNDLED_PROMPTS } from "./bundled-assets.ts"
import { PROMPT_HASH_HISTORY, hashPrompt } from "./prompt-hashes.ts"

// ---------------------------------------------------------------------------
// Prompt reconciliation — brings a user's ~/.config/openchat/prompts/ files
// onto the latest bundled defaults without clobbering edits.
//
// Classification per bundled filename:
//   - missing on disk        -> silently write the new default (covers brand
//                                new persona files added in a later release)
//   - hash matches current   -> already up to date, skip
//   - hash matches a PAST    -> "unedited": user never touched this file,
//     default (PROMPT_HASH_       safe to overwrite with the new default
//     HISTORY)
//   - anything else          -> "edited": ask before touching it
//
// Run once per version — a `.prompts_version` marker in configDir() makes
// repeat invocations (e.g. `update.sh` calling this, then a user manually
// running it again) a no-op.
// ---------------------------------------------------------------------------

function versionMarkerPath(): string {
  return join(configDir(), ".prompts_version")
}

export interface ReconcileResult {
  /** Bundled filenames that were unedited and silently updated to the new default. */
  updated: string[]
  /** Bundled filenames the user had edited (only set if a decision was needed). */
  edited: string[]
  /** True if edited files were backed up and replaced (user said yes). */
  backedUp: boolean
  /** True if this call was a no-op because the version marker already matched. */
  skipped: boolean
}

export interface ReconcileOptions {
  /** Current app version — written to the marker file and used for the backup subfolder name. */
  version: string
  /** Ask the user a single combined yes/no question covering all edited files. Resolve true = back up + replace. */
  confirmReplace: (editedFiles: string[]) => Promise<boolean>
  /** Report progress to the user. Defaults to a margin-indented console.log. */
  report?: (message: string) => void
}

export async function reconcilePrompts(opts: ReconcileOptions): Promise<ReconcileResult> {
  const { version, confirmReplace, report = (m: string) => console.log(`  ${m}`) } = opts

  const marker = versionMarkerPath()
  if (existsSync(marker) && readFileSync(marker, "utf-8").trim() === version) {
    return { updated: [], edited: [], backedUp: false, skipped: true }
  }

  const dir = promptsDir()
  mkdirSync(dir, { recursive: true })

  const updated: string[] = []
  const edited: string[] = []

  for (const [filename, defaultContent] of Object.entries(BUNDLED_PROMPTS)) {
    const diskPath = join(dir, filename)

    if (!existsSync(diskPath)) {
      writeFileSync(diskPath, defaultContent, "utf-8")
      continue
    }

    const diskHash = hashPrompt(readFileSync(diskPath, "utf-8"))
    const newHash = hashPrompt(defaultContent)
    if (diskHash === newHash) continue

    const history = PROMPT_HASH_HISTORY[filename] ?? []
    if (history.includes(diskHash)) {
      writeFileSync(diskPath, defaultContent, "utf-8")
      updated.push(filename)
    } else {
      edited.push(filename)
    }
  }

  let backedUp = false
  if (edited.length > 0) {
    report(`Updates to these personas are available: ${edited.join(", ")}`)
    const shouldReplace = await confirmReplace(edited)

    if (shouldReplace) {
      const backupDir = join(dir, "backup", `v${version}`)
      mkdirSync(backupDir, { recursive: true })
      for (const filename of edited) {
        renameSync(join(dir, filename), join(backupDir, filename))
        writeFileSync(join(dir, filename), BUNDLED_PROMPTS[filename], "utf-8")
      }
      backedUp = true
      report(`Backed up to ${backupDir}`)
    } else {
      const newDir = join(dir, "new")
      mkdirSync(newDir, { recursive: true })
      for (const filename of edited) {
        writeFileSync(join(newDir, filename), BUNDLED_PROMPTS[filename], "utf-8")
      }
      report(`New defaults saved to ${newDir} for review`)
    }
  }

  mkdirSync(configDir(), { recursive: true })
  writeFileSync(marker, version, "utf-8")

  return { updated, edited, backedUp, skipped: false }
}
