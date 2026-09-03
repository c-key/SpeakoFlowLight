# Umbaustand — Stand der Arbeit

> Diese Datei ist ein Arbeitsprotokoll für die Fertigstellung. Sie kann gelöscht
> werden, sobald die offenen Punkte abgehakt sind. Was der Fork inhaltlich ist,
> steht in [FORK.md](FORK.md).

## Was fertig ist

**Repo-Aufbau**

- Klon mit vollständiger Git-History unter `C:\-MY-\-PRIVAT-\Git\SpeakoFlow-Light`
- Remotes: `upstream` → `github.com/AbhishekBarali/SpeakoFlow`,
  `local-mirror` → das ursprüngliche lokale Repo. Kein `origin` (noch kein
  eigenes Remote).
- Branches: `main` (dieser Fork) und `upstream-mirror` (unangetasteter Spiegel
  von `upstream/main`, aktuell bei `2e5c7f5`).
- `scripts/sync-upstream.sh` holt neue Upstream-Commits und merged sie;
  `--check` zeigt nur, was neu ist. Getestet (Syntax + `--check`-Pfad).
- Eigene App-Identität: `productName` „SpeakoFlow Light“,
  `identifier` `com.speakoflow.light`, Keychain-Service ebenso. Damit ist die
  App parallel zum Original installierbar und teilt keine Einstellungen.
  **Nebenwirkung:** eigenes App-Data-Verzeichnis, also werden bereits
  heruntergeladene Modelle nicht automatisch gefunden. Über
  Einstellungen → Modelle → Ordner hinzufügen lässt sich der Modellordner des
  Originals einbinden, ohne etwas zu kopieren.

**Entfernt (Backend)**

Gelöscht: `assistant.rs`, `commands/assistant.rs`, `flow.rs`, `screenshot.rs`,
`tts.rs`, `web_search.rs`, `speech_stream.rs`.

Bereinigt: `lib.rs` (ca. 70 Commands abgemeldet, kein Panel-Fenster, kein
Raw-Body-Handler), `settings.rs` (ca. 60 Felder entfernt), `actions.rs`
(`AssistantAction`, `AssistantPanelToggleAction`, der komplette Flow-Zweig),
`shortcut/*`, `utils.rs`, `overlay.rs`, `signal_handle.rs`, `cli.rs`
(`--toggle-assistant`), `transcription_coordinator.rs`,
`managers/transcription.rs`, `managers/history.rs`, `commands/models.rs`
(Lösch-Schutz nur noch für das Cleanup-Modell), `secret_store.rs`,
`Cargo.toml` (`xcap`, `tauri-nspanel`), `capabilities/default.json`.

**Entfernt (Frontend)**

Gelöscht: `src/assistant/**` (Panel-Fenster), `AssistantSettings.tsx`,
`AssistantSection.tsx`, `GenerateWithFlowGroup.tsx`,
`ScreenRecordingPermission.tsx`, `footer/LlmModelSelector.tsx` (toter Code).

Neu geschrieben: `HistorySettings.tsx` (nur noch Diktat-Verlauf),
`LlmOnboarding.tsx` (nur noch das Cleanup-Modell),
`profiles/ProfilesSettings.tsx` (neues Profil-Modell).

Angepasst: `Sidebar.tsx` (`assistant` → `personalization`), `settings/index.ts`,
`DictationSettings.tsx`, `models/LlmCatalog.tsx` (nur noch Cleanup-Rolle),
`settingsStore.ts`, `overlay/RecordingOverlay.tsx`, `ReadyStep.tsx`,
`vite.config.ts` (zwei statt vier Entry Points).

**Umgewidmet: Profile + Memory**

- `AssistantCharacter` → `Profile` (`settings.rs`): `instructions`, `prompt_id`,
  `tone_id`, `use_memory`, `avatar`, `description`. Built-ins: Default, Email,
  Chat, Notes.
- `settings.assistant_memory*` → `settings.memory*`, plus neues
  `memory_auto_learn` (standardmäßig aus).
- Alte Feldnamen werden per `serde(alias)` weitergelesen — eine bestehende
  `settings.json` verliert ihre Profile und ihr Gedächtnis nicht.
- Wirkung im Cleanup-Prompt (`actions.rs::build_post_process_request`): vier
  Ebenen plus Vertrag — Cleanup-Prompt, Tonfall, Profil-Anweisungen,
  Memory-Block (nur Hintergrund), Output-Vertrag.
- `AppSettings::effective_prompt_id()` / `effective_tone_id()` lassen das aktive
  Profil die globale Auswahl überschreiben; `memory_applies()` verlangt
  Feature an + Inkognito aus + Profil hat zugestimmt.
