# PointTracer Public Launch Prep — Progress Tracker

Overnight autonomous run, branch `launch/public-launch-prep`. One phase per loop iteration.

## Phase status

- [x] **Phase A — Fresh-user default state** (verified 2026-06-10, iteration 1)
  - App starts with `data = null` → clean upload state (commit d4a0ce3 upstream already did this).
  - Personal `public/data/session.json` deleted upstream; `public/` now only has `placeholder.svg`.
  - localStorage keys (`pointtracer.settings.v1`, `pointtracer.activityLibrary.v1`, segment column settings) all default empty/sane for new browsers.
  - No demo-data auto-load exists; nothing to gate.
  - ⚠️ FLAG (user decision, not changed): `segmenter_fixtures/frisbee/*/source.gpx` and `backend/debug_reports/` contain personal GPS traces committed to the public repo. Not served by the app, but visible to anyone browsing GitHub.
- [ ] **Phase B — Upload/import reliability** (GPX/FIT upload paths, file size limits, multiplayer Add Player, error message readability in UploadPanel/MultiPlayerPanel)
- [ ] **Phase C — Strava readiness** (frontend controls → VITE_API_BASE_URL, backend env-var-only config, error states, no secret exposure, amber branding)
- [ ] **Phase D — Production env readiness** (vercel.json, Dockerfile, health endpoint, CORS, localhost fallbacks, .env.example files)
- [ ] **Phase E — Local activity library/autosave** (upload autosave, boundary-edit autosave, multiplayer session autosave/reopen, map element + display prefs restore)
- [ ] **Phase F — Smoke test** (production build, typecheck/lint, run backend + frontend, exercise core flows where possible headlessly)
- [ ] **Phase G — UX polish** (error state readability, button legibility light/dark, controls not hidden by map)
- [ ] **Phase H — Docs** (README launch/deploy section: local dev, Vercel, Railway, env vars, v1 limitations)
- [ ] **Final summary** (files changed, blockers fixed, workflows verified, env vars, limitations, local commands, production checks) → then end loop

## Notes for next iteration

- Backend upload limit is 10 MB (`MAX_FILE_SIZE_BYTES` in backend/app/main.py:53) — check frontend mirrors this and that error surfaces readably.
- API base: `src/components/UploadPanel.tsx:24` uses `VITE_API_BASE_URL` with 127.0.0.1:8000 dev fallback — check all other fetch sites (MultiPlayerPanel, Strava controls) use the same constant.
- Backend CORS merges defaults + `POINTTRACER_CORS_ORIGINS` + `POINTTRACER_FRONTEND_URL` (backend/app/main.py:17-34). Health endpoint exists at `/api/health`.
- DEPLOYMENT.md already covers most of Phase D/H; README may not.
