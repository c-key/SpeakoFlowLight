import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type ModelInfo } from "@/bindings";
import { formatModelSize } from "@/lib/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { getModelBrand } from "../icons/BrandLogos";
import type { WelcomeCardPhase } from "./WelcomeChoiceCard";
import WelcomeChoiceCard from "./WelcomeChoiceCard";
import OnboardingLayout from "./OnboardingLayout";
import { Button } from "../ui/Button";
import { useModelStore } from "../../stores/modelStore";

/** Catalog id of our own cleanup fine-tune, mirrored from the backend. */
const SPEAKOFLOW_MINI_ID = "speakoflow-mini";

interface LlmOnboardingProps {
  /** Advance to the next step (whether a model was chosen or skipped). */
  onComplete: () => void;
}

/**
 * Step 2 of the welcome flow: "Add AI cleanup (optional)."
 *
 * One card: SpeakoFlow Mini, the small on-device model that tidies up a
 * dictation — punctuation, filler words, obvious mishearings. It is here for
 * discovery; otherwise the only route to the app's own model is knowing to go
 * looking for it in Settings.
 *
 * Upstream also offered two conversational Gemma models on this step, for the
 * assistant panel. This build has no assistant, so the step is a single choice.
 *
 * Tapping the card morphs it into a progress state in place and flips the
 * footer to "Continue" immediately: the download finishes in the background and
 * wires itself up when the weights land. "Skip for now" always stays.
 */
const LlmOnboarding: React.FC<LlmOnboardingProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const { refreshSettings } = useSettings();
  const {
    models,
    downloadModel,
    cancelDownload,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
  } = useModelStore();
  const [cleanupTaken, setCleanupTaken] = useState(false);

  const phaseFor = (modelId: string): WelcomeCardPhase => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    const m = models.find((x) => x.id === modelId);
    if (m?.is_downloaded) return "done";
    return "idle";
  };

  // Point cleanup at the model, then turn the feature on. Model first — the
  // reverse order would briefly enable a feature whose engine has nothing to
  // load. `setCleanupLocalModel` is one command on purpose: it also keeps the
  // selected cleanup prompt paired with the model, which two separate calls
  // could not do atomically.
  const handleChooseCleanup = async () => {
    const model = models.find((m: ModelInfo) => m.id === SPEAKOFLOW_MINI_ID);
    if (!model) return;
    setCleanupTaken(true);

    const enableCleanup = async () => {
      try {
        await commands.setCleanupLocalModel(SPEAKOFLOW_MINI_ID);
        await commands.changePostProcessEnabledSetting(true);
        await refreshSettings();
      } catch (err) {
        console.error("Failed to enable AI cleanup:", err);
      }
    };

    if (model.is_downloaded) {
      await enableCleanup();
      return;
    }

    const success = await downloadModel(SPEAKOFLOW_MINI_ID);
    if (success) {
      await enableCleanup();
    } else {
      setCleanupTaken(false);
    }
  };

  const handleCancelCleanup = async () => {
    const cancelled = await cancelDownload(SPEAKOFLOW_MINI_ID);
    if (cancelled) setCleanupTaken(false);
  };

  const cleanupCanBeCancelled =
    cleanupTaken && SPEAKOFLOW_MINI_ID in downloadingModels;

  const footer = (
    <>
      <p className="text-xs text-muted max-w-[55%]">
        {cleanupTaken
          ? t("onboarding.aiModel.downloadingHint")
          : t("onboarding.aiModel.skipHint")}
      </p>
      {cleanupTaken ? (
        <div className="flex items-center gap-2">
          {cleanupCanBeCancelled && (
            <Button
              variant="ghost"
              size="lg"
              onClick={() => void handleCancelCleanup()}
            >
              {t("modelSelector.cancelDownload")}
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={onComplete}>
            {t("onboarding.aiModel.continue")}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" size="lg" onClick={onComplete}>
          {t("onboarding.aiModel.skip")}
        </Button>
      )}
    </>
  );

  return (
    <OnboardingLayout
      step={2}
      totalSteps={3}
      title={t("onboarding.aiModel.title")}
      subtitle={t("onboarding.aiModel.subtitle")}
      footer={footer}
      showDownloadProgress={false}
    >
      {(() => {
        const mini = models.find((m: ModelInfo) => m.id === SPEAKOFLOW_MINI_ID);
        if (!mini) return null;
        const brand = getModelBrand(mini);
        return (
          <WelcomeChoiceCard
            key={SPEAKOFLOW_MINI_ID}
            icon={brand.icon}
            tileClassName={brand.tileClass}
            title={t("onboarding.cleanup.cardTitle")}
            description={t("onboarding.cleanup.cardDescription")}
            sizeLabel={formatModelSize(Number(mini.size_mb))}
            pill={t("onboarding.cleanup.pill")}
            badge={t("onboarding.cleanup.recommendedForDictation")}
            selected={cleanupTaken}
            disabled={cleanupTaken}
            phase={phaseFor(mini.id)}
            progress={downloadProgress[mini.id]?.percentage}
            actionLabel={
              mini.is_downloaded
                ? t("onboarding.cleanup.useDownloaded")
                : t("onboarding.cleanup.download")
            }
            onClick={() => {
              if (!cleanupTaken) void handleChooseCleanup();
            }}
          />
        );
      })()}
    </OnboardingLayout>
  );
};

export default LlmOnboarding;
