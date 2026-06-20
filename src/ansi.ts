// ---------------------------------------------------------------------------
// Shared ANSI styling for plain-terminal output (--help, reconcile-prompts).
// Mirrors the palette used by scripts/install.sh, update.sh, uninstall.sh —
// keep the two in sync if the brand colour changes.
// ---------------------------------------------------------------------------

export const BLUE = "\x1b[38;2;88;166;255m"
export const GREEN = "\x1b[32m"
export const RED = "\x1b[31m"
export const YELLOW = "\x1b[33m"
export const BOLD = "\x1b[1m"
export const DIM = "\x1b[2m"
export const RESET = "\x1b[0m"

// Braille block logo — identical to print_header() in the shell scripts.
export const LOGO = `${BLUE}
  ⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
  ⠀⢸⣿⣿⣿⠿⠿⠿⠿⠿⠿⠃
  ⠀⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀
  ⣾⣿⣿⣿⣿⣿⣿⣿⠏⠀⠀⠀
  ⠿⠿⠿⠿⠿⣿⣿⠏⠀⠀⠀⠀
  ⠀⠀⠀⠀⢀⣿⠏⠀⠀⠀⠀⠀
  ⠀⠀⠀⠀⣼⡏⠀⠀⠀⠀⠀⠀
${RESET}`
