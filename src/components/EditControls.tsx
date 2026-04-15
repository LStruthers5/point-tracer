import { Button } from "@/components/ui/button";

export function EditControls() {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
        Edit Controls
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="text-xs">
          Split Segment
        </Button>
        <Button variant="outline" size="sm" className="text-xs">
          Merge with Previous
        </Button>
        <Button variant="outline" size="sm" className="text-xs">
          Mark as Likely Point
        </Button>
      </div>
    </div>
  );
}
