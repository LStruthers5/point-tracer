# Per-User Strava Auth — Design Spec & API-Approval Roadmap

Status: **planned** (post-launch). Launch v1 ships with Strava **off** (env vars unset →
the Connect button hides). This spec is the roadmap for turning Strava on *safely* for a
public, multi-user app, and getting Strava's API approval to scale past 10 athletes.

## Why this is required

The current Strava integration stores **one global token** (`strava.py`: `persist_token`
writes a hardcoded `id = 1` row; `_token` is a module-level global). There is no per-visitor
identity. Consequences on a public deploy:

- Whoever connects **last** overwrites everyone else's connection.
- A visitor who never connected sees the **last connected athlete's** profile/activities,
  because the backend can't tell visitors apart.
- `disconnect` wipes the single token for everyone.

This is also **disqualifying for Strava API approval** — Strava requires each athlete to
individually authorize, with their data isolated to them. So per-user auth isn't just a
feature; it's a prerequisite for both a safe public launch *and* approval.

## Chosen approach (decided 2026-06-10)

- **Identity = "Sign in with Strava."** The `athlete_id` from the OAuth token is a stable,
  unique per-user key. No separate email/password system needed — connecting Strava *is*
  logging in.
- **Cookie-based sessions** (not bearer tokens), because the deploy will use a **shared
  parent domain** (e.g. `app.pointtracer.com` + `api.pointtracer.com`). On the same parent
  domain the session cookie is first-party, so it works everywhere including Safari/iOS —
  the cross-domain third-party-cookie problem disappears.

> If the custom domain is ever dropped (back to `vercel.app` + `railway.app`), switch to a
> bearer-token scheme instead — third-party cookies are blocked by Safari/iOS and the
> cookie approach will silently fail on phones.

## Architecture

```
First visit            → backend sets HttpOnly session cookie (opaque session id)
"Sign in with Strava"  → /api/strava/connect builds auth URL with state = session id
Strava redirect back   → /api/strava/callback validates state, exchanges code,
                          stores tokens keyed by athlete_id, links session → athlete
Any API call           → backend reads session cookie → that user's athlete → their token
```

### Backend changes (`strava.py` + `main.py`)

1. **Sessions table**: `sessions(session_id PK, athlete_id, created_at, last_seen)`.
   Issue an opaque `session_id` (HttpOnly, Secure, SameSite=Lax) cookie on first request.
2. **Re-key tokens**: replace the single `id = 1` row with `strava_tokens(athlete_id PK,
   access_token, refresh_token, expires_at, scope, athlete_json, updated_at)`. Remove the
   module-level `_token` global; load per request.
3. **OAuth `state`**: put the session id (signed/random) in the `state` param on connect;
   validate it in the callback (also closes the current CSRF gap).
4. **Per-request lookup**: `status`, `activities`, `import`, `disconnect` resolve the
   session cookie → athlete_id → that athlete's token only. `disconnect` deletes just that
   athlete's row + unlinks the session.
5. **Per-user token refresh**: the refresh path keys off the requesting athlete, not a global.
6. **Deauthorization webhook** already exists — confirm it deletes the correct athlete's row
   on an `aspect_type=update, authorized=false` event.

### Frontend changes

1. All Strava fetches use `credentials: "include"` so the cookie rides along.
2. CORS: keep `allow_credentials=True` with the **exact** origin (never `*`).
3. UI: "Sign in with Strava" entry point; signed-in state shows the athlete; sign-out hits
   `disconnect`.

### Deploy

- Custom domain: frontend `app.…`, backend `api.…` under one registrable parent domain.
- Cookie attributes: `Secure; HttpOnly; SameSite=Lax` (Lax is fine since both are same-site).
- Session + token SQLite (or Postgres) on the **persistent Railway volume** (same volume as
  the group-session store).

## Strava API approval roadmap

Strava access tiers:

| Tier | Athlete cap | How |
|---|---|---|
| Single Player | 1 | default |
| Tier 1 | 10 | self-serve toggle in the Strava app settings (you're here) |
| Tier 2+ | more | **requires Strava's formal app review** |

To request approval to scale past 10 athletes, Strava will look for:

- [ ] **Per-user authorization** — each athlete connects their own account (this spec). ✅ once built
- [ ] **Brand compliance** — "Powered by Strava" / "Compatible with Strava" marks, correct
      logo usage, "View on Strava" links where activities are shown. (Attribution already in app.)
- [ ] **Deauthorization handling** — webhook that removes data when an athlete disconnects. ✅ built
- [ ] **Rate-limit compliance** — respect 200 req / 15 min and 2,000 / day (app-wide). ✅ handled
- [ ] **Data handling** — store only what's needed, don't expose tokens to the frontend,
      a public **privacy policy** describing what you collect and why. (Tokens already
      backend-only; privacy policy still TODO.)
- [ ] **Clear app description + screenshots** of the niche use case (point-based / court sports
      analysis) for the review submission.

You can **launch and operate within the 10-athlete Tier-1 cap while preparing the review** —
build per-user auth, onboard up to 10 real athletes, then submit for higher limits with a
working, compliant app to show.

## Gotchas to remember

- **10-athlete cap gates real multi-user until approved** — your code can be perfect and
  you'll still be limited to 10 connected athletes until Strava approves a higher tier.
- **Rate limits are app-wide**, shared across all your users — a real constraint as you grow.
- **ML training on Strava-sourced data** — using athlete data obtained via the Strava API to
  train/improve a model may be restricted by Strava's API agreement. Safest: train the
  segmentation model on data from **direct file uploads** (the user's own GPX/FIT, with
  consent), and treat Strava-API-sourced data as serve-this-athlete-only unless Strava's
  current terms clearly permit otherwise. Verify against the live API agreement before
  training on any Strava-derived data.

## Build order (when picked up)

1. Sessions table + cookie middleware (no Strava yet) — prove identity round-trips.
2. Re-key token storage off `id = 1`; remove the global.
3. OAuth `state` + callback wiring to link session → athlete.
4. Per-request token lookup in all Strava endpoints; per-user refresh + disconnect.
5. Frontend `credentials: "include"` + signed-in UI.
6. Privacy policy page; deploy on custom domain with persistent volume.
7. Onboard ≤10 athletes, then submit the Strava app-review request.
