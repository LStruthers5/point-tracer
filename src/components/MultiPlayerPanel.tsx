import { useState } from "react";

export function MultiPlayerPanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary/50" />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Multi-player Overlay
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-5 pb-5">
          <div className="bg-secondary/30 rounded-xl p-4 text-center">
            <div className="text-sm text-muted-foreground">
              Coming next: sync multiple player GPS traces to replay full formations and point movement.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
