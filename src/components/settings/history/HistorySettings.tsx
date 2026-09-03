import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  Copy,
  FolderOpen,
  Mic,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  events,
  type HistoryEntry,
  type HistoryUpdatePayload,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { formatDateTime } from "@/utils/dateFormat";
import { AudioPlayer } from "../../ui/AudioPlayer";
import { Button } from "../../ui/Button";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SectionHeader } from "../../ui/SectionHeader";
import { useSettings } from "../../../hooks/useSettings";
// Retention rows live at the bottom of the History page, below the list.
import { RecordingRetentionPeriodSelector } from "../RecordingRetentionPeriod";
import { HistoryLimit } from "../HistoryLimit";

const PAGE_SIZE = 30;

const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, disabled, active, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`p-1.5 rounded-md flex items-center justify-center transition-colors cursor-pointer hover:bg-ink/6 disabled:cursor-not-allowed disabled:text-muted-soft/50 disabled:hover:bg-transparent ${
      active ? "text-ink" : "text-muted hover:text-ink"
    }`}
    title={title}
  >
    {children}
  </button>
);

interface OpenRecordingsButtonProps {
  onClick: () => void;
  label: string;
}

const OpenRecordingsButton: React.FC<OpenRecordingsButtonProps> = ({
  onClick,
  label,
}) => (
  <Button
    onClick={onClick}
    variant="secondary"
    size="sm"
    className="flex items-center gap-2"
    title={label}
  >
    <FolderOpen className="w-4 h-4" />
    <span>{label}</span>
  </Button>
);

/**
 * History — every dictation, newest first, with its audio, its transcript, and
 * (when AI cleanup ran) the text that was actually pasted.
 */
