import { Settings } from "lucide-react";
import type { AppSettings, LineColorMode, ThemeMode, UnitSystem } from "@/types/app-settings";
import type { MapHeatmapMode, MapTraceMode } from "@/types/map-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface SettingsMenuProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

export function SettingsMenu({ settings, onChange }: SettingsMenuProps) {
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[2200] w-80 border-border/70 bg-card p-4">
        <div className="mb-3">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Settings
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Display and playback preferences</p>
        </div>

        <div className="space-y-3">
          <SettingSelect
            label="Units"
            value={settings.units}
            onValueChange={(value) => update("units", value as UnitSystem)}
            items={[
              { value: "imperial", label: "Imperial" },
              { value: "metric", label: "Metric" },
            ]}
          />
          <SettingSelect
            label="Theme"
            value={settings.theme}
            onValueChange={(value) => update("theme", value as ThemeMode)}
            items={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
          <SettingSelect
            label="Default trace mode"
            value={settings.defaultTraceMode}
            onValueChange={(value) => update("defaultTraceMode", value as MapTraceMode)}
            items={[
              { value: "full", label: "Full trace" },
              { value: "streak", label: "Streak" },
              { value: "none", label: "No trace" },
              { value: "heatmap", label: "Heatmap" },
            ]}
          />
          {settings.defaultTraceMode === "heatmap" ? (
            <SettingSelect
              label="Heatmap style"
              value={settings.heatmapMode}
              onValueChange={(value) => update("heatmapMode", value as MapHeatmapMode)}
              items={[
                { value: "occupancy", label: "Occupancy" },
                { value: "speed", label: "Speed by area" },
              ]}
            />
          ) : null}
          <SettingNumber
            label="Default playback speed"
            value={settings.defaultPlaybackSpeed}
            onChange={(value) => update("defaultPlaybackSpeed", value)}
          />
          <SettingSelect
            label="Line color mode"
            value={settings.lineColorMode}
            onValueChange={(value) => update("lineColorMode", value as LineColorMode)}
            items={[
              { value: "solid", label: "Solid color" },
              { value: "multi-gradient", label: "Multicolor gradient" },
              { value: "single-gradient", label: "Single-color gradient" },
            ]}
          />
          <SettingSwitch
            label="Only segmented activity"
            description="Limit map traces and heatmaps to points inside detected or edited segments."
            checked={settings.onlySegmentedActivity}
            onCheckedChange={(checked) => update("onlySegmentedActivity", checked)}
          />
          <SettingSwitch
            label="Show pace graph"
            checked={settings.showPaceGraph}
            onCheckedChange={(checked) => update("showPaceGraph", checked)}
          />
          <SettingSwitch
            label="Show heart-rate chart"
            description="Stack heart-rate readings below the speed graph when FIT heart-rate data is available."
            checked={settings.showHeartRateChart}
            onCheckedChange={(checked) => update("showHeartRateChart", checked)}
          />
          <SettingSwitch
            label="Reduced animation"
            description="Removes pulsing markers and shortens UI transitions for a calmer review experience."
            checked={settings.reducedAnimation}
            onCheckedChange={(checked) => update("reducedAnimation", checked)}
          />
          <SettingSwitch
            label="Help improve auto-segmentation"
            description="Share your corrected segments and the activity's GPS track so PointTracer can train a better auto-segmenter. Off by default; you can turn it off anytime."
            checked={settings.shareTrainingData}
            onCheckedChange={(checked) => update("shareTrainingData", checked)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SettingSelect({
  label,
  value,
  items,
  onValueChange,
}: {
  label: string;
  value: string;
  items: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_9.5rem] items-center gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 rounded-lg border-border/70 bg-secondary/35 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[2300]">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function SettingNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_9.5rem] items-center gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        min="0.1"
        max="4.9"
        step="0.1"
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next) && next > 0 && next < 5) onChange(next);
        }}
        className="h-8 rounded-lg border-border/70 bg-secondary/35 text-xs"
        aria-label="Default playback speed greater than 0 and less than 5"
      />
    </label>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        {description ? (
          <span className="mt-1 block text-[10px] leading-snug text-muted-foreground/75">
            {description}
          </span>
        ) : null}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
