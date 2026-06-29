# Strava Private Tester Roster

Use this to choose the 10 people who get access to the private Strava-enabled build.
The public build should stay file-upload only.

## Selection Criteria

Pick testers who cover different data shapes and feedback styles:

- 3 people who record field sports or court sports with frequent stop-start movement.
- 2 people who record clean outdoor runs, rides, or walks for baseline GPS quality.
- 2 people on Apple Watch who usually sync through Strava or another exporter.
- 1 person on Garmin.
- 1 person on COROS.
- 1 detail-oriented person who will report confusing UI copy or failed imports.

Prefer people who can test within 48 hours, are comfortable sharing their own activity data, and will send one screenshot plus a short note after trying it.

## Roster

| Slot | Name | Device/service | Sport/use case | Invited | Feedback received | Notes |
|---|---|---|---|---|---|---|
| 1 |  | Strava |  |  |  |  |
| 2 |  | Strava |  |  |  |  |
| 3 |  | Strava |  |  |  |  |
| 4 |  | Strava |  |  |  |  |
| 5 |  | Strava |  |  |  |  |
| 6 |  | Garmin/Strava |  |  |  |  |
| 7 |  | Apple/Strava |  |  |  |  |
| 8 |  | Apple/Strava |  |  |  |  |
| 9 |  | COROS/Strava |  |  |  |  |
| 10 |  | Any |  |  |  |  |

## Invite Note

Hey, I am testing a private Strava-enabled build of PointTracer with a 10-person cap. Could you connect your own Strava account, import one GPS activity, and tell me:

1. Did connecting and importing feel clear?
2. Did the map/segments look right for the activity?
3. What was the first confusing or broken thing?

Please only use activities you are comfortable testing with. Screenshots are helpful, but do not send anything you do not want reviewed.

## Private Build Checklist

- Frontend env: `VITE_ENABLE_STRAVA_IMPORT=true`
- Backend env: `POINTTRACER_ENABLE_STRAVA_IMPORT=true`
- Backend Strava env: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`
- Public frontend env stays `VITE_ENABLE_STRAVA_IMPORT=false`
- Public backend env stays `POINTTRACER_ENABLE_STRAVA_IMPORT=false`
