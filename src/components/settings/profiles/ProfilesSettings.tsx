import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Copy,
  Download,
  FileText,
  ImagePlus,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Notebook,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { commands, type Profile } from "@/bindings";
import { Button } from "@/components/ui/Button";
import { Input } from "../../ui/Input";
import { Textarea } from "@/components/ui";
import { Dropdown } from "../../ui/Dropdown";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { useSettings } from "../../../hooks/useSettings";

/** Sentinel for "inherit whatever is selected globally". The backend reads an
 *  empty string as inherit; the dropdown needs a non-empty value to show. */
const INHERIT = "__inherit__";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

/** The built-in profile ids, in shipped order — used to offer "restore the ones
 *  I deleted" only when something is actually missing. */
const BUILTIN_IDS = ["default", "email", "chat", "notes"];

/** A stable-ish unique id for a new/duplicated profile. The backend also
 *  enforces uniqueness, so a collision is only cosmetic. */
const newId = (): string =>
  `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Designed identities for the built-in profiles — a soft gradient disc with a
 *  matching glyph — so the list reads as a crafted set instead of gray letter
 *  circles. Keyed by the built-in profile id. */
const BUILTIN_AVATARS: Record<string, { icon: LucideIcon; gradient: string }> =
  {
    default: { icon: FileText, gradient: "from-teal-400 to-teal-600" },
    email: { icon: Mail, gradient: "from-sky-400 to-blue-600" },
    chat: { icon: MessageCircle, gradient: "from-violet-400 to-violet-600" },
    notes: { icon: Notebook, gradient: "from-emerald-400 to-emerald-600" },
  };

/** Gradient ramp for custom profiles — the initial sits on a hue picked
 *  deterministically from the id so each profile keeps its color. */
const INITIAL_GRADIENTS = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-violet-600",
  "from-emerald-400 to-emerald-600",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-rose-600",
  "from-teal-400 to-teal-600",
];

const gradientFor = (id: string): string => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return INITIAL_GRADIENTS[hash % INITIAL_GRADIENTS.length];
};

/** The avatar disc: the user's own image when they picked one, otherwise the
 *  built-in glyph, otherwise the first letter of the name. */
const Avatar: React.FC<{ profile: Profile; size?: number }> = ({
  profile,
  size = 36,
}) => {
  const builtin = BUILTIN_AVATARS[profile.id];
  const style = { width: size, height: size };

  if (profile.avatar) {
    return (
      <img
        src={profile.avatar}
        alt=""
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  if (builtin) {
    const Icon = builtin.icon;
    return (
      <span
        style={style}
        className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white ${builtin.gradient}`}
      >
        <Icon size={Math.round(size * 0.5)} />
      </span>
    );
  }
  return (
    <span
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-medium text-white ${gradientFor(
        profile.id,
      )}`}
    >
      {(profile.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
};

/**
 * Dictation profiles — the Profiles sub-page.
 *
 * A profile is one switch that carries a whole AI-cleanup setup: which cleanup
 * prompt to use, the tone, an extra instruction layer, and whether personal
 * memory is injected. That is the point of the page: "work email" and "quick
 * chat message" want different cleanup, and naming that difference once beats
 * re-dialing three settings every time the context changes.
 *
 * The list is edited locally and saved as a whole through `setProfiles`, which
 * enforces the invariants (non-empty, unique ids, `default` present).
 */
export const ProfilesSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();

  const profiles = settings?.profiles ?? [];
  const activeId = settings?.active_profile_id ?? "default";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Cleanup prompts to choose from, plus the inherit option. */
  const promptOptions = useMemo(() => {
    const prompts = settings?.post_process_prompts ?? [];
    return [
      { value: INHERIT, label: t("settings.profiles.fields.inherit") },
      ...prompts.map((p) => ({ value: p.id, label: p.name })),
    ];
  }, [settings?.post_process_prompts, t]);

  /** Built-in tones plus the user's custom ones, plus the inherit option. */
  const toneOptions = useMemo(() => {
    const builtin = [
      "none",
      "formal",
      "casual",
      "professional",
      "friendly",
      "concise",
    ].map((id) => ({
      value: id,
      label: t(`settings.postProcessing.tone.options.${id}`, id),
    }));
    const custom = (settings?.post_process_custom_tones ?? []).map((tone) => ({
      value: tone.id,
      label: tone.name,
    }));
    return [
      { value: INHERIT, label: t("settings.profiles.fields.inherit") },
      ...builtin,
      ...custom,
    ];
  }, [settings?.post_process_custom_tones, t]);

  /** Persist the whole list, surface an error, then refresh. */
  const persist = useCallback(
    async (next: Profile[]): Promise<boolean> => {
      const res = await commands.setProfiles(next);
      if (res.status === "error") {
        setError(res.error ?? "Something went wrong.");
        return false;
      }
      setError(null);
      await refreshSettings();
      return true;
    },
    [refreshSettings],
  );

  /** Replace one profile in place. */
  const updateProfile = useCallback(
    (id: string, patch: Partial<Profile>) => {
      void persist(profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },
    [persist, profiles],
  );

  const selectProfile = useCallback(
    async (id: string) => {
      const res = await commands.setActiveProfile(id);
      if (res.status === "error") {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setError(null);
      await refreshSettings();
    },
    [refreshSettings],
  );

  const addProfile = useCallback(async () => {
    const id = newId();
    const created: Profile = {
      id,
      name: t("settings.profiles.newName"),
      instructions: "",
      prompt_id: "",
      tone_id: "",
      use_memory: false,
      avatar: "",
      builtin: false,
      description: "",
    };
    if (await persist([...profiles, created])) setEditingId(id);
  }, [persist, profiles, t]);

  const duplicateProfile = useCallback(
    async (profile: Profile) => {
      const id = newId();
      const copy: Profile = {
        ...profile,
        id,
        name: t("settings.profiles.copyName", { name: profile.name }),
        builtin: false,
      };
      setMenuId(null);
      if (await persist([...profiles, copy])) setEditingId(id);
    },
    [persist, profiles, t],
  );

  const deleteProfile = useCallback(
    (id: string) => {
      setMenuId(null);
      if (editingId === id) setEditingId(null);
      void persist(profiles.filter((p) => p.id !== id));
    },
    [editingId, persist, profiles],
  );

  const restoreBuiltin = useCallback(
    async (id: string) => {
      setMenuId(null);
      const res = await commands.restoreBuiltinProfile(id);
      if (res.status === "error") {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setError(null);
      await refreshSettings();
    },
    [refreshSettings],
  );

  const restoreMissing = useCallback(async () => {
    const res = await commands.restoreMissingBuiltinProfiles();
    if (res.status === "error") {
      setError(res.error ?? "Something went wrong.");
      return;
    }
    setError(null);
    await refreshSettings();
  }, [refreshSettings]);

  const pickAvatar = useCallback(
    async (id: string) => {
      try {
        const path = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "Image", extensions: IMAGE_EXTENSIONS }],
        });
        if (typeof path !== "string") return;
        const res = await commands.readProfileAvatar(path);
        if (res.status === "error") {
          setError(res.error ?? "Something went wrong.");
          return;
        }
        updateProfile(id, { avatar: res.data });
      } catch (err) {
        setError(String(err));
      }
    },
    [updateProfile],
  );

  const exportProfile = useCallback(async (profile: Profile) => {
    setMenuId(null);
    try {
      const path = await save({
        defaultPath: `${profile.name || "profile"}.json`,
        filters: [{ name: "Profile", extensions: ["json"] }],
      });
      if (!path) return;
      const res = await commands.exportProfile(profile.id, path);
      if (res.status === "error") setError(res.error ?? "Something went wrong.");
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const importProfile = useCallback(async () => {
    try {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Profile", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      const res = await commands.importProfile(path);
      if (res.status === "error") {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setError(null);
      await refreshSettings();
      setEditingId(res.data.id);
    } catch (err) {
      setError(String(err));
    }
  }, [refreshSettings]);

  if (!settings) return null;

  const missingBuiltins = BUILTIN_IDS.some(
    (id) => !profiles.some((p) => p.id === id),
  );

  return (
    <div className="max-w-3xl w-full mx-auto space-y-4">
      <ul className="space-y-2">
        {profiles.map((profile) => {
          const isActive = profile.id === activeId;
          const isEditing = editingId === profile.id;

          return (
            <li
              key={profile.id}
              className={`rounded-xl border bg-surface transition-colors ${
                isActive ? "border-accent/50" : "border-hairline"
              }`}
            >
              {/* Row: avatar, name, active marker, actions ---------------- */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar profile={profile} />
                <button
                  type="button"
                  onClick={() => selectProfile(profile.id)}
                  className="min-w-0 flex-1 cursor-pointer text-start"
                >
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {profile.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {profile.description ||
                      profile.instructions ||
                      t("settings.profiles.noInstructions")}
                  </span>
                </button>

                {isActive && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
                    <Check size={14} />
                    {t("settings.profiles.active")}
                  </span>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(isEditing ? null : profile.id)}
                  aria-expanded={isEditing}
                >
                  {isEditing
                    ? t("settings.profiles.close")
                    : t("settings.profiles.edit")}
                </Button>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setMenuId(menuId === profile.id ? null : profile.id)
                    }
                    aria-label={t("settings.profiles.more")}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-ink/6 hover:text-ink"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {menuId === profile.id && (
                    <div className="absolute end-0 top-8 z-10 w-52 overflow-hidden rounded-xl border border-hairline bg-surface elev-card">
                      <button
                        type="button"
                        onClick={() => duplicateProfile(profile)}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-start text-[13px] text-body hover:bg-ink/6"
                      >
                        <Copy size={14} />
                        {t("settings.profiles.duplicate")}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportProfile(profile)}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-start text-[13px] text-body hover:bg-ink/6"
                      >
                        <Download size={14} />
                        {t("settings.profiles.export")}
                      </button>
                      {profile.builtin && (
                        <button
                          type="button"
                          onClick={() => restoreBuiltin(profile.id)}
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-start text-[13px] text-body hover:bg-ink/6"
                        >
                          <RotateCcw size={14} />
                          {t("settings.profiles.restore")}
                        </button>
                      )}
                      {profile.id !== "default" && (
                        <button
                          type="button"
                          onClick={() => deleteProfile(profile.id)}
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-start text-[13px] text-error hover:bg-error/8"
                        >
                          <Trash2 size={14} />
                          {t("settings.profiles.delete")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Editor --------------------------------------------------- */}
              {isEditing && (
                <div className="space-y-4 border-t border-hairline px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Input
                      type="text"
                      defaultValue={profile.name}
                      onBlur={(e) =>
                        updateProfile(profile.id, {
                          name: e.target.value.trim() || profile.name,
                        })
                      }
                      placeholder={t("settings.profiles.fields.namePlaceholder")}
                      className="flex-1"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => pickAvatar(profile.id)}
                    >
                      <ImagePlus size={14} />
                      {t("settings.profiles.fields.avatar")}
                    </Button>
                    {profile.avatar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateProfile(profile.id, { avatar: "" })}
                        aria-label={t("settings.profiles.fields.avatarClear")}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>

                  <Input
                    type="text"
                    defaultValue={profile.description}
                    onBlur={(e) =>
                      updateProfile(profile.id, { description: e.target.value })
                    }
                    placeholder={t(
                      "settings.profiles.fields.descriptionPlaceholder",
                    )}
                    className="w-full"
                  />

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink">
                      {t("settings.profiles.fields.instructions")}
                    </label>
                    <Textarea
                      defaultValue={profile.instructions}
                      onBlur={(e) =>
                        updateProfile(profile.id, {
                          instructions: e.target.value,
                        })
                      }
                      rows={4}
                      placeholder={t(
                        "settings.profiles.fields.instructionsPlaceholder",
                      )}
                      className="w-full"
                    />
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                      {t("settings.profiles.fields.instructionsHint")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-ink">
                        {t("settings.profiles.fields.prompt")}
                      </label>
                      <Dropdown
                        options={promptOptions}
                        selectedValue={profile.prompt_id || INHERIT}
                        onSelect={(value) =>
                          updateProfile(profile.id, {
                            prompt_id: value === INHERIT ? "" : value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-ink">
                        {t("settings.profiles.fields.tone")}
                      </label>
                      <Dropdown
                        options={toneOptions}
                        selectedValue={profile.tone_id || INHERIT}
                        onSelect={(value) =>
                          updateProfile(profile.id, {
                            tone_id: value === INHERIT ? "" : value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-hairline">
                    <ToggleSwitch
                      checked={profile.use_memory ?? false}
                      onChange={(value) =>
                        updateProfile(profile.id, { use_memory: value })
                      }
                      label={t("settings.profiles.fields.useMemory.label")}
                      description={t(
                        "settings.profiles.fields.useMemory.description",
                      )}
                      grouped
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={addProfile}>
          <Plus size={14} />
          {t("settings.profiles.add")}
        </Button>
        <Button variant="secondary" size="sm" onClick={importProfile}>
          <Upload size={14} />
          {t("settings.profiles.import")}
        </Button>
        {missingBuiltins && (
          <Button variant="ghost" size="sm" onClick={restoreMissing}>
            <RotateCcw size={14} />
            {t("settings.profiles.restoreMissing")}
          </Button>
        )}
      </div>

      {error && <p className="px-0.5 text-xs text-error">{error}</p>}
    </div>
  );
};

export default ProfilesSettings;
