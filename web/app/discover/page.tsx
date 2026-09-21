"use client";

import { useState } from "react";
import { BottomNav, Header } from "@/components/Chrome";
import { EventRow } from "@/components/EventRow";
import { useEventList } from "@/lib/useEvents";
import { dayLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Filter = "all" | "live" | "past";

export default function DiscoverPage() {
  const { t, locale } = useI18n();
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

  const labels: Record<Filter, string> = {
    all: t("discover.upcoming"),
    live: t("discover.live"),
    past: t("discover.past")
  };

  return (
    <div className="shell">
      <Header title={t("discover.title")} />
      <main className="pad col gap16">
        <div className="row gap8" style={{ flexWrap: "wrap" }}>
          {(["all", "live", "past"] as Filter[]).map((f) => (
            <button key={f} className="chip" style={filter === f ? { background: "var(--ink)", color: "#fff" } : {}} onClick={() => setFilter(f)}>
              {labels[f]}
            </button>
          ))}
        </div>
        {isLoading ? <p className="muted small">{t("common.loading")}</p> : null}
        {shown.map((e, i) => (
          <div key={e.id} className="col gap8">
            {i === 0 || dayLabel(e.startTime, locale) !== dayLabel(shown[i - 1].startTime, locale) ? (
              <strong className="small">{dayLabel(e.startTime, locale)}</strong>
            ) : null}
            <EventRow event={e} badge={filter === "past" ? t("row.ended") : undefined} />
          </div>
        ))}
        {!isLoading && shown.length === 0 ? <p className="muted small">{t("discover.empty")}</p> : null}
      </main>
      <BottomNav />
    </div>
  );
}
