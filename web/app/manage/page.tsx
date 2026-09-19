"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseEther } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { BackBar } from "@/components/Chrome";
import { contracts, factoryAbi, registryAbi, vaultAbi } from "@/lib/contracts";
import { useEvent, useEventState } from "@/lib/useEvents";
import { amount, shortAddress } from "@/lib/format";

function ManageInner() {
  const params = useSearchParams();
  const eventId = Number(params.get("id") ?? 0);
  const { address } = useAccount();
  const { event } = useEvent(eventId || undefined);
  const { data: state } = useEventState(eventId || undefined);
  const { writeContractAsync, isPending } = useWriteContract();
  const [guestInput, setGuestInput] = useState("");
  const [topUp, setTopUp] = useState("1");
  const [status, setStatus] = useState<string>();

  const { data: myEvents } = useReadContract({
    address: contracts.factory,
    abi: factoryAbi,
    functionName: "eventsByOrganizer",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  });

  const { data: rsvps } = useReadContract({
    address: contracts.registry,
    abi: registryAbi,
    functionName: "rsvpAt",
    args: eventId ? [BigInt(eventId), 0n, 50n] : undefined,
    query: { enabled: Boolean(eventId) }
  });

  async function run(fn: () => Promise<unknown>) {
    setStatus(undefined);
    try {
      await fn();
      setStatus("Sent");
    } catch (e) {
      setStatus((e as Error).message.split("\n")[0]);
    }
  }

  const guests = guestInput
    .split(/[\s,]+/)
    .filter((g) => g.startsWith("0x") && g.length === 42) as `0x${string}`[];

  if (!eventId) {
    return (
      <div className="shell">
        <BackBar title="Manage events" />
        <main className="pad col gap12">
          {(myEvents ?? []).map((id) => (
            <Link key={String(id)} className="card between" href={`/manage?id=${id}`}>
              <strong>Event #{String(id)}</strong>
              <span className="muted small">Open</span>
            </Link>
          ))}
          {(myEvents ?? []).length === 0 ? <p className="muted small">You have not created an event yet.</p> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <BackBar title={`Manage #${eventId}`} href="/manage" />
      <main className="pad col gap16">
        <div className="grid2">
          <div className="card col">
            <span className="tiny muted">Checked in</span>
            <strong className="display" style={{ fontSize: 22 }}>{Number(state?.checkedIn ?? 0)}</strong>
          </div>
          <div className="card col">
            <span className="tiny muted">Checked out</span>
            <strong className="display" style={{ fontSize: 22 }}>{Number(state?.checkedOut ?? 0)}</strong>
          </div>
        </div>

        <div className="card col gap12">
          <strong>Guests</strong>
          <textarea
            className="field area"
            placeholder="0x… addresses, separated by spaces or commas"
            value={guestInput}
            onChange={(e) => setGuestInput(e.target.value)}
          />
          <div className="grid2">
            <button className="btn" disabled={isPending || guests.length === 0} onClick={() => run(() => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "approve", args: [BigInt(eventId), guests] }))}>
              Approve
            </button>
            <button className="btn ghost" disabled={isPending || guests.length === 0} onClick={() => run(() => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "reject", args: [BigInt(eventId), guests] }))}>
              Reject
            </button>
            <button className="btn ghost" disabled={isPending || guests.length === 0} onClick={() => run(() => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "invite", args: [BigInt(eventId), guests] }))}>
              Invite
            </button>
            <button className="btn ghost" disabled={isPending || guests.length === 0} onClick={() => run(() => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "checkInBatch", args: [BigInt(eventId), guests] }))}>
              Check in
            </button>
          </div>
          <div className="col gap8">
            <span className="label">RSVPs</span>
            {(rsvps ?? []).map((g) => (
              <span key={g} className="small muted">
                {shortAddress(g)}
              </span>
            ))}
          </div>
        </div>

        <div className="card col gap12">
          <strong>Door</strong>
          <Link className="btn ghost wide" href={`/kiosk?id=${eventId}`}>
            Open kiosk screen
          </Link>
          <button className="btn ghost wide" disabled={isPending || guests.length !== 1} onClick={() => run(() => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "setStaff", args: [BigInt(eventId), guests[0], true] }))}>
            Add first address above as staff
          </button>
        </div>

        <div className="card col gap12">
          <strong>Rewards</strong>
          <label className="between">
            <span className="small">Top up (KUB)</span>
            <input className="field" style={{ width: 120 }} value={topUp} onChange={(e) => setTopUp(e.target.value)} />
          </label>
          <button className="btn accent wide" disabled={isPending} onClick={() => run(() => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "fundCheckIn", value: parseEther(topUp || "0"), args: [BigInt(eventId), 0n] }))}>
            Fund check-in pool
          </button>
          <div className="grid2">
            <button className="btn ghost" disabled={isPending} onClick={() => run(() => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "finalize", args: [BigInt(eventId)] }))}>
              Finalize
            </button>
            <button className="btn ghost" disabled={isPending} onClick={() => run(() => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "withdrawLeftover", args: [BigInt(eventId)] }))}>
              Withdraw leftover
            </button>
          </div>
          {event ? <span className="tiny muted">Deposit {amount(event.minHolding)} · burn {amount(event.burnAmount)}</span> : null}
        </div>
        {status ? <div className="notice">{status}</div> : null}
      </main>
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<p className="pad muted">Loading…</p>}>
      <ManageInner />
    </Suspense>
  );
}
