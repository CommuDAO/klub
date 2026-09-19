"use client";

import { useState } from "react";
import { BottomNav, Header } from "@/components/Chrome";
import { EventRow } from "@/components/EventRow";
import { useEventList } from "@/lib/useEvents";
import { dayLabel } from "@/lib/format";

type Filter = "all" | "live" | "past";

export default function DiscoverPage() {
  const { events, isLoading } = useEventList();
  const [filter, setFilter] = useState<Filter>("all");
  const now = BigInt(Math.floor(Date.now() / 1000));

  const shown = events
    .filter((e) => {
      if (filter === "live") return e.startTime <= now && e.endTime > now;
      if (filter === "past") return e.endTime <= now;
      return e.endTime > now;
    })
    .sort((a, b) => Number(a.startTime - b.startTime));

  return (
    <div className="shell">
      <Header title="Discover" />
      <main className="pad col gap16">
        <div className="row gap8">
          {(["all", "live", "past"] as Filter[]).map((f) => (
            <button key={f} className="chip" style={filter === f ? { background: "var(--ink)", color: "#fff" } : {}} onClick={() => setFilter(f)}>
              {f === "all" ? "Upcoming" : f === "live" ? "Happening now" : "Past"}
            </button>
          ))}
        </div>
        {isLoading ? <p className="muted small">Loading…</p> : null}
        {shown.map((e, i) => (
          <div key={e.id} className="col gap8">
            {i === 0 || dayLabel(e.startTime) !== dayLabel(shown[i - 1].startTime) ? (
              <strong className="small">{dayLabel(e.startTime)}</strong>
            ) : null}
            <EventRow event={e} />
          </div>
        ))}
        {!isLoading && shown.length === 0 ? <p className="muted small">Nothing here yet.</p> : null}
      </main>
      <BottomNav />
    </div>
  );
}
