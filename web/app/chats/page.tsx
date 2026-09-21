"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { BottomNav, Header } from "@/components/Chrome";
import { useEventList } from "@/lib/useEvents";
import { EventMetadata, loadMetadata } from "@/lib/ipfs";
import { dateRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function ChatsPage() {
  const { t, locale } = useI18n();
  const { address } = useAccount();
  const { events } = useEventList();
  const [metas, setMetas] = useState<Record<number, EventMetadata>>({});

  useEffect(() => {
    events.forEach((e) => {
      loadMetadata(e.metadataCID).then((m) => setMetas((prev) => ({ ...prev, [e.id]: m })));
    });
  }, [events]);

  return (
    <div className="shell">
      <Header title={t("chats.title")} />
      <main className="pad col gap12">
        <p className="muted small">{t("chats.intro")}</p>
        {!address ? <p className="muted small">{t("chats.connect")}</p> : null}
        {events.map((e) => {
          const meta = metas[e.id] ?? {};
          return (
            <div key={e.id} className="between divider" style={{ padding: "12px 0" }}>
              <div className="col">
                <strong>{meta.title ?? t("common.event", { id: e.id })}</strong>
                <span className="small muted">{dateRange(e.startTime, e.endTime, locale)}</span>
              </div>
              {meta.telegram ? (
                <a className="btn" style={{ height: 40 }} href={meta.telegram} target="_blank" rel="noreferrer">
                  {t("common.telegram")}
                </a>
              ) : (
                <span className="chip">{t("chats.noGroup")}</span>
              )}
            </div>
          );
        })}
      </main>
      <BottomNav />
    </div>
  );
}
