#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  openchat update
#
#  Usage:
#    openchat update          (invoked via the binary — preferred)
#    bash scripts/update.sh   (standalone)
#
#  Env vars (set automatically when invoked via binary):
#    OPENCHAT_BIN       path to the installed binary
#    OPENCHAT_VERSION   current version string (without "v")
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="iamramizk/openchat"

BLUE=$'\033[38;2;88;166;255m'
GREEN=$'\033[32m'
RED=$'\033[31m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

print_header() {
  printf '%s' "$BLUE"
  printf '⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿\n'
  printf '⠀⢸⣿⣿⣿⠿⠿⠿⠿⠿⠿⠃\n'
  printf '⠀⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀\n'
  printf '⣾⣿⣿⣿⣿⣿⣿⣿⠏⠀⠀⠀\n'
  printf '⠿⠿⠿⠿⠿⣿⣿⠏⠀⠀⠀⠀\n'
  printf '⠀⠀⠀⠀⢀⣿⠏⠀⠀⠀⠀⠀\n'
  printf '⠀⠀⠀⠀⣼⡏⠀⠀⠀⠀⠀⠀\n'
  printf '%s\n' "$RESET"
}

detect_os() {
  case "$(uname -s)" in
    Darwin) printf 'darwin' ;;
    Linux)  printf 'linux' ;;
    MINGW*|MSYS*|CYGWIN*)
      printf '%sError:%s Windows is not supported. Please use WSL.\n' "$RED" "$RESET" >&2
      exit 1 ;;
    *)
      printf '%sError:%s Unsupported OS: %s\n' "$RED" "$RESET" "$(uname -s)" >&2
      exit 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64)        printf 'x64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *)
      printf '%sError:%s Unsupported architecture: %s\n' "$RED" "$RESET" "$(uname -m)" >&2
      exit 1 ;;
  esac
}

sha256_of() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    printf ''
  fi
}

main() {
  print_header
  printf '%s%s  openchat update%s\n\n' "$BOLD" "$BLUE" "$RESET"

  # ── Resolve binary path ─────────────────────────────────────────────────────
  local binary="${OPENCHAT_BIN:-}"
  if [ -z "$binary" ]; then
    binary=$(command -v openchat 2>/dev/null || true)
  fi
  if [ -z "$binary" ]; then
    printf '%sError:%s Cannot find openchat binary.\n' "$RED" "$RESET" >&2
    printf 'Set %sOPENCHAT_BIN%s or add openchat to your PATH.\n' "$BOLD" "$RESET" >&2
    exit 1
  fi

  # ── Resolve current version ─────────────────────────────────────────────────
  local current="${OPENCHAT_VERSION:-}"
  if [ -z "$current" ]; then
    current=$("$binary" --version 2>/dev/null || true)
  fi
  if [ -z "$current" ]; then
    printf '%sError:%s Cannot determine current version.\n' "$RED" "$RESET" >&2
    exit 1
  fi
  current="${current#v}" # strip leading 'v' if present

  printf '  Current version:  v%s\n' "$current"
  printf '  Checking GitHub for latest release...\n\n'

  # ── Fetch latest tag ────────────────────────────────────────────────────────
  local api_json latest_tag
  api_json=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest") || {
    printf '%sError:%s Could not reach GitHub API.\n' "$RED" "$RESET" >&2
    exit 1
  }
  latest_tag=$(printf '%s' "$api_json" \
    | grep -o '"tag_name": *"[^"]*"' \
    | head -1 \
    | grep -o 'v[0-9][^"]*' || true)

  if [ -z "$latest_tag" ]; then
    printf '%sError:%s Could not parse latest release tag.\n' "$RED" "$RESET" >&2
    printf 'Check: https://github.com/%s/releases\n' "$REPO" >&2
    exit 1
  fi

  local latest="${latest_tag#v}"

  if [ "$current" = "$latest" ]; then
    printf '  %s✓%s  Already up to date %s(v%s)%s\n' "$GREEN" "$RESET" "$BOLD" "$current" "$RESET"
    exit 0
  fi

  printf '  Update available:  v%s  →  %sv%s%s\n\n' "$current" "$BOLD" "$latest" "$RESET"

  # ── Download new binary ─────────────────────────────────────────────────────
  local os arch platform
  os=$(detect_os)
  arch=$(detect_arch)
  platform="${os}-${arch}"
  local asset="openchat-${platform}"
  local base_url="https://github.com/${REPO}/releases/download/${latest_tag}"

  local tmpdir
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  printf '  Downloading %s...\n' "$asset"
  if ! curl -fSL --progress-bar "${base_url}/${asset}" -o "${tmpdir}/${asset}" 2>&1; then
    printf '\n%sError:%s Download failed.\n' "$RED" "$RESET" >&2
    exit 1
  fi

  # ── Checksum ────────────────────────────────────────────────────────────────
  if curl -fsSL "${base_url}/checksums.txt" -o "${tmpdir}/checksums.txt" 2>/dev/null; then
    local expected
    expected=$(grep "${asset}" "${tmpdir}/checksums.txt" | awk '{print $1}' || true)
    if [ -n "$expected" ]; then
      local actual
      actual=$(sha256_of "${tmpdir}/${asset}")
      if [ -n "$actual" ] && [ "$actual" != "$expected" ]; then
        printf '%sError:%s SHA256 mismatch — download may be corrupt.\n' "$RED" "$RESET" >&2
        exit 1
      fi
      [ -n "$actual" ] && printf '  %s✓%s  Checksum verified\n' "$GREEN" "$RESET"
    fi
  fi

  chmod +x "${tmpdir}/${asset}"

  # ── Atomic replace ──────────────────────────────────────────────────────────
  # cp + mv is atomic on the same filesystem (Unix); safe to replace a running binary
  local tmpbin="${binary}.update.$$"
  if ! cp "${tmpdir}/${asset}" "$tmpbin" || ! mv "$tmpbin" "$binary"; then
    rm -f "$tmpbin" 2>/dev/null || true
    printf '%sError:%s Could not replace binary at %s\n' "$RED" "$RESET" "$binary" >&2
    printf 'Check file ownership / permissions.\n' >&2
    exit 1
  fi

  printf '\n  %s%sopenchat updated: v%s → v%s%s\n' "$GREEN" "$BOLD" "$current" "$latest" "$RESET"
}

main "$@"
