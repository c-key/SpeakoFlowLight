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

note "Merging $MIRROR into $FORK"
git checkout --quiet "$FORK"
if git merge --no-edit "$MIRROR"; then
  note "Merged cleanly."
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
        bun install && bun run lint && bun test src
        cd src-tauri && cargo check && cargo test

HINT
  exit 1
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
NEXT
