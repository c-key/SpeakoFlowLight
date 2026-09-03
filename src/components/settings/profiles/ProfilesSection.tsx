import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Notebook, Users } from "lucide-react";
import { ProfilesSettings } from "./ProfilesSettings";
import { MemorySettings } from "./MemorySettings";
import { SubPage } from "../../ui/SubPage";
import { SectionHeader } from "../../ui/SectionHeader";
import {
  TONE_TILE_VIVID,
  type SettingIcon,
  type SettingTone,
} from "../../ui/tones";

/** Which drill-down page is open, if any. */
type ProfilesSubPage = "profiles" | "memory" | null;

interface NavCardProps {
  icon: SettingIcon;
  tone: SettingTone;
  title: string;
  description?: string;
  onClick: () => void;
}

/** A prominent tappable card that opens a sub-page — icon tile, title, caption,
 *  trailing chevron. */
const NavCard: React.FC<NavCardProps> = ({
  icon: Icon,
  tone,
  title,
  description,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-hairline bg-surface elev-card px-4 py-3.5 text-start transition-colors hover:border-hairline-strong hover:bg-surface-strong"
  >
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE_TILE_VIVID[tone]}`}
    >
      <Icon size={18} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13.5px] font-medium text-ink">
        {title}
      </span>
      {description && (
        <span className="mt-0.5 block truncate text-xs text-muted">
          {description}
        </span>
      )}
    </span>
    <ChevronRight width={16} height={16} className="shrink-0 text-muted-soft" />
  </button>
);

/**
 * Personalization section shell.
 *
 * Two drill-down sub-pages via the shared `SubPage` primitive: Profiles (the
 * AI-cleanup setups you switch between) and Memory (what SpeakoFlow remembers
 * about how you write). The parent owns which sub-page is open so both stack
 * the same way.
 */
export const ProfilesSection: React.FC = () => {
  const { t } = useTranslation();
  const [subPage, setSubPage] = useState<ProfilesSubPage>(null);

  if (subPage === "profiles") {
    return (
      <SubPage
        title={t("sidebar.profiles")}
        description={t("settings.profiles.caption")}
        onBack={() => setSubPage(null)}
      >
        <ProfilesSettings />
      </SubPage>
    );
  }

  if (subPage === "memory") {
    return (
      <SubPage
        title={t("sidebar.memory")}
        description={t("settings.personalMemory.caption")}
        onBack={() => setSubPage(null)}
      >
        <MemorySettings />
      </SubPage>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <SectionHeader
        title={t("sidebar.personalization")}
        description={t("sectionSubtitles.personalization")}
      />
      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        <NavCard
          icon={Users}
          tone="violet"
          title={t("sidebar.profiles")}
          description={t("settings.profiles.caption")}
          onClick={() => setSubPage("profiles")}
        />
        <NavCard
          icon={Notebook}
          tone="emerald"
          title={t("sidebar.memory")}
          description={t("settings.personalMemory.caption")}
          onClick={() => setSubPage("memory")}
        />
      </div>
    </div>
  );
};

export default ProfilesSection;
