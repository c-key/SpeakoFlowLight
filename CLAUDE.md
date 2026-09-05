# Working on SpeakoFlow Light

This repository is a fork of [SpeakoFlow](https://github.com/AbhishekBarali/SpeakoFlow)
that keeps dictation and drops the assistant. [FORK.md](FORK.md) is the
reference for what was removed and where code moved; read it before changing
anything that touches settings, cleanup, profiles or memory.

## Upstream changes: adopt by default

**Every upstream commit, fix and release is meant to land here** — bug fixes,
transcription improvements, dependency bumps, new languages, UI work. The only
exceptions are changes that exist to serve a feature this fork removed:

- the assistant panel and its chat, personas-as-chat-characters, voice replies
- Generate with Flow
- screen vision / screenshots
- text-to-speech, including the in-panel Kokoro player
- web search
- the updater (it pointed at upstream's releases)
- cloud cleanup providers and API keys — cleanup runs on this machine only
- upstream's README translations (`README.*.md`): `README.md` here is
  fork-specific, so a verbatim translation would describe the assistant, cloud
  providers and the updater to readers in their own language

Anything else is adopted. When a commit mixes both — a shared file where half
the change is for the assistant — take the part that applies here and leave the
rest. Do not "tidy up" by skipping an upstream change just because it is
inconvenient to merge; skipping is for removed features only.

### How to sync

```sh
scripts/sync-upstream.sh --check    # what is new upstream
scripts/sync-upstream.sh            # fetch, fast-forward the mirror, merge
```

The script resolves conflicts on removed files by keeping them deleted
(`scripts/fork-removed-paths.txt` is the list), then runs
`scripts/check-fork-invariants.sh`. Everything else is a decision to make by
hand — FORK.md documents what this fork changed in each shared file.

A clean merge is not proof of a correct one: upstream can add a *new* file for
a removed feature, re-add a dependency, or put a cloud provider back without
conflicting with anything. That is what the invariant check is for, and why it
runs on every sync.

Then, before pushing:

```sh
bun install && bun run lint
./node_modules/.bin/tsc --noEmit
cd src-tauri && cargo fmt --check && cargo check && cargo test
```

If any Tauri command signature changed, start the app once (`bun tauri dev`) so
tauri-specta regenerates `src/bindings.ts`, then commit that file. **Never edit
`src/bindings.ts` by hand** — it is generated, and hand-editing it has already
broken the build once.

## Invariants

`scripts/check-fork-invariants.sh` enforces these; keep them true:

- No file from `scripts/fork-removed-paths.txt` comes back.
- No dependency that only a removed feature needed
  (`tauri-plugin-updater`, `xcap`, `tauri-nspanel`).
- No `mod assistant/flow/screenshot/tts/web_search/speech_stream` in `lib.rs`.
- No updater: not in `tauri.conf.json`, not in the capabilities, not imported.
- **Local only.** Every cleanup provider points at this machine. Model
  downloads from Hugging Face are the one thing that may leave it; nothing
  else, and no telemetry or update check.
- Identity stays `speakoflow.light` (bundle identifier and keychain service),
  so this build never shares a data directory or credentials with upstream's.

## Working notes

- Settings that were renamed keep `#[serde(alias = "assistant_…")]`, so an
  existing `settings.json` still loads. Do not drop those aliases.
- The migration list in `managers/history.rs` still creates the unused
  `assistant_history` table. A `rusqlite_migration` list must never shrink.
- `llm_client.rs` carries a file-level `#![allow(dead_code)]`: its streaming
  and tool-calling half has no caller here, but upstream develops that file
  actively and deleting the unused half would make every merge of it conflict.
- Text, not just keys: when a feature goes, the strings that describe it have to
  change too. New and reworded strings are written in English and German; other
  locales lose the key and fall back to English.
  `bun scripts/check-translations.ts` lists the gaps.
- On Windows, `scripts/dev-env.win.bat cargo <args>` sets up a working MSVC,
  cmake, libclang, Vulkan and Ninja environment. BUILD.md explains the two
  traps (cmake picking an incomplete Visual Studio, and MAX_PATH inside ggml's
  nested `vulkan-shaders-gen` build reported as `C1041`).
- Commit messages are in English, like upstream's. Say why, not just what.
