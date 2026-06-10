# Multiplayer Invite Flow — Design Spec

Status: **proposed** (post-MVP). The time-alignment engine already exists; this spec
covers the *invite/collaboration* layer that turns "I collect everyone's files manually"
into "I send one link."

## Why this is the leap from project to product

PointTracer can already replay multiple athletes' GPS traces in sync — the hard
engineering (timestamp alignment, overlap-window detection) is done on
`feature/session-view-playback-editing`:

- `backend/app/services/multiplayer.py` — `build_multiplayer_session_from_sources()`
  aligns N GPX/FIT sources by their ISO timestamps into one `MultiplayerSessionData`.
- `src/lib/multiplayer-playback.ts` — `getMultiplayerOverlapWindow()` computes when
  athletes were actually moving together.
- `POST /api/upload/multiplayer` — current entry point; **stateless**, all files
  uploaded in one request by one person.

The missing piece is purely *collaboration plumbing*: let participants contribute
their own data asynchronously, from their own devices, via a shared link.

## Hard constraint: what the Strava API cannot do

Be explicit about this so we don't build toward a dead end.

- The Strava "Other Athletes" / "you worked out with" data (the group-activity feature
  in the Strava web/app UI) is **internal to Strava and not exposed in the public REST API.**
  The activity-detail endpoint returns **no co-athlete list**.
- You can **only** read activities and GPS streams for an athlete who has personally
  OAuth-authorized *this* app. You cannot fetch a friend's data just because Strava knows
  you trained together — that is a deliberate privacy boundary.

**Implication:** auto-discovery ("app finds Sarah and pulls her GPX") is impossible via
the API. Attempting it via scraping would violate Strava's terms and risk a ban.

**What we build instead:** the *invite* is the magic, not the discovery. Each participant
brings their own data — via their own Strava OAuth (scoped to their account) or a file upload.

## Target flow

```
1. Athlete A analyzes their activity (works today)
2. A clicks "Add Player" → "Invite via link"
3. Backend creates a group-session record, returns a short share link
4. A sends the link (text / AirDrop / etc.)
5. Athlete B opens the link → join page
6. B contributes their trace:
     - connects THEIR Strava and picks the matching activity by time, OR
     - drops their GPX/FIT file
7. Backend appends B's source to the group session and re-runs
   build_multiplayer_session_from_sources()
8. Both A and B replay the synced formation; overlap window highlights shared time
```

The "pick the matching activity by time" step (step 6) is a legal, high-polish touch:
once B connects Strava, list *their own* recent activities filtered to A's time window so
B barely has to think.

## Architecture

### New: group-session store (stateful)

The current endpoint is stateless. Add a persisted record:

```
GroupSession
  id: short, URL-safe token (e.g. 8–10 chars, the share link)
  created_at, expires_at
  owner_token: opaque secret proving "I created this" (for delete/manage)
  sport: string
  sources: [ { participant_label, raw_points|file_ref, joined_at } ]
  status: open | closed
```

Storage: reuse the existing SQLite pattern (`STRAVA_TOKEN_DB_PATH` neighbor, e.g.
`POINTTRACER_GROUP_DB_PATH`). No new infra needed for v1. Expire records (e.g. 30 days)
so the store does not grow unbounded.

### New backend routes

| Route | Purpose |
|---|---|
| `POST /api/group` | Create a group session from the creator's existing source(s). Returns `{ id, owner_token }`. |
| `GET /api/group/{id}` | Public read: sport, participant labels, join status (no raw data leak beyond what's needed to render the join page). |
| `POST /api/group/{id}/join` | Append a participant's GPX/FIT (or Strava-imported points). Re-runs alignment. |
| `GET /api/group/{id}/session` | Return the combined `MultiplayerSessionData` for replay. |
| `DELETE /api/group/{id}` | Owner-only (via `owner_token`) teardown. |

`join` and `session` reuse `build_multiplayer_session_from_sources()` unchanged — the
group store just feeds it the accumulated sources instead of one multipart request.

### Frontend

- **Add Player menu** gains an "Invite via link" option beside the existing
  "upload a file" path (which stays — it's the manual fallback).
- New **join route** (`/join/$groupId`) — a lightweight page: shows who's already in,
  offers "Connect Strava" or "Upload file", then redirects into the synced session view.
- Reuse the existing multiplayer display controls and overlap-only toggle as-is.

## Privacy & safety

- The share link is a **bearer token** — anyone with it can join and see the combined
  traces. Treat it like an unlisted link, not a secret. Document this.
- Only store what is needed for replay (points + timestamps), not full Strava profiles.
- Owner can delete the group session; sessions auto-expire.
- A joiner's Strava OAuth is scoped to **their own** account — A never gains access to
  B's Strava beyond the single activity B chooses to contribute.

## Phasing

1. **Phase M1 — merge what exists.** Bring `feature/session-view-playback-editing` into
   the launch line so manual multi-file Add Player ships. (No invite yet.)
2. **Phase M2 — group store + share link.** `POST /api/group`, join route, file-based join.
   This delivers the "send one link" value with file upload only.
3. **Phase M3 — Strava-assisted join.** On the join page, connect Strava and pick the
   matching activity by time window. Highest polish, optional.

## Open questions

- Anonymous join vs. require the joiner to also be a PointTracer user? (v1: anonymous + label.)
- Max participants per session? (Suggest a soft cap, e.g. 6, for replay legibility.)
- Do we notify the owner when someone joins? (v1: no; they re-open the link to see updates.)
