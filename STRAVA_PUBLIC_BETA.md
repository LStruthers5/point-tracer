# Strava Public Beta Readiness

Reference for launching PointTracer with Strava integration under the 2026
Strava API Agreement. All rules are drawn from the official Strava developer
docs and API Agreement (effective June 1, 2026).

## Athlete Capacity Tiers

| Tier | Athletes | How to get it |
|---|---|---|
| **Single Player Mode** (default) | 1 — only the app owner's own account | Automatic for all new Strava API apps |
| **Up to 10 athletes** | 10 | Self-service: fill out the Developer Program form (link below) |
| **Beyond 10 athletes** | Negotiated | Submit an app review — not guaranteed, no SLA |

**Current PointTracer status:** The token store holds a single row (`id = 1`),
so only one Strava account can be connected at a time regardless of Strava's
tier. This matches Single Player Mode by design. Expanding to multiple users
requires a multi-token store and a successful tier-2 review.

## Rate Limits (2026)

| Window | Default read | Tier 1 read |
|---|---|---|
| 15-minute | 100 requests | 200 requests |
| Daily | 1,000 requests | 2,000 requests |

Windows reset at :00, :15, :30, :45 UTC (15-min) and midnight UTC (daily).
Strava returns `HTTP 429` when limits are exceeded — PointTracer surfaces this
as "Strava rate limit reached. Too many requests — try again in a few minutes."

The rate-limit headers on every Strava response are:
`X-RateLimit-Limit`, `X-RateLimit-Usage`, `X-ReadRateLimit-Limit`, `X-ReadRateLimit-Usage`.

## What Luke Needs to Do Before Public Beta

### Step 1 — Upgrade to 10 athletes (self-service)
1. Log in to https://www.strava.com/settings/api.
2. Click "Apply to become a Strava Developer" or find the Developer Program link.
3. Fill out the form at https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8
4. Strava grants up to 10 connected athletes without a manual review.

### Step 2 — Strava dashboard settings
- **Authorization Callback Domain**: must match your production backend domain exactly.
- **App icon and description**: fill these in — they appear on the Strava OAuth consent page.
- Do **not** use the Strava name or logo as your app icon.

### Step 3 — Screenshots for review (if you apply beyond 10 athletes)
Strava requires screenshots showing every place Strava data is displayed:
- The activity picker (list of recent activities)
- The map view with an imported Strava activity loaded
- The "Connect with Strava" entry point

### Step 4 — Branding compliance checklist
- [x] Button uses amber/orange color consistent with Strava brand (#FC5200)
- [x] "Powered by Strava" attribution shown in the activity picker
- [ ] Consider using the official "Connect with Strava" button asset from https://developers.strava.com/guidelines/ (the orange SVG badge at 48 px height) instead of the current custom button
- [ ] Add "View on Strava" links (bold/orange) on any imported activity details if you ever show a link back to Strava

### Step 5 — Set up webhook subscription
Required by the API Agreement to receive deauthorization events. See
[STRAVA_SETUP.md](STRAVA_SETUP.md) for the one-time `curl` command.

## Data Privacy Requirements

From the Strava API Agreement:
> "Strava Data provided by a specific user can only be displayed or disclosed
> in your Developer Application to that user."

PointTracer is compliant:
- Tokens are stored backend-only; never exposed to the browser.
- Each imported activity is returned only to the requesting user's session.
- The token store holds only one athlete at a time — no cross-user data exposure is possible.

If you expand to multi-user: each user must only see their own Strava data.
Sharing imported GPS data between users (e.g. multiplayer replay) is only
safe when the data comes from the user's own file upload, not from Strava.

## What NOT to Do

- Do not train ML models on Strava API data.
- Do not display one athlete's Strava data to a different user.
- Do not store Strava data beyond what is needed for the current session
  (PointTracer processes it in-flight and returns SessionData; no Strava
  raw data is persisted ✓).
- Do not scrape public Strava pages.
- Do not reuse the PointTracer API credentials for any other application.

## On a Stale Token After Deauthorization

Without a webhook subscription, if an athlete deauthorizes PointTracer on
Strava's side the token persists in the SQLite store until the next refresh
attempt fails (Strava returns 401). The backend already handles this cleanly —
`refresh_token` raises `StravaAuthError`, which shows "Strava authorization
expired. Please reconnect Strava." in the UI.

With a webhook subscription the token is cleared immediately on deauthorization.