- Memory lernt jetzt aus dem Diktat-Verlauf
  (`HistoryManager::recent_transcript_texts` → `memory::distill_and_store`) und
  nutzt dafür den aufgelösten Cleanup-Provider.
- Neue Command-Module: `commands/profiles.rs`, `avatar.rs` (Avatar-Skalierung,
  kam aus `screenshot.rs`).

**Lokal-only**

Websuche und Remote-TTS sind vollständig entfernt. Die Cloud-Provider für
Cleanup stehen noch im Settings-Modell (Details und Begründung in FORK.md), sind
aber ohne API-Key inaktiv.

**i18n**

Alle 21 Sprachdateien umgeschrieben: Keys entfernter Features gelöscht,
`characters.*` → `profiles.*` und `assistant.brain.*` → `cleanupModels.*`
verschoben (damit die vorhandenen Übersetzungen erhalten bleiben). Neue und
umformulierte Strings gibt es auf Englisch und Deutsch.

**Dokumentation**

`FORK.md` (neu — was entfernt wurde, wohin was gewandert ist, Sync-Anleitung mit
Konflikt-Rezepten), `README.md`, `PRIVACY.md`, `AGENTS.md`, `BUILD.md`
(Windows-Voraussetzungen und die zwei Fallen unten), `CONTRIBUTING.md`.

**Verifikation**

Alles Folgende läuft durch:

- `cargo fmt --check`
- `cargo check` — fehlerfrei und **ohne Warnungen** (28 Minuten kalt).
- `cargo test` — **280 Tests bestanden**, 0 fehlgeschlagen, 3 ignoriert (die
  drei brauchen einen laufenden llama-server und sind upstream ebenso markiert).
- `bun run lint` (ESLint), `tsc --noEmit` und `bun run build`
  (Vite-Produktionsbuild) — alle sauber.
- `src/bindings.ts` ist neu generiert: die App wurde einmal gebaut und
  gestartet, tauri-specta hat die Datei geschrieben (128 KB → 82 KB, weil rund
  70 Commands weg sind).

Was dabei noch aufgefallen und behoben wurde:

- Die Warnungen des Umbaus sind abgearbeitet. `llm_client.rs` behält sein
  totes SSE-/Tool-Calling-Gerüst hinter einem begründeten
  `#![allow(dead_code)]`, weil Upstream diese Datei aktiv weiterentwickelt und
  ein Löschen jeden Merge dort zum Konflikt machen würde — dasselbe gilt für
  den nie verdrahteten Tap-to-Lock-Parser in `lock_watch.rs` (der war auch
  upstream schon tot, siehe FORK.md).
- `commands/models.rs` schützte beim Löschen noch das Assistant-Modell
  (Feld existiert nicht mehr) — jetzt nur noch das Cleanup-Modell.
- Erst mit den neuen Bindings sichtbar: `ModelsSettings.tsx` wies
  Sprachmodelle noch dem Assistant-Provider zu (jetzt: immer Cleanup, eine
  Rolle statt zwei Ternaries), `TapToLock.tsx` bot noch den
  `assistant_tap_to_lock_key`, und `ProfilesSettings.tsx` behandelte das
  optionale `use_memory` als `boolean`.
- Die i18n-Dateien hatten noch sechs Keys entfernter Features (Screen-Vision-
  und Assistant-Onboarding-Texte). Die sind aus allen 21 Sprachen raus, die
  `untranslated-baseline.json` ist entsprechend geschrumpft, und **Deutsch ist
  jetzt vollständig** — `bun scripts/check-translations.ts` meldet einen
  kompletten Key-Satz nur für DE.
- Mit `onboarding.aiModel.seesScreen` fiel auch die „Sieht deinen
  Bildschirm"-Plakette im Modellkatalog weg: in einer App ohne Screen Vision
  eine Unterscheidung ohne Unterschied.
- **Eigene Falle:** Tailwind v4 scannt das ganze Projektverzeichnis nach
  Klassennamen, auch Markdown. Ein Windows-Pfad in STATUS.md enthielt
  einen Backslash gefolgt von `f4793559`, was Tailwind als Unicode-Escape las und den Build mit
  *"Invalid code point 16021813"* abbrechen ließ. Deshalb steht die
  Build-Umgebung jetzt als `scripts/dev-env.win.bat` im Repo statt als Pfad in
  dieser Datei.

## Was noch zu tun ist

1. **App durchklicken.** Sie startet (das war Teil der Bindings-Generierung),
   aber die Oberfläche ist noch nicht bedient worden: Diktat, Diktat +
   Cleanup, Einstellungen → Personalisierung → Profile/Gedächtnis, Verlauf.
   Beim Start ohne Vite-Server zeigt das Fenster erwartungsgemäß einen
   Ladefehler — dafür `scriptsdev-env.win.bat bun tauri dev` benutzen.

