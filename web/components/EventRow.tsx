"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EventMetadata, ipfsUrl, loadMetadata } from "@/lib/ipfs";
import { amount, dateRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { KlubEvent } from "@/lib/useEvents";

export function EventRow({ event, badge }: { event: KlubEvent; badge?: string }) {
  const { t, locale } = useI18n();
  const [meta, setMeta] = useState<EventMetadata>({});
  useEffect(() => {
    loadMetadata(event.metadataCID).then(setMeta);
  }, [event.metadataCID]);

  return (
    <Link href={`/event?id=${event.id}`} className="row divider" style={{ padding: "12px 0", alignItems: "flex-start" }}>
      {meta.coverCID ? <img className="thumb" src={ipfsUrl(meta.coverCID)} alt="" /> : <div className="thumb" />}
      <div className="col" style={{ flexGrow: 1, gap: 3 }}>
        <div className="between">
          <span className="small muted">{meta.venue ?? t("row.venueTba")}</span>
          {badge ? <span className="chip">{badge}</span> : null}
        </div>
        <strong style={{ fontSize: 16 }}>{meta.title ?? t("common.event", { id: event.id })}</strong>
        <span className="small muted">{dateRange(event.startTime, event.endTime, locale)}</span>
        <span className="tiny muted">
          {t("row.depositBurn", { deposit: amount(event.minHolding), burn: amount(event.burnAmount) })}
        </span>
      </div>
    </Link>
  );
}
