#!/usr/bin/env bash
#
# Pull new upstream commits into this fork.
#
# Two branches (see FORK.md):
#   upstream-mirror — an untouched mirror of upstream/main. Never commit here.
#   main            — this fork.
#
# The mirror exists so `git merge` on main always has a clean, linear base to
# merge from, and so `git log upstream-mirror..main` stays an honest list of
# what this fork actually changed.
#
# Usage:
#   scripts/sync-upstream.sh              # fetch, fast-forward the mirror, merge into main
#   scripts/sync-upstream.sh --check      # only report what is new upstream
set -euo pipefail

MIRROR="upstream-mirror"
FORK="main"
REMOTE="upstream"
REMOVED_LIST="$(dirname "$0")/fork-removed-paths.txt"
INVARIANTS="$(dirname "$0")/check-fork-invariants.sh"

die() {
  printf '\033[31merror:\033[0m %s\n' "$1" >&2
  exit 1
}
note() { printf '\033[34m==>\033[0m %s\n' "$1"; }

git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository"
git remote get-url "$REMOTE" >/dev/null 2>&1 ||
  die "no '$REMOTE' remote. Add it: git remote add $REMOTE https://github.com/AbhishekBarali/SpeakoFlow.git"
git show-ref --verify --quiet "refs/heads/$MIRROR" ||
  die "branch '$MIRROR' is missing. Recreate it at the last upstream commit this fork merged."

note "Fetching $REMOTE"
git fetch "$REMOTE"

behind=$(git rev-list --count "$MIRROR..$REMOTE/main")
if [ "$behind" -eq 0 ]; then
  note "Already up to date with $REMOTE/main."
  exit 0
fi

note "$behind new upstream commit(s):"
git --no-pager log --oneline --no-decorate "$MIRROR..$REMOTE/main" | sed 's/^/    /'

if [ "${1:-}" = "--check" ]; then
  exit 0
fi

# Refuse to merge on top of uncommitted work: a conflicted merge mixed with
# unrelated local edits is painful to unpick.
if ! git diff-index --quiet HEAD -- || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  die "working tree is not clean. Commit or stash first."
fi

start_branch=$(git rev-parse --abbrev-ref HEAD)

note "Fast-forwarding $MIRROR"
git checkout --quiet "$MIRROR"
# --ff-only on purpose: the mirror must stay byte-identical to upstream. If this
# fails, something has been committed to the mirror and needs sorting out first.
git merge --ff-only "$REMOTE/main"

# Is this path one of the removed ones (scripts/fork-removed-paths.txt)?
is_removed_path() {
  local path="$1" pattern
  [ -f "$REMOVED_LIST" ] || return 1
  while IFS= read -r pattern; do
    pattern="${pattern%%#*}"
    pattern="$(printf '%s' "$pattern" | tr -d '\r' | sed 's/[[:space:]]*$//')"
    [ -z "$pattern" ] && continue
    case "$pattern" in
      */) case "$path" in "$pattern"*) return 0 ;; esac ;;
      # shellcheck disable=SC2053 # deliberate glob match, not a comparison
      *) [[ $path == $pattern ]] && return 0 ;;
    esac
  done <"$REMOVED_LIST"
  return 1
}

# Upstream touching a file this fork deleted is the one conflict with a known
# answer: keep it deleted. Resolving those automatically is what keeps routine
# syncs routine — whatever is left afterwards is a real decision.
resolve_removed_paths() {
  local resolved="" path
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    if is_removed_path "$path"; then
      git rm --quiet --force -- "$path" >/dev/null 2>&1 || true
      resolved="$resolved$path"$'\n'
    fi
  done < <(git diff --name-only --diff-filter=U)

  if [ -n "$resolved" ]; then
    note "Kept deleted (they belong to removed features):"
    printf '%s' "$resolved" | sed 's/^/    /'
  fi
  [ -z "$(git diff --name-only --diff-filter=U)" ]
}

note "Merging $MIRROR into $FORK"
git checkout --quiet "$FORK"
if git merge --no-edit "$MIRROR"; then
  note "Merged cleanly."
elif resolve_removed_paths; then
  git commit --no-edit --quiet
  note "Merged. Every conflict was a file this fork had removed."
else
  cat <<'HINT'

The merge stopped on conflicts. The usual ones:

  * "deleted by us" / modify-delete on a file this fork removed
    (assistant.rs, flow.rs, screenshot.rs, tts.rs, web_search.rs,
     speech_stream.rs, src/assistant/**) — keep it deleted:

        git rm <path>

  * A file this fork edited (settings.rs, actions.rs, lib.rs, shortcut/*,
    memory.rs, Sidebar.tsx, the locale files) — merge by hand. FORK.md lists
    what this fork changed in each of them.

A conflict inside the removed half of a shared file means upstream extended a
feature this fork dropped: take neither side.

Then:
        git commit
        scripts/check-fork-invariants.sh
        bun install && bun run lint && bun test src
        cd src-tauri && cargo check && cargo test

HINT
  exit 1
fi

# A clean merge is not the same as a correct one: upstream can add a file for a
# removed feature, re-add a dependency, or put a cloud provider back, all
# without conflicting with anything.
note "Checking fork invariants"
if ! bash "$INVARIANTS"; then
  printf '\n'
  die "the merge brought back something this fork removed — fix it before pushing (the merge itself is committed; 'git revert -m 1 HEAD' undoes it)"
fi

if [ "$start_branch" != "$FORK" ]; then
  note "You were on '$start_branch' — switch back with: git checkout $start_branch"
fi

cat <<'NEXT'

Verify before pushing:
    bun install
    bun run lint && bun test src
    cd src-tauri && cargo check && cargo test

If any command signature changed, run the app once (bun tauri dev) so
tauri-specta regenerates src/bindings.ts, then commit it.

Upstream release notes are worth a read after a sync: a new feature that only
makes sense with the assistant, TTS, web search, screen vision or the updater
is one this fork skips. FORK.md says why.
NEXT
