#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  openchat uninstall
#
#  Usage:
#    openchat uninstall          (invoked via the binary — preferred)
#    bash scripts/uninstall.sh   (standalone)
#
#  Env vars (set automatically when invoked via binary):
#    OPENCHAT_BIN       path to the installed binary
#    OPENCHAT_VERSION   current version string
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BLUE=$'\033[38;2;88;166;255m'
GREEN=$'\033[32m'
RED=$'\033[31m'
YELLOW=$'\033[33m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
RESET=$'\033[0m'

print_header() {
  printf '\n'
  printf '%s' "$BLUE"
  printf '  ⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿\n'
  printf '  ⠀⢸⣿⣿⣿⠿⠿⠿⠿⠿⠿⠃\n'
  printf '  ⠀⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀\n'
  printf '  ⣾⣿⣿⣿⣿⣿⣿⣿⠏⠀⠀⠀\n'
  printf '  ⠿⠿⠿⠿⠿⣿⣿⠏⠀⠀⠀⠀\n'
  printf '  ⠀⠀⠀⠀⢀⣿⠏⠀⠀⠀⠀⠀\n'
  printf '  ⠀⠀⠀⠀⣼⡏⠀⠀⠀⠀⠀⠀\n'
  printf '%s\n' "$RESET"
}

main() {
  print_header
  printf '%s%s  openchat uninstall%s\n\n' "$BOLD" "$BLUE" "$RESET"

  # ── Resolve paths ───────────────────────────────────────────────────────────
  local binary="${OPENCHAT_BIN:-}"
  if [ -z "$binary" ]; then
    binary=$(command -v openchat 2>/dev/null || true)
  fi

  local config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/openchat"
  local data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/openchat"

  # ── Show what will be removed ───────────────────────────────────────────────
  printf '  The following will be %spermanently deleted%s:\n\n' "$BOLD" "$RESET"

  local has_anything=false

  if [ -n "$binary" ] && [ -f "$binary" ]; then
    printf '    %s%s%s\n' "$BOLD" "$binary" "$RESET"
    has_anything=true
  fi

  if [ -d "$config_dir" ]; then
    printf '    %s%s/%s\n' "$BOLD" "$config_dir" "$RESET"
    printf '    %s  config.yaml, persona prompts%s\n' "$DIM" "$RESET"
    has_anything=true
  fi

  if [ -d "$data_dir" ]; then
    printf '    %s%s/%s\n' "$BOLD" "$data_dir" "$RESET"
    local auth_path="${data_dir}/auth.json"
    if [ -f "$auth_path" ]; then
      printf '    %s%s⚠  auth.json contains your API keys — this cannot be undone%s\n' "$YELLOW" "$BOLD" "$RESET"
    fi
    printf '    %s  tree-sitter worker cache%s\n' "$DIM" "$RESET"
    has_anything=true
  fi

  if [ "$has_anything" = false ]; then
    printf '    %sNothing to remove — openchat does not appear to be installed.%s\n' "$DIM" "$RESET"
    exit 0
  fi

  printf '\n'

  # ── Confirm ─────────────────────────────────────────────────────────────────
  printf '  %s%sThis action is irreversible.%s\n\n' "$YELLOW" "$BOLD" "$RESET"
  printf '  Proceed? [y/N] '

  local answer
  # Read from /dev/tty so it works even when stdin is redirected
  read -r answer </dev/tty 2>/dev/null || read -r answer || answer='n'
  printf '\n'

  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *)
      printf '  Cancelled. Nothing was removed.\n'
      exit 0 ;;
  esac

  # ── Remove ──────────────────────────────────────────────────────────────────
  local removed=()
  local failed=()

  if [ -n "$binary" ] && [ -f "$binary" ]; then
    if rm -f "$binary" 2>/dev/null; then
      removed+=("$binary")
    else
      failed+=("$binary")
    fi
  fi

  if [ -d "$config_dir" ]; then
    if rm -rf "$config_dir" 2>/dev/null; then
      removed+=("${config_dir}/")
    else
      failed+=("${config_dir}/")
    fi
  fi

  if [ -d "$data_dir" ]; then
    if rm -rf "$data_dir" 2>/dev/null; then
      removed+=("${data_dir}/")
    else
      failed+=("${data_dir}/")
    fi
  fi

  # ── Report ──────────────────────────────────────────────────────────────────
  if [ ${#removed[@]} -gt 0 ]; then
    printf '  %sRemoved:%s\n' "$GREEN" "$RESET"
    for p in "${removed[@]}"; do
      printf '    %s✓%s  %s\n' "$GREEN" "$RESET" "$p"
    done
  fi

  if [ ${#failed[@]} -gt 0 ]; then
    printf '\n  %sCould not remove (check permissions):%s\n' "$RED" "$RESET"
    for p in "${failed[@]}"; do
      printf '    %s✗%s  %s\n' "$RED" "$RESET" "$p"
    done
    exit 1
  fi

  printf '\n  %s%sopenchat has been removed.%s\n' "$BOLD" "$BLUE" "$RESET"
}

main "$@"
