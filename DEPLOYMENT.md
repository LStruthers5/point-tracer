# PointTracer Deployment Checklist

This app is now configured so the frontend and backend can be deployed separately.

## Frontend Environment

Set these in the frontend host, such as Vercel or Netlify:

```bash
VITE_API_BASE_URL=https://your-backend.example.com
VITE_MAPTILER_API_KEY=your-maptiler-api-key
# Public default: keep Strava OAuth/import UI hidden. Set to true only on the private tester frontend.
VITE_ENABLE_STRAVA_IMPORT=false
# Optional — product analytics (PostHog). Omit to disable analytics entirely.
VITE_PUBLIC_POSTHOG_KEY=phc_your_project_key
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

`VITE_API_BASE_URL` is used by upload and optional private Strava import UI. For local development it falls back to `http://127.0.0.1:8000`. `VITE_ENABLE_STRAVA_IMPORT` must be `true` before any Strava connection controls are rendered.

Product analytics (PostHog) only runs when `VITE_PUBLIC_POSTHOG_KEY` is set — leave it unset for local dev or any deploy where you don't want analytics. Autocapture is off; only explicit feature events are sent, never GPS data. Opt-in segmentation-correction training data is separate (backend `POINTTRACER_TRAINING_DB_PATH`) and only sent when the user enables "Help improve auto-segmentation" in Settings.

## Backend Environment

Set these in the backend host, such as Render, Fly.io, or Railway:

```bash
POINTTRACER_FRONTEND_URL=https://your-frontend.example.com
POINTTRACER_CORS_ORIGINS=https://your-frontend.example.com
# Postgres connection string — persists invite-link sessions + opt-in training data.
# On Railway, add a PostgreSQL service and reference it: DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_URL=postgresql://user:pass@host:5432/dbname
# Strava stays OFF for public v1 — this gate keeps OAuth/import routes closed.
POINTTRACER_ENABLE_STRAVA_IMPORT=false
# Private tester build only: set this to true and fill in STRAVA_* below.
# STRAVA_CLIENT_ID=...
# STRAVA_CLIENT_SECRET=...
# STRAVA_REDIRECT_URI=https://your-backend.example.com/api/strava/callback
# STRAVA_WEBHOOK_VERIFY_TOKEN=...
```

**Persistence:** invite-link group sessions and opt-in segmentation training data are stored via `DATABASE_URL` (Postgres) in production — this survives redeploys with **no volume to manage**. If `DATABASE_URL` is unset (local dev), the app falls back to a single local SQLite file. Tables are created automatically on first use; there are no migrations to run.

For local development, copy `backend/.env.example` to `backend/.env` and fill in local values (leave `DATABASE_URL` unset to use local SQLite). `backend/.env` is ignored by git.

## Build Commands

Frontend:

```bash
bun install
bun run build
```

Backend:

```bash
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

Most hosts provide their own `$PORT`. Use that platform's equivalent of:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend
```

Railway note: use the root `Dockerfile` for the backend service and leave the custom start command blank. The Dockerfile installs `backend/requirements.txt` and starts the FastAPI app with:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

For Railway public networking, set the generated service domain target port to `8000`.

## Private Strava Tester Setup

The public production build should keep both Strava gates disabled:

- Frontend: `VITE_ENABLE_STRAVA_IMPORT=false`
- Backend: `POINTTRACER_ENABLE_STRAVA_IMPORT=false`

For a private tester build, enable both gates and configure the Strava app dashboard:

- Set the authorization callback domain to your backend domain.
- Set `STRAVA_REDIRECT_URI` to the deployed callback URL.
- Keep `STRAVA_CLIENT_SECRET` backend-only.

The current Strava token store is still single-row local SQLite. That is acceptable only for an owner/private tester build where you control who can access it. Before a broader public Strava launch, move to per-user token storage and encrypt tokens at rest.

## CORS — the #1 deploy-day gotcha

The frontend (Vercel) and backend (Railway) live on different domains. The browser
will **silently block** every API response unless the backend explicitly names the
frontend's origin in its `Access-Control-Allow-Origin` header. This never shows up
in local dev (localhost is pre-allowed), so it is the classic "worked on my machine,
dead in production" failure. Symptom: uploads/imports fail with `Failed to fetch` or
a console error naming a blocked origin, even though the backend ran fine.

The backend reads the allowlist from env vars (`backend/app/main.py` → `get_cors_origins`).
To make deploy-day mechanical:

- [ ] **Railway:** set `POINTTRACER_FRONTEND_URL` to the exact production frontend URL
      — `https://point-tracer.vercel.app`. No trailing slash, `https://`, exact subdomain.
- [ ] **Vercel:** set `VITE_API_BASE_URL` to the exact backend URL
      — `https://<your-app>.up.railway.app`. No trailing slash.
- [ ] **Redeploy both.** Vite bakes env vars in at build time, so the frontend must
      rebuild for `VITE_API_BASE_URL` to take effect — a backend-only redeploy is not enough.
- [ ] Origins must match **exactly** (scheme + host, no path, no trailing slash).
      `http` vs `https` or a stray `/` will fail the match.

Gotchas:

- **Do not use `allow_origins=["*"]`.** The backend sends `allow_credentials=True`, and the
  CORS spec forbids the wildcard with credentials. The current code uses an explicit
  allowlist — keep it that way; do not "simplify" to `*`.
- **Vercel preview deployments** get unique URLs (`point-tracer-git-<branch>-<user>.vercel.app`)
  that will not match the production origin. For launch, pin the production domain only.
  To allow previews too, add them comma-separated to `POINTTRACER_CORS_ORIGINS`.

Verify it works (do not trust it blind): open the live site, do a real upload, and watch
DevTools → Network. A CORS failure shows the request blocked/red with the offending origin
in the console. A 200 with rendered segments means CORS is correct.

## Pre-Launch Smoke Test

1. Open `/api/health` on the backend.
2. Open the frontend and upload a GPX/FIT file.
3. Upload one GPX/FIT file.
4. On private tester builds only, connect Strava and import one activity.
4. Confirm MapTiler tiles load in street, satellite, and dark styles.
5. Confirm export opens without local-only URLs in the console.
6. In DevTools → Network, confirm no CORS-blocked requests (see CORS section above).
