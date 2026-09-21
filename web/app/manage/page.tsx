"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseEther } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { BackBar } from "@/components/Chrome";
import { Notice, NoticeTone } from "@/components/Notice";
import { contracts, factoryAbi, registryAbi, vaultAbi, GUEST_STATUS } from "@/lib/contracts";
import { explainError } from "@/lib/errors";
import { useEvent, useEventState } from "@/lib/useEvents";
import { amount, shortAddress } from "@/lib/format";

function ManageInner() {
  const params = useSearchParams();
  const eventId = Number(params.get("id") ?? 0);
  const { address } = useAccount();
  const { event } = useEvent(eventId || undefined);
  const { data: state } = useEventState(eventId || undefined);
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const [guestInput, setGuestInput] = useState("");
  const [topUp, setTopUp] = useState("1");
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string }>();

  const { data: myEvents } = useReadContract({
    address: contracts.factory,
    abi: factoryAbi,
    functionName: "eventsByOrganizer",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  });

  const { data: rsvps, refetch: refetchRsvps } = useReadContract({
    address: contracts.registry,
    abi: registryAbi,
    functionName: "rsvpAt",
    args: eventId ? [BigInt(eventId), 0n, 50n] : undefined,
    query: { enabled: Boolean(eventId) }
  });

  const guestList = (rsvps ?? []) as readonly `0x${string}`[];
  const { data: guestStates, refetch: refetchGuests } = useReadContracts({
    contracts: guestList.map((g) => ({
      address: contracts.registry,
      abi: registryAbi,
      functionName: "guestOf" as const,
      args: [BigInt(eventId), g] as const
    })),
    query: { enabled: guestList.length > 0 }
  });

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    setNotice({ tone: "info", text: `${label}: confirm in your wallet.` });
    try {
      const hash = await fn();
      setNotice({ tone: "info", text: `${label}: waiting for confirmation…` });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setNotice({ tone: "success", text: `${label}: done.` });
      await Promise.all([refetchRsvps(), refetchGuests()]);
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e) });
    }
  }

  const decide = (label: string, fn: "approve" | "reject", who: `0x${string}`[]) =>
    run(label, () =>
      writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: fn, args: [BigInt(eventId), who] })
    );

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
            <button className="btn" disabled={isPending || guests.length === 0} onClick={() => run("Approve", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "approve", args: [BigInt(eventId), guests] }))}>
              Approve
            </button>
            <button className="btn ghost" disabled={isPending || guests.length === 0} onClick={() => run("Reject", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "reject", args: [BigInt(eventId), guests] }))}>
              Reject
            </button>
            <button className="btn ghost" disabled={isPending || guests.length === 0} onClick={() => run("Invite", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "invite", args: [BigInt(eventId), guests] }))}>
              Invite
            </button>
            <button className="btn ghost" disabled={isPending || guests.length === 0} onClick={() => run("Check in", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "checkInBatch", args: [BigInt(eventId), guests] }))}>
              Check in
            </button>
          </div>
          <div className="col gap8">
            <span className="label">RSVPs ({guestList.length})</span>
            {guestList.length === 0 ? <span className="small muted">No one has RSVP'd yet.</span> : null}
            {guestList.map((g, i) => {
              const info = guestStates?.[i]?.result as { status: number; checkInTime: bigint } | undefined;
              const statusIndex = Number(info?.status ?? 0);
              const checkedIn = Boolean(info && info.checkInTime > 0n);
              return (
                <div key={g} className="between divider" style={{ padding: "8px 0" }}>
                  <div className="col">
                    <span className="small">{shortAddress(g)}</span>
                    <span className="tiny muted">{checkedIn ? "Checked in" : GUEST_STATUS[statusIndex]}</span>
                  </div>
                  <div className="row gap8">
                    {statusIndex === 1 ? (
                      <button className="chip" disabled={isPending} onClick={() => decide("Approve", "approve", [g])}>
                        Approve
                      </button>
                    ) : null}
                    {statusIndex === 1 || statusIndex === 2 ? (
                      <button className="chip" disabled={isPending} onClick={() => decide("Reject", "reject", [g])}>
                        Reject
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {guestStates?.some((r) => Number((r.result as { status: number } | undefined)?.status) === 1) ? (
              <button
                className="btn wide"
                disabled={isPending}
                onClick={() =>
                  decide(
                    "Approve all pending",
                    "approve",
                    guestList.filter((_, i) => Number((guestStates?.[i]?.result as { status: number } | undefined)?.status) === 1)
                  )
                }
              >
                Approve all pending
              </button>
            ) : null}
          </div>
        </div>

        <div className="card col gap12">
          <strong>Door</strong>
          <Link className="btn ghost wide" href={`/kiosk?id=${eventId}`}>
            Open kiosk screen
          </Link>
          <button className="btn ghost wide" disabled={isPending || guests.length !== 1} onClick={() => run("Add staff", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "setStaff", args: [BigInt(eventId), guests[0], true] }))}>
            Add first address above as staff
          </button>
        </div>

        <div className="card col gap12">
          <strong>Rewards</strong>
          <label className="between">
            <span className="small">Top up (KUB)</span>
            <input className="field" style={{ width: 120 }} value={topUp} onChange={(e) => setTopUp(e.target.value)} />
          </label>
          <button className="btn accent wide" disabled={isPending} onClick={() => run("Fund pool", () => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "fundCheckIn", value: parseEther(topUp || "0"), args: [BigInt(eventId), 0n] }))}>
            Fund check-in pool
          </button>
          <button className="btn ghost wide" disabled={isPending} onClick={() => run("Withdraw proceeds", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "withdrawProceeds", args: [BigInt(eventId)] }))}>
            Withdraw ticket proceeds ({amount(state?.organizerProceeds)})
          </button>
          <span className="tiny muted">Available once the event has ended, for deposits set to &quot;Organizer keeps it&quot;.</span>
          <div className="grid2">
            <button className="btn ghost" disabled={isPending} onClick={() => run("Finalize", () => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "finalize", args: [BigInt(eventId)] }))}>
              Finalize
            </button>
            <button className="btn ghost" disabled={isPending} onClick={() => run("Withdraw leftover", () => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "withdrawLeftover", args: [BigInt(eventId)] }))}>
              Withdraw leftover
            </button>
          </div>
          {event ? <span className="tiny muted">Deposit {amount(event.minHolding)} · burn {amount(event.burnAmount)}</span> : null}
        </div>
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
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
