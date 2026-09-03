# SpeakoFlow Light — what this fork is, and how to keep it current

This is a fork of [SpeakoFlow](https://github.com/AbhishekBarali/SpeakoFlow)
with the assistant removed. It keeps dictation, transcription, translation, and
AI cleanup — and it keeps profiles and personal memory, re-pointed at AI cleanup
where they now do the useful work.

Everything runs on your machine. Nothing leaves the device except model
downloads.

## What was removed

| Removed | Why it's gone |
| --- | --- |
| **Assistant panel** | The floating chat window, its two hotkeys, its conversation history, and the whole `assistant`/`snip` webview. |
| **Generate with Flow** | The "Hey Flow" activation phrase and the one-shot generation path behind it. |
| **Screen vision** | Screen capture, the region-snip overlay, and every vision/screenshot setting. |
| **Spoken replies (TTS)** | Kokoro in the webview plus the OpenAI / ElevenLabs / Azure / OpenRouter remote engines. |
| **Web search** | The Serper / Brave / Tavily / Exa / SerpAPI / TinyFish backends. They only ever fed the assistant, and they are network calls. |
| **Cloud LLM providers for cleanup** | Still present in the settings model, but see *Local-only* below. |

## What was kept, and re-pointed

**Profiles** were assistant personas (name, avatar, system prompt, reply
length). Here a profile is one switch that carries a whole AI-cleanup setup:

- which cleanup prompt template to use,
- the tone,
- an extra instruction layer ("lay this out as a message body"),
- whether personal memory is injected.

Switching from "work email" to "quick chat message" is one choice instead of
three. Built-ins ship as **Default / Email / Chat / Notes**.

**Personal memory** was the assistant's long-term profile of you. It now feeds
AI cleanup: the relevant parts are injected into the cleanup prompt so the model
keeps your names, product terms, and phrasing instead of "correcting" them into
something else. Learning is off by default — memory holds only what you type in
Settings → Memory or ask for with "Learn from my dictations now". Distillation
reads your recent dictation history and runs on the cleanup model.

Both live under **Settings → Personalization**.

### Where the code went

| Upstream | Here |
| --- | --- |
| `src-tauri/src/assistant.rs`, `commands/assistant.rs`, `flow.rs`, `screenshot.rs`, `tts.rs`, `web_search.rs`, `speech_stream.rs` | deleted |
| `src/assistant/**` (panel webview) | deleted |
| `AssistantCharacter` | `Profile` (settings.rs), with `serde(alias)` on the stored fields |
| `settings.assistant_memory*` | `settings.memory*`, same aliases |
| `commands/assistant.rs` (persona half) | `commands/profiles.rs` |
| `screenshot.rs::image_file_to_avatar_data_url` | `avatar.rs` |
| `flow.rs::strip_reasoning_blocks` | `actions.rs` (its only caller was the cleanup sanitizer) |
| `settings/assistant/CharactersSettings.tsx` | `settings/profiles/ProfilesSettings.tsx` (rewritten for the new model) |
| `settings/assistant/MemorySettings.tsx` | `settings/profiles/MemorySettings.tsx` |
| `settings/assistant/LlmCatalog.tsx` | `settings/models/LlmCatalog.tsx`, cleanup role only |

An upgraded `settings.json` keeps its profiles and its memory: the renamed
fields carry `serde(alias = "assistant_…")`. Removed keys are ignored.

`llm_client.rs` is **deliberately kept whole**, carrying a file-level
`#![allow(dead_code)]`. Its SSE-streaming and tool-calling half has no caller
left here — AI cleanup and the memory distiller both want one complete answer —
but upstream develops that file actively, and deleting the unused half would
turn every merge of it into a conflict. The same reasoning keeps
`lock_watch.rs`' unused tap-to-lock parser, which upstream never wired up
either.

The `assistant_history` SQLite table is **deliberately still in the migration
list** and unused. A `rusqlite_migration` list must never shrink, or a database
created by an earlier version reports more applied migrations than the code
defines and refuses to open.

## Local-only

Nothing is sent anywhere except model downloads from Hugging Face. Web search
and remote TTS are gone entirely.

The cloud cleanup providers (OpenAI, Groq, Anthropic, …) are **still in the
settings model** — removing them would have meant rewriting the provider
resolver, which is the same code path the built-in local engine uses. They are
inert unless you enter an API key and select one. To be certain, keep the
cleanup provider on **On my device** (the built-in llama.cpp engine).

## Keeping up with upstream

Two branches:

- **`upstream-mirror`** — an untouched mirror of `upstream/main`. Never commit here.
- **`main`** — this fork.

```sh
scripts/sync-upstream.sh          # fetch + fast-forward the mirror, then merge into main
```

Or by hand:

```sh
git fetch upstream
git checkout upstream-mirror
git merge --ff-only upstream/main
git checkout main
git merge upstream-mirror
```

### Resolving the conflicts you will get

**A file this fork deleted was changed upstream** (`modify/delete`). This is the
common one, and it is almost always right to keep it deleted:

```sh
git rm src-tauri/src/assistant.rs      # or whichever file
```

Check the list in *What was removed* first — if upstream changed
`screenshot.rs`, that is a feature this fork does not have, and the change is
not wanted.

**A file this fork edited was also changed upstream.** Merge by hand. The
frequent ones, and what to watch for:

| File | What this fork changed |
| --- | --- |
| `settings.rs` | ~60 assistant/flow/TTS/search fields removed; `Profile` replaces `AssistantCharacter`; `memory*` renamed; `ensure_profile_defaults` replaces `ensure_assistant_defaults`; the resolver has no assistant fallback |
| `actions.rs` | `AssistantAction` + `AssistantPanelToggleAction` and the whole Flow arm removed; two new prompt layers (profile instructions, memory) in `build_post_process_request` |
| `lib.rs` | ~70 commands unregistered; no panel window; no raw-body invoke handler |
| `shortcut/*` | assistant hotkeys and their master-switch gates removed |
| `memory.rs` | distills from dictation history instead of a conversation; uses the cleanup provider |
| `src/components/Sidebar.tsx` | `assistant` section → `personalization` |
| `src/i18n/locales/*` | assistant/Flow/TTS/search keys removed; `characters.*` moved to `profiles.*`; `assistant.brain.*` moved to `cleanupModels.*` |

A conflict inside the *removed* half of one of those files is a signal that
upstream extended a feature this fork dropped — take neither side, just drop it.

### After a merge

```sh
bun install
bun run lint && bun test src
cd src-tauri && cargo check && cargo test
```

`src/bindings.ts` is generated by tauri-specta on every debug launch, so run the
app once (`bun tauri dev`) after touching a command signature and commit the
regenerated file.

## Known gaps

- **Translations.** The 19 non-English locales lost the strings for removed
  features and the strings whose meaning changed (memory, onboarding). New and
  reworded strings exist in English and German only; every other language falls
  back to English for those keys. `bun scripts/check-translations.ts` lists
  them.
- **`docs-site/`** still describes the assistant, Flow, and screen vision. It is
  the upstream marketing site and is not built from this repo.
