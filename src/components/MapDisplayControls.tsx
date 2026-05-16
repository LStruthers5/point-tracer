import type {
  MapColorMode,
  MapDisplayOptions,
  MapGradientMode,
  MapHeatmapMode,
  MapLineColor,
  MapTraceMode,
} from "@/types/map-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MapDisplayControlsProps {
  displayOptions: MapDisplayOptions;
  onChange: (options: MapDisplayOptions) => void;
}

export function MapDisplayControls({ displayOptions, onChange }: MapDisplayControlsProps) {
  return (
    <div className="space-y-2">
      <OptionSelect
        label="Trace"
        value={displayOptions.traceMode}
        onValueChange={(traceMode) =>
          onChange({ ...displayOptions, traceMode: traceMode as MapTraceMode })
        }
        items={[
          { value: "full", label: "Full trace" },
          { value: "streak", label: "Streak" },
          { value: "none", label: "No trace" },
          { value: "heatmap", label: "Heatmap" },
        ]}
      />
      {displayOptions.traceMode === "heatmap" ? (
        <OptionSelect
          label="Heatmap"
          value={displayOptions.heatmapMode}
          onValueChange={(heatmapMode) =>
            onChange({
              ...displayOptions,
              heatmapMode: heatmapMode as MapHeatmapMode,
            })
          }
          items={[
            { value: "occupancy", label: "Occupancy" },
            { value: "speed", label: "Speed by area" },
          ]}
        />
      ) : null}
      <OptionSelect
        label="Color"
        value={displayOptions.lineColor}
        onValueChange={(lineColor) =>
          onChange({ ...displayOptions, lineColor: lineColor as MapLineColor })
        }
        items={[
          { value: "green", label: "Green" },
          { value: "cyan", label: "Cyan" },
          { value: "amber", label: "Amber" },
          { value: "rose", label: "Rose" },
        ]}
      />
      {displayOptions.traceMode !== "heatmap" ? (
        <>
          <OptionSelect
            label="Line mode"
            value={displayOptions.colorMode}
            onValueChange={(colorMode) =>
              onChange({ ...displayOptions, colorMode: colorMode as MapColorMode })
            }
            items={[
              { value: "solid", label: "Solid" },
              { value: "speed", label: "Speed gradient" },
            ]}
          />
          <OptionSelect
            label="Gradient"
            value={displayOptions.gradientMode}
            onValueChange={(gradientMode) =>
              onChange({
                ...displayOptions,
                gradientMode: gradientMode as MapGradientMode,
              })
            }
            items={[
              { value: "multi", label: "Multicolor" },
              { value: "single", label: "Single color" },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

function OptionSelect({
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
    <label className="min-w-0 space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
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
