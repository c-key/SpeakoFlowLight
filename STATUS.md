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
  `identifier` `speakoflow.light`, Keychain-Service ebenso. Damit ist die
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

Stand der letzten vollständigen Runde (vor dem Cloud-Umbau, siehe unten):

- `cargo fmt --check`, `cargo check` (ohne Warnungen), `cargo test`
  (280 bestanden, 0 fehlgeschlagen, 3 ignoriert — die brauchen einen laufenden
  llama-server), `tsc --noEmit`, `bun run lint` und `bun run build`.
- `src/bindings.ts` ist neu generiert (App einmal gebaut und gestartet,
  128 KB → 82 KB, rund 70 Commands weniger).
- Deutsch ist in den Übersetzungen vollständig.
- Die App läuft und diktiert: Mikrofon in 380 ms, Transkription in 2972 ms,
  Einfügen per Ctrl+V. Vulkan findet beide GPUs (Intel Iris Xe, NVIDIA T500).

## Commits

Drei Commits liegen auf `main`, `upstream-mirror` bleibt bei `2e5c7f5`:

- `ba5807b` feat: fork as SpeakoFlow Light — remove the assistant, Flow and screen vision
- `30fc8a5` i18n: move the assistant strings to profiles and cleanup
- `8364706` docs: describe the fork and how to track upstream

Die Profil-/Memory-Umwidmung steckt bewusst im ersten Commit: `settings.rs`,
`actions.rs` und `lib.rs` lassen sich nicht in zwei Zustände teilen, die beide
kompilieren.

## Was noch zu tun ist

### 1. Repo veröffentlichen — dann den Quellcode-Link reaktivieren

Auf der Info-Seite ist der Button „Repository nicht verfügbar“ **absichtlich
deaktiviert**: er zeigte auf das Upstream-Repository, also auf genau die App,
von der dieser Fork weggeht. Sobald der Fork auf einem eigenen öffentlichen
Git-Remote liegt:

1. In `src/components/settings/about/AboutSettings.tsx` das `disabled` am
   Button entfernen und `openUrl("<neue Repo-URL>")` wieder eintragen.
2. Die Texte `settings.about.sourceCode.description` und `.button` in `en` und
   `de` zurück auf „View on GitHub“ / „Auf GitHub ansehen“ stellen.
3. In `README.md` und `BUILD.md` steht als Klon-Adresse `<this fork>` — dort
   die echte URL eintragen.
4. `git remote add origin <URL>` und `git push -u origin main upstream-mirror`.

Der Lizenz-Button zeigt bewusst auf <https://opensource.org/license/mit> statt
auf die `LICENSE`-Datei des Ursprungsprojekts.

### 2. App durchklicken (nach den letzten Änderungen)

Zuletzt geändert und in der laufenden App noch nicht geprüft: die
Anbieterauswahl unter Diktat → AI Cleanup (nur lokale Ziele, der doppelte
Eintrag `custom` ist weg), das Onboarding mit drei Cleanup-Karten und die
Info-Seite (Version mit `-light`, Lizenz-Link, deaktivierter Repo-Button).

### 3. Datenordner nach der Identifier-Änderung

Der Bundle-Identifier heißt jetzt `speakoflow.light` statt
`com.speakoflow.light` — die App liest also aus `%APPDATA%/speakoflow.light/`
und findet den bisherigen Testverlauf nicht mehr. Der alte Ordner
`%APPDATA%/com.speakoflow.light/` kann gelöscht werden; er enthält nur
`settings.json` und `history.db` aus den Testläufen.

### 4. Bewusst offen (steht auch in FORK.md)

- Übersetzungen: die 18 Sprachen außer Deutsch und Englisch fallen für
  neue/umformulierte Strings auf Englisch zurück.
  `bun scripts/check-translations.ts` listet sie.
- `docs-site/` beschreibt weiterhin Assistant, Flow und Screen Vision. Das ist
  die Upstream-Website und wird aus diesem Repo nicht gebaut.
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
