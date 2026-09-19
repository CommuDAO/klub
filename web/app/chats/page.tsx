"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { BottomNav, Header } from "@/components/Chrome";
import { useEventList } from "@/lib/useEvents";
import { EventMetadata, loadMetadata } from "@/lib/ipfs";
import { dateRange } from "@/lib/format";

export default function ChatsPage() {
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
      <Header title="Chats" />
      <main className="pad col gap12">
        <p className="muted small">
          KLUB has no in-app chat. Each event links to the group its organizer already runs.
        </p>
        {!address ? <p className="muted small">Connect your wallet to see the events you joined.</p> : null}
        {events.map((e) => {
          const meta = metas[e.id] ?? {};
          return (
            <div key={e.id} className="between divider" style={{ padding: "12px 0" }}>
              <div className="col">
                <strong>{meta.title ?? `Event #${e.id}`}</strong>
                <span className="small muted">{dateRange(e.startTime, e.endTime)}</span>
              </div>
              {meta.telegram ? (
                <a className="btn" style={{ height: 40 }} href={meta.telegram} target="_blank" rel="noreferrer">
                  Telegram
                </a>
              ) : (
                <span className="chip">No group</span>
              )}
            </div>
          );
        })}
      </main>
      <BottomNav />
    </div>
  );
}
