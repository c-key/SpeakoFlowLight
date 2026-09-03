//! Tauri commands for dictation profiles (Settings → Profiles).
//!
//! A profile bundles one AI-cleanup setup: which cleanup prompt to use, the
//! tone, an extra instruction layer, and whether personal memory is injected.
//! Switching profiles is therefore one choice instead of three, which is the
//! point — "work email" and "quick chat message" want different cleanup, and
//! the difference is worth naming once rather than re-dialing every time.
//!
//! Upstream shipped this list as assistant personas for its chat panel; the
//! stored field is read through a serde alias so an upgraded settings file
//! keeps its entries.

use crate::settings::{get_settings, write_settings, Profile};
use tauri::{AppHandle, Emitter};

/// Notify open webviews (the settings window) that settings changed.
fn emit_settings_changed(app: &AppHandle) {
    let _ = app.emit("settings-changed", ());
}

/// A reasonably-unique profile id (avoids a uuid dependency; mirrors the
/// memory-note helper).
fn new_profile_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("profile-{:x}", nanos)
}

/// Switch the active profile. Errors if the id no longer exists.
#[tauri::command]
#[specta::specta]
pub fn set_active_profile(app: AppHandle, id: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    if !settings.profiles.iter().any(|p| p.id == id) {
        return Err("That profile no longer exists.".to_string());
    }
    settings.active_profile_id = id;
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Replace the whole profile list. Add / edit / reorder / duplicate / delete
/// all funnel through here (like text replacements), which keeps the UI simple.
/// Enforces the invariants: the non-deletable `default` profile must remain,
/// the list can't be empty, ids must be unique, and the active id must still
/// resolve.
#[tauri::command]
#[specta::specta]
pub fn set_profiles(app: AppHandle, profiles: Vec<Profile>) -> Result<(), String> {
    if profiles.is_empty() {
        return Err("At least one profile is required.".to_string());
    }
    if !profiles.iter().any(|p| p.id == "default") {
        return Err("The default profile can't be removed.".to_string());
    }
    let mut seen = std::collections::HashSet::new();
    for p in &profiles {
        if p.id.trim().is_empty() {
            return Err("A profile is missing an id.".to_string());
        }
        if !seen.insert(p.id.clone()) {
            return Err(format!("Duplicate profile id: {}", p.id));
        }
    }

    let mut settings = get_settings(&app);
    if !profiles.iter().any(|p| p.id == settings.active_profile_id) {
        settings.active_profile_id = "default".to_string();
    }
    settings.profiles = profiles;
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(())
}

/// Load an image file as a small avatar data URL (downscaled to 256px so it
/// stays compact inside the settings file).
#[tauri::command]
#[specta::specta]
pub async fn read_profile_avatar(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::avatar::image_file_to_avatar_data_url(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Import a profile from a JSON file on disk (path chosen via the UI's file
/// dialog). The imported profile always gets a fresh id and is never marked
/// built-in, so it can't clobber a built-in or the non-deletable default.
#[tauri::command]
#[specta::specta]
pub fn import_profile(app: AppHandle, path: String) -> Result<Profile, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Couldn't read file: {}", e))?;
    let mut profile: Profile = serde_json::from_slice(&bytes)
        .map_err(|e| format!("That file isn't a valid profile: {}", e))?;
    profile.id = new_profile_id();
    profile.builtin = false;
    if profile.name.trim().is_empty() {
        profile.name = "Imported profile".to_string();
    }
    let mut settings = get_settings(&app);
    settings.profiles.push(profile.clone());
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(profile)
}

/// Export a single profile to a JSON file on disk (path chosen via the UI's
/// save dialog).
#[tauri::command]
#[specta::specta]
pub fn export_profile(app: AppHandle, id: String, path: String) -> Result<(), String> {
    let settings = get_settings(&app);
    let profile = settings
        .profiles
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Profile not found.".to_string())?;
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Couldn't write file: {}", e))?;
    Ok(())
}

/// Reset a built-in profile to the version shipped with the app. Custom
/// profiles have no shipped default, so this only works on built-in ids. This
/// is the "reload" for a built-in whose instructions you edited (or wiped) and
/// want back.
#[tauri::command]
#[specta::specta]
pub fn restore_builtin_profile(app: AppHandle, id: String) -> Result<Profile, String> {
    let shipped = crate::settings::default_profiles();
    let canonical = shipped
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "That isn't a built-in profile.".to_string())?;

    let mut settings = get_settings(&app);
    let existing = settings
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "That profile no longer exists.".to_string())?;
    *existing = canonical.clone();
    write_settings(&app, settings);
    emit_settings_changed(&app);
    Ok(canonical)
}

/// Re-add any built-in profiles the user deleted, leaving their custom profiles
/// and their edits to still-present built-ins untouched. Returns how many were
/// restored (0 if none were missing).
#[tauri::command]
#[specta::specta]
pub fn restore_missing_builtin_profiles(app: AppHandle) -> Result<u32, String> {
    let shipped = crate::settings::default_profiles();
    let mut settings = get_settings(&app);
    let mut restored = 0u32;
    for canonical in shipped {
        if !settings.profiles.iter().any(|p| p.id == canonical.id) {
            settings.profiles.push(canonical);
            restored += 1;
        }
    }
    if restored > 0 {
        write_settings(&app, settings);
        emit_settings_changed(&app);
    }
    Ok(restored)
}
