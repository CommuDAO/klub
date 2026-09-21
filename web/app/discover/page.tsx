"use client";

import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { BottomNav, Header } from "@/components/Chrome";
import { EventRow } from "@/components/EventRow";
import { contracts, registryAbi } from "@/lib/contracts";
import { useEventList } from "@/lib/useEvents";
import { CATEGORIES, Category, EventMetadata, loadMetadata } from "@/lib/ipfs";
import { dayLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Filter = "all" | "live" | "past";

export default function DiscoverPage() {
  const { t, locale } = useI18n();
  const { events, isLoading } = useEventList();
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<Category | "">("");
  const [metas, setMetas] = useState<Record<number, EventMetadata>>({});
  const now = BigInt(Math.floor(Date.now() / 1000));

  useEffect(() => {
    events.forEach((e) => {
      loadMetadata(e.metadataCID).then((m) => setMetas((prev) => ({ ...prev, [e.id]: m })));
    });
  }, [events]);

  const { data: counts } = useReadContracts({
    contracts: events.map((e) => ({
      address: contracts.registry,
      abi: registryAbi,
      functionName: "rsvpCount" as const,
      args: [BigInt(e.id)] as const
    })),
    query: { enabled: events.length > 0 }
  });
  const going = (id: number) => {
    const i = events.findIndex((e) => e.id === id);
    return Number((counts?.[i]?.result as bigint | undefined) ?? 0n);
  };

  const inCategory = (id: number) => !category || metas[id]?.category === category;

  const popular = events
    .filter((e) => e.endTime > now && inCategory(e.id) && going(e.id) > 0)
    .sort((a, b) => going(b.id) - going(a.id))
    .slice(0, 5);

  const shown = events
    .filter((e) => {
      if (!inCategory(e.id)) return false;
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
  const on = { background: "var(--ink)", color: "#fff" };

  return (
    <div className="shell">
      <Header title={t("discover.title")} />
      <main className="pad col gap16">
        <div className="row gap8" style={{ overflowX: "auto", paddingBottom: 4 }}>
          <button className="chip" style={!category ? on : {}} onClick={() => setCategory("")}>
            {t("cat.all")}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className="chip" style={{ whiteSpace: "nowrap", ...(category === c ? on : {}) }} onClick={() => setCategory(c)}>
              {t(`cat.${c}`)}
            </button>
          ))}
        </div>

        {popular.length > 0 ? (
          <section className="col gap8">
            <h2 className="display h2">{t("discover.popular")}</h2>
            {popular.map((e) => (
              <EventRow key={e.id} event={e} badge={t("discover.going", { count: going(e.id) })} />
            ))}
          </section>
        ) : null}

        <div className="row gap8" style={{ flexWrap: "wrap" }}>
          {(["all", "live", "past"] as Filter[]).map((f) => (
            <button key={f} className="chip" style={filter === f ? on : {}} onClick={() => setFilter(f)}>
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
