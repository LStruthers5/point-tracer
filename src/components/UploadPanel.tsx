import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { SessionData } from "@/types/session";

const ENDPOINT = "http://127.0.0.1:8000/api/upload/gpx";

const SPORTS = [
  { value: "ultimate", label: "Ultimate" },
  { value: "tennis", label: "Tennis" },
  { value: "running", label: "Running" },
];

interface UploadPanelProps {
  onUploaded: (data: SessionData) => void;
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const [sport, setSport] = useState<string>("ultimate");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) {
      setError("Please choose a .gpx file first.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sport", sport);
      const res = await fetch(ENDPOINT, { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}) ${text}`.trim());
      }
      const data = (await res.json()) as SessionData;
      onUploaded(data);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-card/30">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mr-1">
        <FileUp className="w-3.5 h-3.5" />
        Upload GPX
      </div>

      <Select value={sport} onValueChange={setSport} disabled={loading}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPORTS.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setSuccess(false);
          setError(null);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {file ? truncate(file.name, 22) : "Choose .gpx"}
      </Button>

      <Button
        type="button"
        size="sm"
        className="h-8 text-xs"
        onClick={handleUpload}
        disabled={loading || !file}
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" />
            Upload
          </>
        )}
      </Button>

      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
      {success && !error && (
        <div className="flex items-center gap-1.5 text-[11px] text-primary">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Session loaded
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