export const HistorySettings: React.FC = () => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { getSetting } = useSettings();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const loadingRef = useRef(false);

  // Keep ref in sync for use in IntersectionObserver callback
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const loadPage = useCallback(async (cursor?: number) => {
    const isFirstPage = cursor === undefined;
    if (!isFirstPage && loadingRef.current) return;
    loadingRef.current = true;

    if (isFirstPage) setLoading(true);

    try {
      const result = await commands.getHistoryEntries(
        cursor ?? null,
        PAGE_SIZE,
      );
      if (result.status === "ok") {
        const { entries: newEntries, has_more } = result.data;
        setEntries((prev) =>
          isFirstPage ? newEntries : [...prev, ...newEntries],
        );
        setHasMore(has_more);
      }
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Infinite scroll via IntersectionObserver (cursor = last entry id).
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const first = observerEntries[0];
        if (first.isIntersecting) {
          const lastEntry = entriesRef.current[entriesRef.current.length - 1];
          if (lastEntry) {
            loadPage(lastEntry.id);
          }
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadPage]);

  // Listen for new entries added from the transcription pipeline
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      if (payload.action === "added") {
        setEntries((prev) => [payload.entry, ...prev]);
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((e) => (e.id === payload.entry.id ? payload.entry : e)),
        );
      }
      // "deleted" and "toggled" are handled by optimistic updates only,
      // so we intentionally ignore them here to avoid double-mutation.
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Retention commands now clean recordings immediately. Refetch the first
  // page after cleanup so deleted rows disappear without an app restart.
  useEffect(() => {
    const unlisten = listen("history-retention-applied", () => {
      void loadPage();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadPage]);

  const toggleSaved = async (id: number) => {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
    );
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") {
        // Revert on failure
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
      // Revert on failure
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
      );
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const getAudioUrl = useCallback(
    async (fileName: string) => {
      try {
        const result = await commands.getAudioFilePath(fileName);
        if (result.status === "ok") {
          if (osType === "linux") {
            const fileData = await readFile(result.data);
            const blob = new Blob([fileData], { type: "audio/wav" });
            return URL.createObjectURL(blob);
          }
          return convertFileSrc(result.data, "asset");
        }
        return null;
      } catch (error) {
        console.error("Failed to get audio file path:", error);
        return null;
      }
    },
    [osType],
  );

  const deleteAudioEntry = async (id: number) => {
    // Optimistically remove
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") {
        // Reload on failure
        loadPage();
      }
    } catch (error) {
      console.error("Failed to delete entry:", error);
      loadPage();
    }
  };

  const retryHistoryEntry = async (id: number) => {
    const result = await commands.retryHistoryEntryTranscription(id);
    if (result.status !== "ok") {
      throw new Error(String(result.error));
    }
  };

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") {
        throw new Error(String(result.error));
      }
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className="px-4 py-3 text-center text-text/60">
        {t("settings.history.loading")}
      </div>
    );
  } else if (entries.length === 0) {
    content = (
      <div className="px-4 py-8 text-center text-sm text-muted">
        {t("settings.history.empty")}
      </div>
    );
  } else {
    content = (
      <>
        <div className="divide-y divide-hairline">
          {entries.map((entry) => (
            <HistoryEntryComponent
              key={entry.id}
              entry={entry}
              onToggleSaved={() => toggleSaved(entry.id)}
              onCopyText={() =>
                copyToClipboard(
                  entry.post_processed_text?.trim()
                    ? entry.post_processed_text
                    : entry.transcription_text,
                )
              }
              getAudioUrl={getAudioUrl}
              deleteAudio={deleteAudioEntry}
              retryTranscription={retryHistoryEntry}
            />
          ))}
        </div>
        <div ref={sentinelRef} className="h-1" />
      </>
    );
  }

  return (
    <div className="max-w-3xl w-full mx-auto space-y-8">
      <SectionHeader
        title={t("sidebar.history")}
        description={t("sectionSubtitles.history")}
      />
      {/* Storage settings live above the feed — with a long history the list
          scrolls forever, so anything below it is effectively unreachable. */}
      <SettingsGroup
        title={t("settings.history.storage.title")}
        description={t("settings.history.storage.description")}
      >
        <RecordingRetentionPeriodSelector
          descriptionMode="tooltip"
          grouped={true}
        />
        {getSetting("recording_retention_period") === "preserve_limit" && (
          <HistoryLimit descriptionMode="tooltip" grouped={true} />
        )}
      </SettingsGroup>
      <div className="space-y-2">
        <div className="flex items-center justify-end">
          <OpenRecordingsButton
            onClick={openRecordingsFolder}
            label={t("settings.history.openFolder")}
          />
        </div>
        <div className="bg-surface border border-hairline rounded-xl overflow-visible">
          {content}
        </div>
      </div>
    </div>
  );
};

interface HistoryEntryProps {
  entry: HistoryEntry;
  onToggleSaved: () => void;
  onCopyText: () => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
  retryTranscription: (id: number) => Promise<void>;
}

