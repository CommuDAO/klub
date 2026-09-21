"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useAccount, useWriteContract } from "wagmi";
import { BackBar, WalletButton } from "@/components/Chrome";
import { contracts, registryAbi, vaultAbi } from "@/lib/contracts";
import { explainError } from "@/lib/errors";
import { useEvent, useEventState, useGuest } from "@/lib/useEvents";
import { amount, dateRange, minutesAt, timeOf } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

function PassInner() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const eventId = Number(params.get("id") ?? 0);
  const { address } = useAccount();
  const { event } = useEvent(eventId || undefined);
  const { data: state } = useEventState(eventId || undefined);
  const { data: guest, refetch } = useGuest(eventId || undefined, address);
  const [qr, setQr] = useState<string>();
  const [error, setError] = useState<string>();
  const { writeContractAsync, isPending } = useWriteContract();

  useEffect(() => {
    if (address) QRCode.toDataURL(address, { margin: 1, width: 420 }).then(setQr);
  }, [address]);

  if (!address) {
    return (
      <div className="shell">
        <BackBar title={t("pass.title")} />
        <div className="pad col gap12">
          <p className="muted">{t("pass.connect")}</p>
          <WalletButton />
        </div>
      </div>
    );
  }
  if (!eventId || !event) {
    return (
      <div className="shell">
        <BackBar title={t("pass.title")} />
        <p className="pad muted">{t("pass.openFromEvent")}</p>
      </div>
    );
  }

  const stayed = minutesAt(guest?.checkInTime, guest?.checkOutTime);

  async function call(fn: "withdrawDeposit" | "claimNoShowRefund") {
    setError(undefined);
    try {
      await writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: fn, args: [BigInt(eventId)] });
      await refetch();
    } catch (e) {
      setError(explainError(e, t));
    }
  }

  async function claimReward() {
    setError(undefined);
    try {
      await writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "claim", args: [BigInt(eventId)] });
    } catch (e) {
      setError(explainError(e, t));
    }
  }

  return (
    <div className="shell">
      <BackBar title={t("pass.title")} href={`/event?id=${eventId}`} />
      <main className="pad col gap12">
        <div className="card col gap12">
          <div className="col">
            <strong style={{ fontSize: 20 }}>{t("common.event", { id: eventId })}</strong>
            <span className="small muted">{dateRange(event.startTime, event.endTime, locale)}</span>
          </div>
          {qr ? <img src={qr} alt="QR" style={{ width: "100%", borderRadius: 16 }} /> : null}
          <span className="small muted" style={{ textAlign: "center" }}>
            {t("pass.showStaff")}
          </span>
        </div>

        <div className="card col gap8">
          <strong>{t("pass.yourDeposit")}</strong>
          <div className="between">
            <span className="muted small">{t("pass.held")}</span>
            <strong>{amount(guest?.deposit)}</strong>
          </div>
          <div className="between">
            <span className="muted small">{t("pass.burns")}</span>
            <strong>{amount(event.burnAmount)}</strong>
          </div>
          <div className="between">
            <span className="muted small">{t("pass.refundableNow")}</span>
            <strong>{amount(guest?.refundable)}</strong>
          </div>
          <div className="grid2">
            <button className="btn ghost" disabled={isPending} onClick={() => call("withdrawDeposit")}>
              {t("event.withdraw")}
            </button>
            <button className="btn ghost" disabled={isPending} onClick={() => call("claimNoShowRefund")}>
              {t("pass.noShowRefund")}
            </button>
          </div>
        </div>

        <div className="card col gap8">
          <strong>{t("pass.attendance")}</strong>
          <div className="between">
            <span className="muted small">{t("event.checkedIn")}</span>
            <strong>{timeOf(guest?.checkInTime, locale)}</strong>
          </div>
          <div className="between">
            <span className="muted small">{t("pass.checkedOut")}</span>
            <strong>{timeOf(guest?.checkOutTime, locale)}</strong>
          </div>
          <span className="tiny muted">{t("pass.timeAt", { minutes: stayed, credit: event.minCreditMinutes })}</span>
        </div>

        <div className="card col gap8">
          <div className="between">
            <span className="muted small">{t("pass.finalized")}</span>
            <strong>{state?.settled ? t("common.yes") : t("common.notYet")}</strong>
          </div>
          <button className="btn accent wide" disabled={isPending} onClick={claimReward}>
            {t("pass.claim")}
          </button>
        </div>
        {error ? <div className="notice">{error}</div> : null}
      </main>
    </div>
  );
}

export default function PassPage() {
  return (
    <Suspense fallback={null}>
      <PassInner />
    </Suspense>
  );
}
