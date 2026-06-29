# Strava Setup

PointTracer supports Strava OAuth import for private tester builds. Public
deployments should keep Strava disabled so the connection UI and import routes
are not exposed.

## Create a Strava API Application

1. Go to https://www.strava.com/settings/api and create an application.
2. Set **Authorization Callback Domain** to your backend domain
   (e.g. `your-app.up.railway.app` for Railway, or `127.0.0.1` for local dev).
3. Copy the **Client ID** and **Client Secret**.

## Required Environment Variables

Set these on your backend host (Railway, Render, etc.) or in `backend/.env` for local dev:

| Variable | Description |
|---|---|
| `POINTTRACER_ENABLE_STRAVA_IMPORT` | Must be `true` to open Strava OAuth/import backend routes |
| `STRAVA_CLIENT_ID` | Numeric client ID from the Strava API settings page |
| `STRAVA_CLIENT_SECRET` | Secret from the Strava API settings page |
| `STRAVA_REDIRECT_URI` | Full URL of your backend callback, e.g. `https://your-app.up.railway.app/api/strava/callback` |
| `POINTTRACER_FRONTEND_URL` | Your Vercel frontend URL — used for post-OAuth redirect |
| `POINTTRACER_CORS_ORIGINS` | Comma-separated frontend origin(s), same as above |
| `STRAVA_TOKEN_DB_PATH` | Writable path for the SQLite token file, e.g. `/data/strava_tokens.sqlite3` |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | A random secret you choose; used when subscribing to Strava webhooks (optional) |

Also set `VITE_ENABLE_STRAVA_IMPORT=true` on the matching frontend build. Leave both gates false for the public app.

## Local Dev Setup

```bash
cp backend/.env.example backend/.env
# Fill in STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and set:
# POINTTRACER_ENABLE_STRAVA_IMPORT=true
# STRAVA_REDIRECT_URI=http://127.0.0.1:8000/api/strava/callback
# POINTTRACER_FRONTEND_URL=http://localhost:5173
```

Set `VITE_ENABLE_STRAVA_IMPORT=true` in the frontend `.env`, start the backend on port 8000, then click "Connect Strava" in the UI.

## Webhook Setup (optional but recommended)

Strava requires a webhook subscription to be notified when an athlete deauthorizes
your app. Without it, stale tokens persist until they expire.

1. Set `STRAVA_WEBHOOK_VERIFY_TOKEN` to any random string.
2. Deploy the backend so `/api/strava/webhook` is publicly reachable.
3. Subscribe using the Strava API:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://your-backend.example.com/api/strava/webhook \
  -F verify_token=YOUR_WEBHOOK_VERIFY_TOKEN
```

4. Strava will send a GET to your endpoint to verify; the backend echoes `hub.challenge`
   automatically. On success, Strava returns a subscription ID — store it somewhere.
5. To view or delete your subscription: https://developers.strava.com/docs/webhooks/

## Known Limitations

The token store is a single-row SQLite file (`id = 1`). Only one Strava account
can be connected at a time. For a public deployment where multiple users need
their own Strava access, see [STRAVA_PUBLIC_BETA.md](STRAVA_PUBLIC_BETA.md).
