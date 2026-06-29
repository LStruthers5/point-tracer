import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const GPX_EXPORT_GUIDES = [
  {
    id: "strava",
    label: "Strava",
    title: "Export GPX from Strava",
    note: "Best from the Strava website. Use this when your workout was recorded in Strava or synced there from another device.",
    sourceLabel: "Strava help",
    sourceUrl: "https://support.strava.com/en-us/articles/15401919-exporting-your-data-and-bulk-export",
    steps: [
      "Open strava.com in a browser and go to the activity you want to review.",
      "Use the activity actions menu and choose Export GPX. If you see Export Original instead, that FIT file works too.",
      "Upload the downloaded .gpx or .fit file to PointTracer.",
    ],
  },
  {
    id: "garmin",
    label: "Garmin",
    title: "Export GPX or FIT from Garmin Connect",
    note: "Use Garmin Connect on the web for the cleanest file export flow from Garmin watches and bike computers.",
    sourceLabel: "Garmin help",
    sourceUrl: "https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8&searchQuery=downloading%20gpx%20data&textPage=5",
    steps: [
      "Open connect.garmin.com and select the activity from Activities.",
      "Open the activity settings menu and choose Export to GPX or Export Original.",
      "Upload the downloaded .gpx or original .fit file to PointTracer.",
    ],
  },
  {
    id: "apple",
    label: "Apple",
    title: "Export Apple Watch workouts with GPX Export",
    note: "Apple Health does not provide a simple single-workout GPX/FIT download, so use an exporter app for Apple Watch routes.",
    sourceLabel: "GPX Export app",
    sourceUrl: "https://apps.apple.com/us/app/gpx-export/id1667613575",
    steps: [
      "Install GPX Export on the iPhone that has your Apple Health workouts.",
      "Allow Health access, choose the workout route you want, and export it as GPX.",
      "Save or share the .gpx file, then upload it to PointTracer.",
    ],
  },
  {
    id: "coros",
    label: "COROS",
    title: "Export from COROS",
    note: "COROS supports workout exports from the workout details/share flow.",
    sourceLabel: "COROS help",
    sourceUrl: "https://support.coros.com/hc/en-us/articles/360043975752-Exporting-Workout-Data-and-Uploading-to-3rd-Party-Apps",
    steps: [
      "Open the COROS app and choose the workout you want to review.",
      "Use the share/export action and select GPX or FIT when available.",
      "Save the file to your device, then upload it to PointTracer.",
    ],
  },
  {
    id: "polar",
    label: "Polar",
    title: "Export from Polar Flow",
    note: "Polar Flow can export individual training sessions in GPX and FIT when GPS data is available.",
    sourceLabel: "Polar help",
    sourceUrl: "https://support.polar.com/us-en/export-training-sessions-flow",
    steps: [
      "Open Polar Flow on the web and go to Diary.",
      "Open the training session you want and use the Export menu.",
      "Choose GPX or FIT, then upload the downloaded file to PointTracer.",
    ],
  },
  {
    id: "suunto",
    label: "Suunto",
    title: "Export from Suunto app",
    note: "Suunto can export workout files from the activity details menu. GPS workouts can export GPX; non-GPS workouts may only offer FIT.",
    sourceLabel: "Suunto help",
    sourceUrl: "https://www.suunto.com/Support/faq-articles/suunto-app/what-type-of-files-can-i-export-from-the-suunto-app/",
    steps: [
      "Open the workout in the Suunto app.",
      "Tap the three-dot menu in the top right and choose an export format.",
      "Save the GPX or FIT file, then upload it to PointTracer.",
    ],
  },
  {
    id: "runkeeper",
    label: "Runkeeper",
    title: "Export from Runkeeper",
    note: "Runkeeper exports account data with GPX files for GPS activities inside the date range you choose.",
    sourceLabel: "Runkeeper help",
    sourceUrl: "https://help.runkeeper.com/en/hc/how-to-export-your-runkeeper-data",
    steps: [
      "Log in to runkeeper.com and open Account Settings.",
      "Use Export Data, choose the date range for the activity, and download the export.",
      "Find the matching .gpx file in the export and upload it to PointTracer.",
    ],
  },
  {
    id: "ridewithgps",
    label: "Ride with GPS",
    title: "Export from Ride with GPS",
    note: "Ride with GPS supports GPX Track, FIT, TCX, CSV, and KML exports from the web.",
    sourceLabel: "RWGPS help",
    sourceUrl: "https://support.ridewithgps.com/hc/en-us/articles/4419007646235-Export-File-Formats",
    steps: [
      "Open the ride or route in Ride with GPS on the web.",
      "Use Export and choose GPX Track or FIT.",
      "Upload the downloaded file to PointTracer.",
    ],
  },
  {
    id: "trainingpeaks",
    label: "TrainingPeaks",
    title: "Download a workout file from TrainingPeaks",
    note: "TrainingPeaks downloads the workout file in the same format it was uploaded, often FIT for device-recorded activities.",
    sourceLabel: "TrainingPeaks help",
    sourceUrl: "https://help.trainingpeaks.com/hc/en-us/articles/204985370-Data-Export",
    steps: [
      "Open the workout Quick View in TrainingPeaks.",
      "Open Files and choose Download.",
      "If the workout downloads as .fit or .gpx, upload that file to PointTracer.",
    ],
  },
  {
    id: "komoot",
    label: "Komoot",
    title: "Export from komoot",
    note: "Komoot supports GPX exports for routes and activities, depending on account and platform.",
    sourceLabel: "Komoot help",
    sourceUrl: "https://support.komoot.com/hc/en-us/articles/10115477099674-Export-and-import-Routes-and-Activities",
    steps: [
      "Open the route or completed activity in komoot.",
      "Use the export/download option and choose GPX.",
      "Upload the downloaded .gpx file to PointTracer.",
    ],
  },
  {
    id: "alltrails",
    label: "AllTrails",
    title: "Download files from AllTrails",
    note: "AllTrails supports many file types, including GPX Track and FIT, for activities, custom routes, and trails.",
    sourceLabel: "AllTrails help",
    sourceUrl: "https://support.alltrails.com/hc/en-us/articles/37230403315476-Downloading-files-from-AllTrails",
    steps: [
      "Open the activity, custom route, or trail in AllTrails.",
      "Use the overflow menu and choose the download or export route file option.",
      "Choose GPX Track or Garmin FIT when available, then upload it to PointTracer.",
    ],
  },
  {
    id: "gaia",
    label: "Gaia GPS",
    title: "Export from Gaia GPS",
    note: "Gaia GPS can export tracks, routes, waypoints, areas, and folders as GPX from the app.",
    sourceLabel: "Gaia GPS help",
    sourceUrl: "https://help.gaiagps.com/hc/en-us/articles/115003639728-Export-Data-as-GPX-or-KML-from-the-iOS-app",
    steps: [
      "Open the track or route in Gaia GPS.",
      "Use Export and choose GPX.",
      "Save the file, then upload it to PointTracer.",
    ],
  },
  {
    id: "footpath",
    label: "Footpath",
    title: "Export from Footpath",
    note: "Footpath can export GPX routes and other GPS file types for watches, bike computers, and other apps.",
    sourceLabel: "Footpath help",
    sourceUrl: "https://footpathapp.com/user-guide/exporting-routes/",
    steps: [
      "Open the route in Footpath.",
      "Tap Share, choose Export, then choose GPX Route or another PointTracer-supported file if available.",
      "Save the file and upload it to PointTracer.",
    ],
  },
] as const;

