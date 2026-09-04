#!/usr/bin/env bash
#
# Fail if a feature this fork removed has come back.
#
# Run it after every upstream merge — scripts/sync-upstream.sh does that for
# you — and before pushing. An upstream commit that touches the assistant,
# Flow, screen vision, TTS, web search, the updater, or the cloud cleanup
# providers is the one kind this fork does not want, and a clean `git merge` is
# perfectly capable of bringing one back without a conflict.
#
# Usage:
#   scripts/check-fork-invariants.sh
#
# Exit status: 0 if the fork still looks like itself, 1 otherwise.
set -uo pipefail

cd "$(dirname "$0")/.."

REMOVED_LIST="scripts/fork-removed-paths.txt"
failures=0
warnings=0

fail() {
  printf '\033[31mFAIL\033[0m %s\n' "$1"
  failures=$((failures + 1))
}
warn() {
  printf '\033[33mWARN\033[0m %s\n' "$1"
  warnings=$((warnings + 1))
}
pass() { printf '\033[32m  ok\033[0m %s\n' "$1"; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf 'error: not a git repository\n' >&2
  exit 1
fi

# ---------------------------------------------------------------- removed files

if [ ! -f "$REMOVED_LIST" ]; then
  fail "$REMOVED_LIST is missing — the list of removed paths is the whole point"
else
  tracked=$(git ls-files)
  resurrected=""
  while IFS= read -r pattern; do
    pattern="${pattern%%#*}"
    pattern="$(printf '%s' "$pattern" | tr -d '\r' | sed 's/[[:space:]]*$//')"
    [ -z "$pattern" ] && continue
    while IFS= read -r path; do
      [ -z "$path" ] && continue
      case "$pattern" in
        */)
          case "$path" in "$pattern"*) resurrected="$resurrected$path"$'\n' ;; esac
          ;;
        *)
          # shellcheck disable=SC2053 # deliberate glob match, not a comparison
          [[ $path == $pattern ]] && resurrected="$resurrected$path"$'\n'
          ;;
      esac
    done <<<"$tracked"
  done <"$REMOVED_LIST"

  if [ -n "$resurrected" ]; then
    fail "removed files are back in the index:"
    printf '%s' "$resurrected" | sed 's/^/       /'
    printf '       keep them deleted: git rm <path>\n'
  else
    pass "no removed file has come back"
  fi
fi

# ----------------------------------------------------------------- dependencies

# Crates that only the removed features needed. tauri-nspanel is the macOS
# floating panel; xcap is screen capture.
for crate in tauri-plugin-updater xcap tauri-nspanel; do
  if grep -q "^$crate " src-tauri/Cargo.toml 2>/dev/null; then
    fail "src-tauri/Cargo.toml depends on '$crate' again"
  fi
done
[ "$failures" -eq 0 ] && pass "no dependency of a removed feature"

# ----------------------------------------------------------------------- modules

for module in assistant flow screenshot tts web_search speech_stream; do
  if grep -qE "^(pub )?mod $module;" src-tauri/src/lib.rs 2>/dev/null; then
    fail "src-tauri/src/lib.rs declares 'mod $module' again"
  fi
done
if grep -q "create_assistant_panel\|AssistantConversation" src-tauri/src/lib.rs 2>/dev/null; then
  fail "src-tauri/src/lib.rs builds the assistant panel again"
fi

# ------------------------------------------------------------------- the updater

if grep -q '"updater"\|createUpdaterArtifacts' src-tauri/tauri.conf.json 2>/dev/null; then
  fail "src-tauri/tauri.conf.json configures the updater again"
fi
if grep -rq "plugin-updater" src src-tauri/src 2>/dev/null; then
  fail "the updater plugin is referenced again (grep for plugin-updater)"
fi
if grep -rq "updater:" src-tauri/capabilities 2>/dev/null; then
  fail "src-tauri/capabilities grants an updater permission again"
fi

# ------------------------------------------------------------------- local-only

# The one invariant worth stating in code: no provider the picker offers may
# point off this machine. Apple Intelligence uses an apple-intelligence:// URL;
# every other default is loopback.
# The test module is skipped on purpose: one test builds an OpenAI provider to
# prove that loading drops it again.
non_local=$(sed '/#\[cfg(test)\]/,$d' src-tauri/src/settings.rs |
  grep -n 'base_url: "https\?://' |
  grep -v "127.0.0.1\|localhost" || true)
if [ -n "$non_local" ]; then
  fail "src-tauri/src/settings.rs has a non-local provider base_url:"
  printf '%s\n' "$non_local" | sed 's/^/       /'
fi

# The app's own identity, so an upstream change to either does not silently make
# this build share its data directory and keychain entries with the original.
if ! grep -q '"identifier": "speakoflow.light"' src-tauri/tauri.conf.json 2>/dev/null; then
  fail "src-tauri/tauri.conf.json no longer uses the identifier speakoflow.light"
fi
if ! grep -q 'SERVICE: &str = "speakoflow.light"' src-tauri/src/secret_store.rs 2>/dev/null; then
  fail "src-tauri/src/secret_store.rs no longer uses the keychain service speakoflow.light"
fi

# ------------------------------------------------------- new suspicious sources

# A merge can also add *new* files for a removed feature, which no path list can
# anticipate. This is a warning, not a failure: "assistant" appears in innocent
# places too, so it needs a human to look.
if git rev-parse --verify --quiet upstream-mirror >/dev/null; then
  suspicious=$(git diff --diff-filter=A --name-only upstream-mirror HEAD 2>/dev/null |
    grep -iE "assistant|screenshot|web_search|/tts|speech_stream|updater|panel" || true)
  if [ -n "$suspicious" ]; then
    warn "files whose names suggest a removed feature:"
    printf '%s\n' "$suspicious" | sed 's/^/       /'
  fi
fi

# ------------------------------------------------------------------------ result

printf '\n'
if [ "$failures" -gt 0 ]; then
  printf '\033[31m%s check(s) failed\033[0m — see FORK.md for what this fork removed.\n' "$failures"
  exit 1
fi
if [ "$warnings" -gt 0 ]; then
  printf '\033[33mAll checks passed with %s warning(s).\033[0m\n' "$warnings"
  exit 0
fi
printf '\033[32mAll fork invariants hold.\033[0m\n'
