"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { BottomNav, Header } from "@/components/Chrome";
import { EventRow } from "@/components/EventRow";
import { useEventList } from "@/lib/useEvents";
import { dayLabel } from "@/lib/format";

export default function HomePage() {
  const { address } = useAccount();
  const { events, isLoading } = useEventList();
  const now = BigInt(Math.floor(Date.now() / 1000));

  const mine = address ? events.filter((e) => e.organizer.toLowerCase() === address.toLowerCase()) : [];
  const upcoming = events.filter((e) => e.endTime > now).sort((a, b) => Number(a.startTime - b.startTime));

  return (
    <div className="shell">
      <Header />
      <main className="pad col gap16">
        {mine.length > 0 ? (
          <section className="col gap8">
            <div className="between">
              <h2 className="display h2">Your events</h2>
              <Link href="/manage" className="small muted">
                Manage
              </Link>
            </div>
            {mine.map((e) => (
              <EventRow key={e.id} event={e} badge="Organizer" />
            ))}
          </section>
        ) : null}

        <section className="col gap8">
          <h2 className="display h2">Picked for you</h2>
          {isLoading ? <p className="muted small">Loading events from KUB Chain…</p> : null}
          {!isLoading && upcoming.length === 0 ? (
            <p className="muted small">No upcoming events yet. Create the first one.</p>
          ) : null}
          {upcoming.map((e, i) => (
            <div key={e.id} className="col gap8">
              {i === 0 || dayLabel(e.startTime) !== dayLabel(upcoming[i - 1].startTime) ? (
                <strong className="small">{dayLabel(e.startTime)}</strong>
              ) : null}
              <EventRow event={e} />
            </div>
          ))}
        </section>

        <Link href="/pass" className="btn ghost wide">
          My passes
        </Link>
      </main>
      <BottomNav />
    </div>
  );
}