2. **Commit.** Bisher ist *nichts* committed — alle Änderungen liegen im
   Arbeitsverzeichnis. Vorschlag für die Aufteilung:
   - `feat: fork as SpeakoFlow Light — remove the assistant, Flow and screen vision`
   - `feat(profiles): re-point profiles and memory at AI cleanup`
   - `docs: describe the fork and how to track upstream`

3. **Offene Punkte, die bewusst so sind** (stehen auch in FORK.md):
   - Übersetzungen: die 18 Sprachen außer Deutsch und Englisch fallen für
     neue/umformulierte Strings auf Englisch zurück. `bun scripts/check-translations.ts` listet
     sie.
   - `docs-site/` beschreibt weiterhin Assistant, Flow und Screen Vision. Das
     ist die Upstream-Website und wird aus diesem Repo nicht gebaut.
   - Die Migrationsliste in `managers/history.rs` behält die Tabelle
     `assistant_history` absichtlich (eine `rusqlite_migration`-Liste darf nie
     schrumpfen).

## Build-Umgebung auf diesem Rechner

`scripts/dev-env.win.bat` setzt eine funktionierende Umgebung und führt aus,
was man ihm übergibt — `scriptsdev-env.win.bat cargo check`,
`… cargo test`, `… bun tauri dev`. Die fünf Pfade am Anfang der Datei sind
maschinenspezifisch; alles daran, was allgemein gilt, steht in `BUILD.md`.

**Achtung:** es baut nach `C:ctsfl` statt nach `src-tauri/target` — siehe die
MAX_PATH-Begründung unten. Wer ohne das Skript arbeitet, muss
`CARGO_TARGET_DIR` genauso setzen, sonst wird alles ein zweites Mal gebaut.

### Nachinstallierte Voraussetzungen

Auf diesem Rechner fehlten sie, weshalb der Backend-Build zunächst gar nicht
lief. Alle sind jetzt installiert:

- **VS 2022 Build Tools** mit C++-Workload (`winget`). Die beiden vorhandenen
  Visual-Studio-Installationen (2022 Professional und VS 18) haben **kein**
  `VC\Tools\MSVC\<ver>\include` und nur `lib\onecore` — damit scheitert jedes
  Crate mit C/C++-Build-Skript. Auch `vcvarsall.bat` fehlt dort.
- **cmake 4.4.3** (`scoop install cmake`) — für `transcribe-cpp-sys` und
  `whisper-rs-sys`.
- **LLVM 23.1** (`scoop install llvm`) — `libclang` für `bindgen`.
- **Vulkan SDK 1.4.357** (`scoop install vulkan`) — der x86_64-Build aktiviert
  ggmls Vulkan-Backend; dessen Shader-Schritt braucht `glslc` plus Header und
  Import-Lib. `VULKAN_SDK` muss auf das Install-Root zeigen.
- **Ninja 1.13** (`scoop install ninja`) — nicht aus Geschwindigkeitsgründen,
  siehe die nächste Falle.

### Zwei Windows-Fallen, die je einen Build gekostet haben

- **Der cmake-Generator.** Ohne Vorgabe nimmt cmake die neueste
  Visual-Studio-Installation, die es findet — hier die unvollständige „Visual
  Studio 18 2026“ — und scheitert mit *„could not find any instance of Visual
  Studio“*. Mit `Visual Studio 17 2022` konfiguriert sich ggmls
  verschachteltes `vulkan-shaders-gen` dann aus MSBuild heraus neu und findet
  keinen C-Compiler (*„No CMAKE_C_COMPILER could be found“*). Beides erledigt
  `CMAKE_GENERATOR=Ninja`, weil das Unterprojekt dort die `cl.exe` aus dem
  `PATH` erbt.
- **MAX_PATH.** `vulkan-shaders-gen` verschachtelt sein Build-Verzeichnis so
  tief, dass der PDB-Pfad in seinem Compiler-Test 260 Zeichen überschreitet.
  MSVC meldet das als `fatal error C1041: cannot open program database … please
  use /FS` — irreführend, denn derselbe Fehler bedeutet normalerweise parallele
  `cl.exe`-Schreibzugriffe. Der Fix ist ein kurzes `CARGO_TARGET_DIR`, nicht
  `/FS`.

Nach jeder Änderung an Generator oder Target-Verzeichnis müssen
`<target>/debug/build/transcribe-cpp-sys-*` und `whisper-rs-sys-*` gelöscht
werden — die Entscheidung steckt in deren CMake-Caches.
