import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type ModelInfo } from "@/bindings";
import { formatModelSize } from "@/lib/utils/format";
import {
  getTranslatedModelDescription,
  getTranslatedModelName,
} from "@/lib/utils/modelTranslation";
import { useSettings } from "@/hooks/useSettings";
import { getModelBrand } from "../icons/BrandLogos";
import type { WelcomeCardPhase } from "./WelcomeChoiceCard";
import WelcomeChoiceCard from "./WelcomeChoiceCard";
import OnboardingLayout from "./OnboardingLayout";
import { Button } from "../ui/Button";
import { useModelStore } from "../../stores/modelStore";

/** Catalog id of our own cleanup fine-tune, mirrored from the backend. */
const SPEAKOFLOW_MINI_ID = "speakoflow-mini";

/**
 * The cleanup models offered here, mirroring the curated shortlist in
 * Settings → Dictation → AI cleanup. Ours first, because it is the
 * recommendation; the two small Gemma models follow for anyone who would rather
 * run a general model.
 *
 * Anything larger is deliberately absent: cleanup runs after every dictation,
 * so latency matters more than capability, and a multi-gigabyte first-run
 * download is a poor default. The full catalog stays one click away in
 * Settings.
 */
const CLEANUP_CHOICES = [SPEAKOFLOW_MINI_ID, "gemma-3-1b", "gemma-4-e2b"];

interface LlmOnboardingProps {
  /** Advance to the next step (whether a model was chosen or skipped). */
  onComplete: () => void;
}

/**
 * Step 2 of the welcome flow: "Add AI cleanup (optional)."
 *
 * Cleanup tidies up a dictation — punctuation, filler words, obvious
 * mishearings. The step exists for discovery; otherwise the only route to a
 * cleanup model is knowing to go looking for one in Settings.
 *
 * Upstream's version of this step offered two conversational Gemma models for
 * the assistant panel. This build has no assistant, so every card here is a
 * cleanup model, and picking one wires it up as the cleanup engine.
 *
 * Tapping a card morphs it into a progress state in place and flips the footer
 * to "Continue" immediately: the download finishes in the background and wires
 * itself up when the weights land. "Skip for now" always stays.
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
  // Which model this step is committed to, if any. One slot rather than a flag
  // per card: starting a second download would leave the user unable to tell
  // which model cleanup is actually going to use.
  const [takenId, setTakenId] = useState<string | null>(null);

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
  const handleChooseCleanup = async (modelId: string) => {
    const model = models.find((m: ModelInfo) => m.id === modelId);
    if (!model) return;
    setTakenId(modelId);

    const enableCleanup = async () => {
      try {
        await commands.setCleanupLocalModel(modelId);
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

    const success = await downloadModel(modelId);
    if (success) {
      await enableCleanup();
    } else {
      setTakenId(null);
    }
  };

  const handleCancelCleanup = async (modelId: string) => {
    const cancelled = await cancelDownload(modelId);
    if (cancelled) setTakenId(null);
  };

  const cleanupCanBeCancelled = !!takenId && takenId in downloadingModels;

  const footer = (
    <>
      <p className="text-xs text-muted max-w-[55%]">
        {takenId
          ? t("onboarding.aiModel.downloadingHint")
          : t("onboarding.aiModel.skipHint")}
      </p>
      {takenId ? (
        <div className="flex items-center gap-2">
          {cleanupCanBeCancelled && (
            <Button
              variant="ghost"
              size="lg"
              onClick={() => void handleCancelCleanup(takenId)}
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
      {CLEANUP_CHOICES.flatMap((modelId) => {
        const model = models.find((m: ModelInfo) => m.id === modelId);
        // A model the catalog doesn't carry is not an error worth showing —
        // the card simply isn't offered.
        if (!model) return [];
        const brand = getModelBrand(model);
        const isMini = modelId === SPEAKOFLOW_MINI_ID;
        return [
          <WelcomeChoiceCard
            key={modelId}
            icon={brand.icon}
            tileClassName={brand.tileClass}
            // Ours gets the hand-written pitch. A catalog model keeps the name
            // and description the Models page shows, so the two screens don't
            // describe the same download differently.
            title={
              isMini
                ? t("onboarding.cleanup.cardTitle")
                : getTranslatedModelName(model, t)
            }
            description={
              isMini
                ? t("onboarding.cleanup.cardDescription")
                : getTranslatedModelDescription(model, t)
            }
            sizeLabel={formatModelSize(Number(model.size_mb))}
            pill={t("onboarding.cleanup.pill")}
            badge={
              isMini
                ? t("onboarding.cleanup.recommendedForDictation")
                : undefined
            }
            selected={takenId === modelId}
            // Once a choice is made the others stop being actionable rather
            // than disappearing: the user can still see what they passed over.
            disabled={takenId !== null}
            phase={phaseFor(model.id)}
            progress={downloadProgress[model.id]?.percentage}
            actionLabel={
              model.is_downloaded
                ? t("onboarding.cleanup.useDownloaded")
                : t("onboarding.cleanup.download")
            }
            onClick={() => {
              if (takenId === null) void handleChooseCleanup(modelId);
            }}
          />,
        ];
      })}
    </OnboardingLayout>
  );
};

export default LlmOnboarding;
