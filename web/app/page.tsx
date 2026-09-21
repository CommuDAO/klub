"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { BottomNav, Header } from "@/components/Chrome";
import { EventRow } from "@/components/EventRow";
import { useEventList } from "@/lib/useEvents";
import { dayLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function HomePage() {
  const { t, locale } = useI18n();
  const { address } = useAccount();
  const { events, isLoading } = useEventList();
  const now = BigInt(Math.floor(Date.now() / 1000));

  const mine = address ? events.filter((e) => e.organizer.toLowerCase() === address.toLowerCase()) : [];
  const upcoming = events.filter((e) => e.endTime > now).sort((a, b) => Number(a.startTime - b.startTime));

  return (
    <div className="shell">
      <Header home />
      <main className="pad col gap16">
        {mine.length > 0 ? (
          <section className="col gap8">
            <div className="between">
              <h2 className="display h2">{t("home.yourEvents")}</h2>
              <Link href="/manage" className="small muted">
                {t("home.manage")}
              </Link>
            </div>
            {mine.map((e) => (
              <EventRow key={e.id} event={e} badge={t("row.organizer")} />
            ))}
          </section>
        ) : null}

        <section className="col gap8">
          <h2 className="display h2">{t("home.picked")}</h2>
          {isLoading ? <p className="muted small">{t("home.loadingChain")}</p> : null}
          {!isLoading && upcoming.length === 0 ? <p className="muted small">{t("home.empty")}</p> : null}
          {upcoming.map((e, i) => (
            <div key={e.id} className="col gap8">
              {i === 0 || dayLabel(e.startTime, locale) !== dayLabel(upcoming[i - 1].startTime, locale) ? (
                <strong className="small">{dayLabel(e.startTime, locale)}</strong>
              ) : null}
              <EventRow event={e} />
            </div>
          ))}
        </section>

        <Link href="/pass" className="btn ghost wide">
          {t("home.myPasses")}
        </Link>
      </main>
      <BottomNav />
    </div>
  );
}
