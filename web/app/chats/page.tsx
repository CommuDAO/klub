"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { BottomNav, ConnectOnHome, Header } from "@/components/Chrome";
import { contracts, registryAbi } from "@/lib/contracts";
import { useEventList } from "@/lib/useEvents";
import { EventMetadata, ipfsUrl, loadMetadata } from "@/lib/ipfs";
import { dateRange } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/// Only the events this wallet organizes or has RSVP'd to.
export default function ChatsPage() {
  const { t, locale } = useI18n();
  const { address } = useAccount();
  const { events } = useEventList();
  const [metas, setMetas] = useState<Record<number, EventMetadata>>({});

  const { data: guestStates } = useReadContracts({
    contracts: address
      ? events.map((e) => ({
          address: contracts.registry,
          abi: registryAbi,
          functionName: "guestOf" as const,
          args: [BigInt(e.id), address] as const
        }))
      : [],
    query: { enabled: Boolean(address) && events.length > 0 }
  });

  const mine = address
    ? events.filter((e, i) => {
        const status = Number((guestStates?.[i]?.result as { status: number } | undefined)?.status ?? 0);
        return e.organizer.toLowerCase() === address.toLowerCase() || status > 0;
      })
    : [];

  useEffect(() => {
    mine.forEach((e) => {
      if (metas[e.id]) return;
      loadMetadata(e.metadataCID).then((m) => setMetas((prev) => ({ ...prev, [e.id]: m })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.map((e) => e.id).join(",")]);

  return (
    <div className="shell">
      <Header title={t("chats.title")} language />
      <main className="pad col gap12">
        {!address ? <ConnectOnHome /> : null}
        {mine.map((e) => {
          const meta = metas[e.id] ?? {};
          return (
            <div key={e.id} className="row divider" style={{ padding: "12px 0" }}>
              <Link href={`/event?id=${e.id}`} className="row" style={{ flexGrow: 1, minWidth: 0 }}>
                {meta.coverCID ? (
                  <img className="thumb" src={ipfsUrl(meta.coverCID)} alt="" style={{ width: 56, height: 56 }} />
                ) : (
                  <div className="thumb" style={{ width: 56, height: 56 }} />
                )}
                <div className="col" style={{ minWidth: 0 }}>
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {meta.title ?? t("common.event", { id: e.id })}
                  </strong>
                  <span className="small muted">{dateRange(e.startTime, e.endTime, locale)}</span>
                </div>
              </Link>
              {meta.telegram ? (
                <a className="btn" style={{ height: 40, flexShrink: 0 }} href={meta.telegram} target="_blank" rel="noreferrer">
                  {t("common.telegram")}
                </a>
              ) : (
                <span className="chip" style={{ flexShrink: 0 }}>
                  {t("chats.noGroup")}
                </span>
              )}
            </div>
          );
        })}
      </main>
      <BottomNav />
    </div>
  );
}
