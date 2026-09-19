"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useAccount, useWriteContract } from "wagmi";
import { BackBar, WalletButton } from "@/components/Chrome";
import { contracts, registryAbi, vaultAbi } from "@/lib/contracts";
import { useEvent, useEventState, useGuest } from "@/lib/useEvents";
import { amount, dateRange, minutesAt } from "@/lib/format";

function PassInner() {
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
      <div className="pad col gap12">
        <p className="muted">Connect your wallet to see your pass.</p>
        <WalletButton />
      </div>
    );
  }
  if (!eventId || !event) return <p className="pad muted">Open a pass from an event page.</p>;

  const stayed = minutesAt(guest?.checkInTime, guest?.checkOutTime);

  async function call(fn: "withdrawDeposit" | "claimNoShowRefund") {
    setError(undefined);
    try {
      await writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: fn, args: [BigInt(eventId)] });
      await refetch();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    }
  }

  async function claimReward() {
    setError(undefined);
    try {
      await writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "claim", args: [BigInt(eventId)] });
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    }
  }

  return (
    <div className="shell">
      <BackBar title="My pass" href={`/event?id=${eventId}`} />
      <main className="pad col gap12">
        <div className="card col gap12">
          <div className="col">
            <strong style={{ fontSize: 20 }}>Event #{eventId}</strong>
            <span className="small muted">{dateRange(event.startTime, event.endTime)}</span>
          </div>
          {qr ? <img src={qr} alt="Your wallet QR code" style={{ width: "100%", borderRadius: 16 }} /> : null}
          <span className="small muted" style={{ textAlign: "center" }}>
            Show this to staff at the door
          </span>
        </div>

        <div className="card col gap8">
          <strong>Your deposit</strong>
          <div className="between">
            <span className="muted small">Held by the contract</span>
            <strong>{amount(guest?.deposit)}</strong>
          </div>
          <div className="between">
            <span className="muted small">Burns at check-in</span>
            <strong>{amount(event.burnAmount)}</strong>
          </div>
          <div className="between">
            <span className="muted small">Refundable now</span>
            <strong>{amount(guest?.refundable)}</strong>
          </div>
          <div className="grid2">
            <button className="btn ghost" disabled={isPending} onClick={() => call("withdrawDeposit")}>
              Withdraw
            </button>
            <button className="btn ghost" disabled={isPending} onClick={() => call("claimNoShowRefund")}>
              No-show refund
            </button>
          </div>
        </div>

        <div className="card col gap8">
          <strong>Your attendance</strong>
          <div className="between">
            <span className="muted small">Checked in</span>
            <strong>{guest?.checkInTime ? new Date(Number(guest.checkInTime) * 1000).toLocaleTimeString() : "—"}</strong>
          </div>
          <div className="between">
            <span className="muted small">Checked out</span>
            <strong>{guest?.checkOutTime ? new Date(Number(guest.checkOutTime) * 1000).toLocaleTimeString() : "—"}</strong>
          </div>
          <span className="tiny muted">
            Time at event {stayed} min. Skip check-out and you are counted as {event.minCreditMinutes} min.
          </span>
        </div>

        <div className="card col gap8">
          <div className="between">
            <span className="muted small">Event finalized</span>
            <strong>{state?.settled ? "Yes" : "Not yet"}</strong>
          </div>
          <button className="btn accent wide" disabled={isPending} onClick={claimReward}>
            Claim reward
          </button>
        </div>
        {error ? <div className="notice">{error}</div> : null}
      </main>
    </div>
  );
}

export default function PassPage() {
  return (
    <Suspense fallback={<p className="pad muted">Loading…</p>}>
      <PassInner />
    </Suspense>
  );
}
