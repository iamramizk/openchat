#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  openchat installer
#
#  Usage (one-liner):
#    curl -fsSL https://raw.githubusercontent.com/iamramizk/openchat/main/scripts/install.sh | bash
#
#  Options (env vars):
#    OPENCHAT_INSTALL_DIR   override install directory (default: ~/.local/bin)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="iamramizk/openchat"
INSTALL_DIR="${OPENCHAT_INSTALL_DIR:-$HOME/.local/bin}"

# Colours (truecolor #58A6FF with 256-colour fallback in comments)
BLUE=$'\033[38;2;88;166;255m'  # approx 256-colour: 75
GREEN=$'\033[32m'
RED=$'\033[31m'
YELLOW=$'\033[33m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
RESET=$'\033[0m'
tmpdir=""

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

detect_os() {
  case "$(uname -s)" in
    Darwin) printf 'darwin' ;;
    Linux)  printf 'linux' ;;
    MINGW*|MSYS*|CYGWIN*)
      printf '%sError:%s Windows is not natively supported.\n' "$RED" "$RESET" >&2
      printf 'Please use WSL (Windows Subsystem for Linux) instead.\n' >&2
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
    printf '' # no tool — caller handles the empty string
  fi
}

# Prints $1 repeated $2 times. Used to build the progress bar below without
# `tr`, which maps SET1->SET2 byte-by-byte — a single-byte space mapped to a
# multibyte char like █ (3 bytes in UTF-8) truncates to its first byte, which
# renders as "?" under non-UTF-8 `tr` implementations/locales.
repeat_char() {
  local s="$1" n="$2" out='' i
  for (( i = 0; i < n; i++ )); do out+="$s"; done
  printf '%s' "$out"
}

