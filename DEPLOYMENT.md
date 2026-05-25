# PointTracer Deployment Checklist

This app is now configured so the frontend and backend can be deployed separately.

## Frontend Environment

Set these in the frontend host, such as Vercel or Netlify:

```bash
VITE_API_BASE_URL=https://your-backend.example.com
VITE_MAPTILER_API_KEY=your-maptiler-api-key
```

`VITE_API_BASE_URL` is used by the upload and Strava import UI. For local development it falls back to `http://127.0.0.1:8000`.

## Backend Environment

Set these in the backend host, such as Render, Fly.io, or Railway:

```bash
STRAVA_CLIENT_ID=your-strava-client-id
STRAVA_CLIENT_SECRET=your-strava-client-secret
STRAVA_REDIRECT_URI=https://your-backend.example.com/api/strava/callback
POINTTRACER_FRONTEND_URL=https://your-frontend.example.com
POINTTRACER_CORS_ORIGINS=https://your-frontend.example.com
STRAVA_TOKEN_DB_PATH=/persistent/path/strava_tokens.sqlite3
```

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

## Strava Production Setup

In the Strava app dashboard:

- Set the authorization callback domain to your backend domain.
- Set `STRAVA_REDIRECT_URI` to the deployed callback URL.
- Keep `STRAVA_CLIENT_SECRET` backend-only.

The current Strava token store is local SQLite. That is acceptable for a first hosted demo only if the host has persistent disk. Before a broader public launch, move token storage to a managed database and encrypt tokens at rest.

## Pre-Launch Smoke Test

1. Open `/api/health` on the backend.
2. Open the frontend and upload a GPX/FIT file.
3. Connect Strava and import one activity.
4. Confirm MapTiler tiles load in street, satellite, and dark styles.
5. Confirm export opens without local-only URLs in the console.
