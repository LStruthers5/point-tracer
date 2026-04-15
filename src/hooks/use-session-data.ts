import { useState, useEffect } from "react";
import type { SessionData } from "@/types/session";

export function useSessionData() {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/session.json")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load session data");
        return r.json();
      })
      .then((d: SessionData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}