const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  onToggleSaved,
  onCopyText,
  getAudioUrl,
  deleteAudio,
  retryTranscription,
}) => {
  const { t, i18n } = useTranslation();
  const [showCopied, setShowCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const hasTranscription = entry.transcription_text.trim().length > 0;
  const processedText = entry.post_processed_text?.trim()
    ? entry.post_processed_text
    : null;
  const hasDistinctProcessedText =
    processedText !== null &&
    processedText.trim() !== entry.transcription_text.trim();
  /**
   * Cleanup ran and deliberately changed nothing.
   *
   * `post_processed_text` is present-but-identical in that case, and absent when
   * cleanup never ran, so the two are distinguishable — but the row used to
   * render them the same way, as a single block of text. With a restrained
   * cleanup model that returns already-correct dictation byte for byte (which is
   * the common case, and the point of a cleanup fine-tune) the feature looked
   * broken every time it worked perfectly.
   */
  const cleanupMadeNoChanges =
    processedText !== null && !hasDistinctProcessedText;
  const secondaryText = hasDistinctProcessedText ? processedText : null;
  const hasCopyableText = hasTranscription || secondaryText !== null;

  const handleLoadAudio = useCallback(
    () => getAudioUrl(entry.file_name),
    [getAudioUrl, entry.file_name],
  );

  const handleCopyText = () => {
    if (!hasCopyableText) {
      return;
    }

    onCopyText();
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      toast.error(t("settings.history.deleteError"));
    }
  };

  const handleRetranscribe = async () => {
    try {
      setRetrying(true);
      await retryTranscription(entry.id);
    } catch (error) {
      console.error("Failed to re-transcribe:", error);
      toast.error(t("settings.history.retranscribeError"));
    } finally {
      setRetrying(false);
    }
  };

  const formattedDate = formatDateTime(String(entry.timestamp), i18n.language);

  return (
    <div className="group px-4 py-3.5 flex flex-col gap-1.5">
      {/* An AI-cleaned dictation is two-part: what speech recognition heard
          first, then the final text that was pasted. */}
      <div className="space-y-2.5">
        {secondaryText && (
          <div className="text-[11px] font-medium text-muted">
            {t("settings.history.originalTranscriptionLabel")}
          </div>
        )}
        {retrying && (
          <style>{`
            @keyframes transcribe-pulse {
              0%, 100% { color: color-mix(in srgb, var(--color-text) 40%, transparent); }
              50% { color: color-mix(in srgb, var(--color-text) 90%, transparent); }
            }
          `}</style>
        )}
        <p
          className={`text-[13px] leading-relaxed ${
            retrying
              ? ""
              : hasTranscription
                ? "text-ink select-text cursor-text whitespace-pre-wrap break-words"
                : "text-muted-soft"
          }`}
          style={
            retrying
              ? { animation: "transcribe-pulse 3s ease-in-out infinite" }
              : undefined
          }
        >
          {retrying
            ? t("settings.history.transcribing")
            : hasTranscription
              ? entry.transcription_text
              : t("settings.history.transcriptionFailed")}
        </p>

        {secondaryText ? (
          <div className="rounded-lg border border-hairline bg-surface-strong/55 px-3 py-2.5">
            <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <Sparkles width={11} height={11} />
              {t("settings.history.finalTextLabel")}
            </div>
            <p className="select-text whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
              {secondaryText}
            </p>
          </div>
        ) : cleanupMadeNoChanges ? (
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <Sparkles width={11} height={11} />
            {t("settings.history.cleanupNoChanges")}
          </div>
        ) : null}
      </div>

      {/* Meta row — quiet caption on the left, actions surface on hover. */}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-medium text-ink/75">
            <Mic width={11} height={11} />
            {t("settings.history.recordingLabel")}
          </span>
          <span aria-hidden="true" className="text-muted-soft">
            ·
          </span>
          {formattedDate}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
          <IconButton
            onClick={handleCopyText}
            disabled={!hasCopyableText || retrying}
            title={t(
              secondaryText
                ? "settings.history.copyFinalText"
                : "settings.history.copyToClipboard",
            )}
          >
            {showCopied ? (
              <Check width={14} height={14} />
            ) : (
              <Copy width={14} height={14} />
            )}
          </IconButton>
          <IconButton
            onClick={onToggleSaved}
            disabled={retrying}
            active={entry.saved}
            title={
              entry.saved
                ? t("settings.history.unsave")
                : t("settings.history.save")
            }
          >
            <Star
              width={14}
              height={14}
              fill={entry.saved ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton
            onClick={handleRetranscribe}
            disabled={retrying}
            title={t("settings.history.retranscribe")}
          >
            <RotateCcw
              width={14}
              height={14}
              style={
                retrying
                  ? { animation: "spin 1s linear infinite reverse" }
                  : undefined
              }
            />
          </IconButton>
          <IconButton
            onClick={handleDeleteEntry}
            disabled={retrying}
            title={t("settings.history.delete")}
          >
            <Trash2 width={14} height={14} />
          </IconButton>
        </div>
      </div>

      <AudioPlayer onLoadRequest={handleLoadAudio} className="w-full" />
    </div>
  );
};
