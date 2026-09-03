//! Turning a picked image file into a small avatar data URL for a dictation
//! profile.
//!
//! Upstream carried this inside `screenshot.rs`, next to the screen-capture
//! ladder it shared its scale/encode helpers with. This build has no screen
//! capture, so the two helpers live here instead — the only image work left is
//! shrinking a user-picked avatar so it stays compact inside `settings.json`.

use base64::Engine;
use image::imageops::FilterType;
use image::DynamicImage;
use std::io::Cursor;

/// Longest edge of a stored avatar. Small on purpose: the image is embedded in
/// the settings file as base64, and it is only ever drawn as a list icon.
const AVATAR_MAX_DIM: u32 = 256;

/// JPEG quality for a stored avatar — visually clean at icon size.
const AVATAR_QUALITY: u8 = 82;

/// Refuse an input file above this size before decoding it, so a huge image
/// can't cost a multi-hundred-megabyte decode buffer.
const MAX_INPUT_BYTES: u64 = 25 * 1024 * 1024;

fn scaled(img: &DynamicImage, max_dim: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w.max(h) <= max_dim {
        return img.clone();
    }
    let scale = max_dim as f32 / w.max(h) as f32;
    img.resize(
        (w as f32 * scale) as u32,
        (h as f32 * scale) as u32,
        FilterType::Triangle,
    )
}

fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = DynamicImage::ImageRgb8(img.to_rgb8());
    let mut buf = Vec::new();
    rgb.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
        Cursor::new(&mut buf),
        quality,
    ))
    .map_err(|e| format!("Failed to encode image: {}", e))?;
    Ok(buf)
}

/// Read an image file from disk and return it as a downscaled JPEG data URL.
pub fn image_file_to_avatar_data_url(path: &str) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Can't read file: {}", e))?;
    if meta.len() > MAX_INPUT_BYTES {
        return Err("Image is too large (over 25 MB)".to_string());
    }
    let img = image::open(path).map_err(|e| format!("Can't open image: {}", e))?;
    let buf = encode_jpeg(&scaled(&img, AVATAR_MAX_DIM), AVATAR_QUALITY)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/jpeg;base64,{}", encoded))
}