# Downloads $1 to $2, drawing an indented, coloured progress bar (matching the
# script's other status lines) instead of curl's bare, unindented one. Falls
# back to a plain download with no bar if the content-length can't be
# determined up front (e.g. chunked responses). $3 is the label shown to the
# user. Returns curl's own exit status.
download_with_progress() {
  local url="$1" dest="$2" label="$3"
  local total
  total=$(curl -fsSIL "$url" 2>/dev/null | grep -i '^content-length:' | tail -1 | awk '{print $2}' | tr -d '\r\n') || true

  printf '  Downloading %s...\n' "$label"

  if ! [[ "$total" =~ ^[0-9]+$ ]] || [ "$total" -le 0 ]; then
    curl -fSsL "$url" -o "$dest"
    return $?
  fi

  curl -fSsL "$url" -o "$dest" &
  local pid=$!

  local width=28

  while kill -0 "$pid" 2>/dev/null; do
    local size pct filled empty
    if [ -f "$dest" ]; then
      size=$(wc -c < "$dest" 2>/dev/null || printf '0')
    else
      size=0
    fi
    size=${size//[[:space:]]/}
    [ -z "$size" ] && size=0
    pct=$(( size * 100 / total ))
    [ "$pct" -gt 100 ] && pct=100
    filled=$(( pct * width / 100 ))
    empty=$(( width - filled ))
    printf '\r  [%s%s%s%s]  %3d%%' "$BLUE" "$(repeat_char '█' "$filled")" "$RESET" "$(repeat_char '░' "$empty")" "$pct"
    sleep 0.1
  done

  wait "$pid"
  local status=$?

  if [ "$status" -eq 0 ]; then
    printf '\r  [%s%s%s]  100%%\n' "$BLUE" "$(repeat_char '█' "$width")" "$RESET"
    printf '  %s✓%s  Downloaded %s\n' "$GREEN" "$RESET" "$label"
  else
    printf '\n'
  fi
  return "$status"
}

main() {
  print_header
  printf '%s%s  openchat installer%s\n\n' "$BOLD" "$BLUE" "$RESET"

  local os arch platform
  os=$(detect_os)
  arch=$(detect_arch)
  platform="${os}-${arch}"
  local asset="openchat-${platform}"
  local base_url="https://github.com/${REPO}/releases/latest/download"

  printf '  Platform:    %s\n' "$platform"
  printf '  Install dir: %s\n\n' "$INSTALL_DIR"

  # ── Download ────────────────────────────────────────────────────────────────
  tmpdir=$(mktemp -d)
  trap 'rm -rf "${tmpdir:-}"' EXIT

  if ! download_with_progress "${base_url}/${asset}" "${tmpdir}/${asset}" "$asset"; then
    printf '\n%sError:%s Download failed. Does a release exist for %s?\n' "$RED" "$RESET" "$platform" >&2
    printf 'Browse releases: https://github.com/%s/releases\n' "$REPO" >&2
    exit 1
  fi

  # ── Checksum ────────────────────────────────────────────────────────────────
  if curl -fsSL "${base_url}/checksums.txt" -o "${tmpdir}/checksums.txt" 2>/dev/null; then
    local expected
    expected=$(grep "${asset}" "${tmpdir}/checksums.txt" | awk '{print $1}' || true)
    if [ -n "$expected" ]; then
      local actual
      actual=$(sha256_of "${tmpdir}/${asset}")
      if [ -n "$actual" ]; then
        if [ "$actual" != "$expected" ]; then
          printf '%sError:%s SHA256 mismatch — download may be corrupt.\n' "$RED" "$RESET" >&2
          printf '  expected: %s\n' "$expected" >&2
          printf '  got:      %s\n' "$actual" >&2
          exit 1
        fi
        printf '  %s✓%s  Checksum verified\n' "$GREEN" "$RESET"
      else
        printf '  %s⚠%s  No SHA256 tool found — skipping checksum verification\n' "$YELLOW" "$RESET"
      fi
    else
      printf '  %s⚠%s  Asset not found in checksums.txt — skipping verification\n' "$YELLOW" "$RESET"
    fi
  else
    printf '  %s⚠%s  Could not fetch checksums.txt — skipping verification\n' "$YELLOW" "$RESET"
  fi

  # ── Install ─────────────────────────────────────────────────────────────────
  chmod +x "${tmpdir}/${asset}"
  mkdir -p "$INSTALL_DIR"

  if ! mv "${tmpdir}/${asset}" "${INSTALL_DIR}/openchat"; then
    printf '\n%sError:%s Could not install to %s.\n' "$RED" "$RESET" "$INSTALL_DIR" >&2
    printf 'Try: %sOPENCHAT_INSTALL_DIR=~/bin bash install.sh%s\n' "$BOLD" "$RESET" >&2
    exit 1
  fi

  printf '  %s✓%s  Installed to %s/openchat\n\n' "$GREEN" "$RESET" "$INSTALL_DIR"

  # ── PATH hint ───────────────────────────────────────────────────────────────
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      printf '  %s⚠%s  %s%s%s is not in your PATH.\n' "$YELLOW" "$RESET" "$BOLD" "$INSTALL_DIR" "$RESET"
      printf '     Add this to your shell profile (%s~/.zshrc%s or %s~/.bashrc%s):\n\n' "$DIM" "$RESET" "$DIM" "$RESET"
      printf "       %sexport PATH=\"%s:\$PATH\"%s\n\n" "$BOLD" "$INSTALL_DIR" "$RESET"
      printf '     Then reload your shell: %ssource ~/.zshrc%s\n\n' "$DIM" "$RESET"
      ;;
  esac

  # ── Done ────────────────────────────────────────────────────────────────────
  printf '%s%sInstalled successfully!%s\n' "$GREEN" "$BOLD" "$RESET"
  local ver
  if ver=$("${INSTALL_DIR}/openchat" --version 2>/dev/null); then
    printf '  Version: %s\n\n' "$ver"
  fi
  printf '  Run %sopenchat%s to start chatting.\n' "$BOLD" "$RESET"
  printf '  Use %s/connect%s to add your API key on first launch.\n' "$BOLD" "$RESET"
}

main "$@"
