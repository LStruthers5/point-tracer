# PointTracer Deployment Checklist

This app is now configured so the frontend and backend can be deployed separately.

## Frontend Environment

Set these in the frontend host, such as Vercel or Netlify:

```bash
VITE_API_BASE_URL=https://your-backend.example.com
VITE_MAPTILER_API_KEY=your-maptiler-api-key
# Optional — product analytics (PostHog). Omit to disable analytics entirely.
VITE_PUBLIC_POSTHOG_KEY=phc_your_project_key
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

`VITE_API_BASE_URL` is used by the upload and Strava import UI. For local development it falls back to `http://127.0.0.1:8000`.

Product analytics (PostHog) only runs when `VITE_PUBLIC_POSTHOG_KEY` is set — leave it unset for local dev or any deploy where you don't want analytics. Autocapture is off; only explicit feature events are sent, never GPS data. Opt-in segmentation-correction training data is separate (backend `POINTTRACER_TRAINING_DB_PATH`) and only sent when the user enables "Help improve auto-segmentation" in Settings.

## Backend Environment

Set these in the backend host, such as Render, Fly.io, or Railway:

```bash
STRAVA_CLIENT_ID=your-strava-client-id
STRAVA_CLIENT_SECRET=your-strava-client-secret
STRAVA_REDIRECT_URI=https://your-backend.example.com/api/strava/callback
POINTTRACER_FRONTEND_URL=https://your-frontend.example.com
POINTTRACER_CORS_ORIGINS=https://your-frontend.example.com
STRAVA_TOKEN_DB_PATH=/persistent/path/strava_tokens.sqlite3
POINTTRACER_GROUP_DB_PATH=/persistent/path/group_sessions.sqlite3
```

`POINTTRACER_GROUP_DB_PATH` stores multiplayer invite-link sessions (SQLite, auto-expires after 30 days). Point it at a persistent disk so invite links survive restarts; if omitted it defaults next to the backend package.

For local development, copy `backend/.env.example` to `backend/.env` and fill in local values. `backend/.env` is ignored by git.

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

## Strava Production Setup

In the Strava app dashboard:

- Set the authorization callback domain to your backend domain.
- Set `STRAVA_REDIRECT_URI` to the deployed callback URL.
- Keep `STRAVA_CLIENT_SECRET` backend-only.

The current Strava token store is local SQLite. That is acceptable for a first hosted demo only if the host has persistent disk. Before a broader public launch, move token storage to a managed database and encrypt tokens at rest.

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
3. Connect Strava and import one activity.
4. Confirm MapTiler tiles load in street, satellite, and dark styles.
5. Confirm export opens without local-only URLs in the console.
6. In DevTools → Network, confirm no CORS-blocked requests (see CORS section above).
