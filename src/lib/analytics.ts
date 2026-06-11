import posthog from "posthog-js";

/**
 * Lightweight product-analytics wrapper around PostHog.
 *
 * - No-ops entirely unless VITE_PUBLIC_POSTHOG_KEY is set, so local dev and
 *   any deploy without a key capture nothing.
 * - Client-only (guards `window`), since the app is server-rendered.
 * - Autocapture is OFF — we only send the explicit events below, so no DOM
 *   text / form values are ever captured. GPS data is never sent here.
 */

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let enabled = false;

export function initAnalytics(): void {
  if (enabled || typeof window === "undefined" || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    autocapture: false,
    capture_performance: false,
    person_profiles: "identified_only",
  });
  enabled = true;
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!enabled) return;
  posthog.capture(event, properties);
}

/** Stop capturing (e.g. user opts out). */
export function optOutAnalytics(): void {
  if (!enabled) return;
  posthog.opt_out_capturing();
}

export function optInAnalytics(): void {
  if (!enabled) return;
  posthog.opt_in_capturing();
}
