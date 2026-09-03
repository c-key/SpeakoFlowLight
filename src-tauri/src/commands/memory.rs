//! Tauri commands for the local personal-memory feature (Settings → Memory).
//!
//! Everything here reads/writes `settings.memory` (and the related toggles) and
//! lives entirely on-device. Memory feeds AI cleanup: when the active profile
//! opts in, the relevant parts are injected into the cleanup prompt so a
//! dictation comes back with your names, terms, and style intact. Mutations
//! emit `settings-changed` so open windows refresh.

use crate::managers::history::HistoryManager;
use crate::memory;
use crate::settings::{
    get_settings, write_settings, MemoryConfidence, MemoryDetail, MemoryNote, UserMemory,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// How many recent dictations a manual "learn from my dictations" pass reads.
const DISTILL_HISTORY_LIMIT: usize = 30;

/// Notify open webviews (the settings window) that settings changed.
fn emit_settings_changed(app: &AppHandle) {
    let _ = app.emit("settings-changed", ());
}

/// Turn the personal-memory feature on or off. Off by default.
#[tauri::command]
#[specta::specta]
pub fn set_memory_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.memory_enabled = enabled;
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Set how much memory is injected per cleanup pass (the budget dial).
#[tauri::command]
#[specta::specta]
pub fn set_memory_detail(app: AppHandle, detail: MemoryDetail) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.memory_detail = detail;
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Toggle incognito: while on, dictations are neither personalized from memory
/// nor learned from.
#[tauri::command]
#[specta::specta]
pub fn set_memory_incognito(app: AppHandle, incognito: bool) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.memory_incognito = incognito;
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Turn automatic learning from past dictations on or off. Off by default, so
/// memory holds only what the user entered or explicitly asked for.
#[tauri::command]
#[specta::specta]
pub fn set_memory_auto_learn(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.memory_auto_learn = enabled;
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Replace the always-on "About You" summary (user-edited in Settings).
#[tauri::command]
#[specta::specta]
pub fn set_memory_about_you(app: AppHandle, text: String) -> Result<(), String> {
    let trimmed = text.trim();
    if memory::is_sensitive(trimmed) {
        return Err(
            "That text looks like it contains a secret or an instruction — memory can't store it."
                .to_string(),
        );
    }
    let mut settings = get_settings(&app);
    settings.memory.about_you = trimmed.chars().take(600).collect();
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Add a user-authored note (explicit → high confidence). Returns the new note.
#[tauri::command]
#[specta::specta]
pub fn add_memory_note(app: AppHandle, text: String) -> Result<MemoryNote, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Write something to remember first.".to_string());
    }
    if memory::is_sensitive(trimmed) {
        return Err(
            "That looks like a secret or an instruction — memory can't store it.".to_string(),
        );
    }
    let note = MemoryNote {
        id: memory::new_note_id(),
        text: trimmed.chars().take(240).collect(),
        updated: memory::today_iso(),
        confidence: MemoryConfidence::High,
        source: "user".to_string(),
    };
    let mut settings = get_settings(&app);
    settings.memory.notes.push(note.clone());
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(note)
}

/// Edit an existing note's text (keeps it user-owned; bumps its date).
#[tauri::command]
#[specta::specta]
pub fn update_memory_note(app: AppHandle, id: String, text: String) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("A note can't be empty — delete it instead.".to_string());
    }
    if memory::is_sensitive(trimmed) {
        return Err(
            "That looks like a secret or an instruction — memory can't store it.".to_string(),
        );
    }
    let mut settings = get_settings(&app);
    let Some(note) = settings.memory.notes.iter_mut().find(|n| n.id == id) else {
        return Err("That note no longer exists.".to_string());
    };
    note.text = trimmed.chars().take(240).collect();
    note.updated = memory::today_iso();
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Delete a single note by id.
#[tauri::command]
#[specta::specta]
pub fn delete_memory_note(app: AppHandle, id: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.memory.notes.retain(|n| n.id != id);
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Wipe the entire personal memory (summary + all notes). Does not change the
/// enabled toggle.
#[tauri::command]
#[specta::specta]
pub fn clear_memory(app: AppHandle) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.memory = UserMemory::default();
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Export the whole memory to a JSON file on disk (path chosen via the UI's
/// save dialog). Your data, in a portable, human-readable file.
#[tauri::command]
#[specta::specta]
pub fn export_memory(app: AppHandle, path: String) -> Result<(), String> {
    let settings = get_settings(&app);
    let json = serde_json::to_string_pretty(&settings.memory).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Couldn't write file: {}", e))?;
    Ok(())
}

/// Import memory from a JSON file (path chosen via the UI's file dialog),
/// replacing the current memory. Sensitive/oversized entries are filtered out
/// on the way in.
#[tauri::command]
#[specta::specta]
pub fn import_memory(app: AppHandle, path: String) -> Result<UserMemory, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Couldn't read file: {}", e))?;
    let mut imported: UserMemory = serde_json::from_slice(&bytes)
        .map_err(|e| format!("That file isn't a valid memory export: {}", e))?;

    // Sanitize: drop sensitive summary, filter sensitive/empty notes, backfill
    // ids/dates so the store stays well-formed.
    if memory::is_sensitive(&imported.about_you) {
        imported.about_you = String::new();
    } else {
        imported.about_you = imported.about_you.trim().chars().take(600).collect();
    }
    imported.notes.retain(|n| {
        let t = n.text.trim();
        !t.is_empty() && !memory::is_sensitive(t)
    });
    for note in imported.notes.iter_mut() {
        if note.id.trim().is_empty() {
            note.id = memory::new_note_id();
        }
        if note.updated.trim().is_empty() {
            note.updated = memory::today_iso();
        }
        note.text = note.text.trim().chars().take(240).collect();
    }

    let mut settings = get_settings(&app);
    settings.memory = imported.clone();
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(imported)
}

/// Learn from recent dictations right now (the "Update memory from my
/// dictations" button). Reads the last [`DISTILL_HISTORY_LIMIT`] history
/// entries and runs the extraction pass immediately, so the user can see it
/// work instead of waiting for it to happen in the background.
///
/// Deliberately explicit: automatic learning is off by default (see
/// `memory_auto_learn`), which makes this button the only path into memory
/// besides typing a note by hand.
#[tauri::command]
#[specta::specta]
pub async fn distill_memory_now(app: AppHandle) -> Result<(), String> {
    let settings = get_settings(&app);
    if !settings.memory_enabled {
        return Err("Turn on memory first.".to_string());
    }
    if settings.memory_incognito {
        return Err("Memory is in incognito mode — turn that off first.".to_string());
    }

    let history = app.state::<Arc<HistoryManager>>();
    let texts = history
        .recent_transcript_texts(DISTILL_HISTORY_LIMIT)
        .map_err(|e| format!("Couldn't read your dictation history: {}", e))?;
    if texts.len() < 2 {
        return Err("Dictate a few times first, then I can learn from it.".to_string());
    }

    memory::distill_and_store(app.clone(), texts).await;
    Ok(())
}