const PRIMARY_GUIDES = GPX_EXPORT_GUIDES.filter((guide) =>
  ["strava", "garmin", "apple", "coros", "polar", "suunto"].includes(guide.id),
);
const OTHER_GUIDES = GPX_EXPORT_GUIDES.filter(
  (guide) => !["strava", "garmin", "apple", "coros", "polar", "suunto"].includes(guide.id),
);

interface GpxFileGuideProps {
  compact?: boolean;
}

export function GpxFileGuide({ compact = false }: GpxFileGuideProps) {
  return (
    <Tabs defaultValue="strava" className="w-full text-left">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/70 sm:grid-cols-4 lg:grid-cols-7">
        {PRIMARY_GUIDES.map((guide) => (
          <TabsTrigger key={guide.id} value={guide.id} className="min-h-8 px-2 text-xs">
            {guide.label}
          </TabsTrigger>
        ))}
        <TabsTrigger value="others" className="min-h-8 px-2 text-xs">
          Others
        </TabsTrigger>
      </TabsList>

      {PRIMARY_GUIDES.map((guide) => (
        <TabsContent key={guide.id} value={guide.id} className={compact ? "mt-3" : "mt-4"}>
          <div className={compact ? "space-y-3" : "space-y-4"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{guide.title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{guide.note}</p>
              </div>
              <a
                href={guide.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
              >
                {guide.sourceLabel}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <ol className="space-y-2 text-sm text-foreground">
              {guide.steps.map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="leading-6">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </TabsContent>
      ))}

      <TabsContent value="others" className={compact ? "mt-3" : "mt-4"}>
        <div className="grid gap-3 md:grid-cols-2">
          {OTHER_GUIDES.map((guide) => (
            <div key={guide.id} className="rounded-xl border border-border/60 bg-card/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{guide.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{guide.note}</p>
                </div>
                <a
                  href={guide.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
                >
                  Help
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <ol className="mt-3 space-y-1.5 text-xs text-foreground">
                {guide.steps.map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="mt-0.5 text-[11px] font-semibold text-primary">
                      {index + 1}.
                    </span>
                    <span className="leading-5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}

export function GpxTutorialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[2400] max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Get your GPX or FIT file</DialogTitle>
          <DialogDescription>
            PointTracer reads .gpx and .fit files from your own workouts. Pick the place your
            activity already lives, export it, then upload the downloaded file here.
          </DialogDescription>
        </DialogHeader>

        <GpxFileGuide />
      </DialogContent>
    </Dialog>
  );
}
