# PointTracer Public Launch Prep — Progress Tracker

Overnight autonomous run, branch `launch/public-launch-prep`. One phase per loop iteration.

## Phase status

- [x] **Phase A — Fresh-user default state** (verified 2026-06-10, iteration 1)
  - App starts with `data = null` → clean upload state (commit d4a0ce3 upstream already did this).
  - Personal `public/data/session.json` deleted upstream; `public/` now only has `placeholder.svg`.
  - localStorage keys (`pointtracer.settings.v1`, `pointtracer.activityLibrary.v1`, segment column settings) all default empty/sane for new browsers.
  - No demo-data auto-load exists; nothing to gate.
  - ⚠️ FLAG (user decision, not changed): `segmenter_fixtures/frisbee/*/source.gpx` and `backend/debug_reports/` contain personal GPS traces committed to the public repo. Not served by the app, but visible to anyone browsing GitHub.
- [x] **Phase B — Upload/import reliability** (verified 2026-06-10, iteration 2)
  - Live-tested against local backend: `/api/health` OK; GPX upload of Manual_Disc_2 → 200 with 13 segments / 1225 points.
  - Backend error responses already readable: bad extension, empty file, >10 MB (413) all return clear `detail` strings; frontend `readError()` surfaces them.
  - FIT upload: no .fit sample in repo — parser (`parse_fit_bytes` + garmin-fit-sdk) code-reviewed only. Flag for manual test with a real FIT file before launch.
  - ⚠️ FINDING: multiplayer "Add player" does NOT exist — `MultiPlayerPanel.tsx` is a "Coming next" placeholder. Goes in known limitations; nothing to fix.
  - FIXED: client-side 10 MB size check in UploadPanel (was uploading the whole file before failing).
  - FIXED: network failures ("Failed to fetch") now show "Could not reach the PointTracer server…" via `fetchOrExplain` on upload/Strava list/import/disconnect.
  - CORS preflight verified working for localhost:5173 origin.
  - Note: shell default node is v10; use bun or `~/.nvm/versions/node/v22.22.2/bin` for frontend tooling.
- [ ] **Phase C — Strava readiness** (frontend controls → VITE_API_BASE_URL, backend env-var-only config, error states, no secret exposure, amber branding)
- [ ] **Phase D — Production env readiness** (vercel.json, Dockerfile, health endpoint, CORS, localhost fallbacks, .env.example files)
- [ ] **Phase E — Local activity library/autosave** (upload autosave, boundary-edit autosave, multiplayer session autosave/reopen, map element + display prefs restore)
- [ ] **Phase F — Smoke test** (production build, typecheck/lint, run backend + frontend, exercise core flows where possible headlessly)
- [ ] **Phase G — UX polish** (error state readability, button legibility light/dark, controls not hidden by map)
- [ ] **Phase H — Docs** (README launch/deploy section: local dev, Vercel, Railway, env vars, v1 limitations)
- [ ] **Final summary** (files changed, blockers fixed, workflows verified, env vars, limitations, local commands, production checks) → post summary, then check stretch goal
- [ ] **STRETCH (only if A–H + summary done): sports field/court template overlays**
  - Real-proportion templates added via the existing Add element flow; user can move/rotate/resize uniformly; template-specific internal markings; zoom-stable sizing; persist with existing map element persistence; frontend only.
  - Priority order: 1) tennis court (78 ft × 36 ft doubles, singles sidelines, service boxes, net), 2) ultimate field (~100 m × 37 m with end zones), 3) soccer (configurable default), 4) pickleball 44×20 ft / basketball / squash 9.75×6.4 m only if trivial.
  - Implementation: extend `src/types/map-elements.ts` + map element rendering in `SessionMapClient.tsx`; store template type, center lat/lon, rotation, length/width meters; render markings from local meter coordinates projected from center; build a clean template registry so future sports are data additions.
  - Design: clean white/neutral lines, premium map-native feel, not cluttered. Keep generic field rectangle.
  - Future-friendly: structure for field-relative coordinates (baseline-relative position, distance from squash T, time in end zone, zone heatmaps, formation analysis).
  - Full spec is in the user's message from 2026-06-10 (~03:3x); summarize per its checklist when done.

## Notes for next iteration

- Backend upload limit is 10 MB (`MAX_FILE_SIZE_BYTES` in backend/app/main.py:53) — check frontend mirrors this and that error surfaces readably.
- API base: `src/components/UploadPanel.tsx:24` uses `VITE_API_BASE_URL` with 127.0.0.1:8000 dev fallback — check all other fetch sites (MultiPlayerPanel, Strava controls) use the same constant.
- Backend CORS merges defaults + `POINTTRACER_CORS_ORIGINS` + `POINTTRACER_FRONTEND_URL` (backend/app/main.py:17-34). Health endpoint exists at `/api/health`.
- DEPLOYMENT.md already covers most of Phase D/H; README may not.
