import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrainingConsentBannerProps {
  onAllow: () => void;
  onDismiss: () => void;
}

/**
 * Subtle, optional, cookie-banner-style prompt asking the user to opt in to
 * sharing their corrected segmentations for model training. Shown once
 * (gated by settings.trainingConsentPrompted). Default stays OFF — choosing
 * nothing / "Not now" leaves training-data sharing disabled.
 */
export function TrainingConsentBanner({ onAllow, onDismiss }: TrainingConsentBannerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] flex justify-center p-3 sm:justify-end sm:p-4">
      <div className="glass-card pointer-events-auto relative w-full max-w-md rounded-2xl border border-border/60 p-4 shadow-2xl">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 pr-4">
            <div className="text-sm font-semibold text-foreground">Help improve PointTracer?</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              When you correct an activity's segments, we can use those corrections and the
              activity's GPS track to train a better auto-segmenter. Optional — you can change
              this anytime in Settings.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" size="sm" className="h-8 text-xs" onClick={onAllow}>
                Allow
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={onDismiss}
              >
                Not now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
