"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { BackBar, WalletButton } from "@/components/Chrome";
import { contracts, erc20Abi, profilesAbi, registryAbi, DESTINATION, GUEST_STATUS, REWARD_MODE } from "@/lib/contracts";
import { explainError } from "@/lib/errors";
import { useEvent, useEventState, useGuest, usePools } from "@/lib/useEvents";
import { EventMetadata, ipfsUrl, loadMetadata } from "@/lib/ipfs";
import { amount, dateRange, shortAddress } from "@/lib/format";

function EventInner() {
  const params = useSearchParams();
  const eventId = Number(params.get("id") ?? 0);
  const { address } = useAccount();
  const { event } = useEvent(eventId || undefined);
  const { data: state } = useEventState(eventId || undefined);
  const { data: guest, refetch: refetchGuest } = useGuest(eventId || undefined, address);
  const { data: pools } = usePools(eventId || undefined);
  const [meta, setMeta] = useState<EventMetadata>({});
  const { writeContractAsync, isPending } = useWriteContract();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (event?.metadataCID) loadMetadata(event.metadataCID).then(setMeta);
  }, [event?.metadataCID]);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: event?.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && event ? [address, contracts.registry] : undefined,
    query: { enabled: Boolean(address && event) }
  });

  const { data: host } = useReadContract({
    address: contracts.profiles,
    abi: profilesAbi,
    functionName: "profileOf",
    args: event ? [event.organizer] : undefined,
    query: { enabled: Boolean(event) }
  });

  if (!eventId) return <p className="pad muted">No event selected.</p>;
  if (!event) return <p className="pad muted">Loading event…</p>;
  const ev = event;

  const status = Number(guest?.status ?? 0);
  const isOrganizer = Boolean(address && address.toLowerCase() === event.organizer.toLowerCase());
  const needsApproval = Number(allowance ?? 0n) < Number(event.minHolding);

  async function rsvp() {
    setError(undefined);
    try {
      if (needsApproval && ev.minHolding > 0n) {
        await writeContractAsync({
          address: ev.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [contracts.registry, ev.minHolding]
        });
        await refetchAllowance();
      }
      await writeContractAsync({
        address: contracts.registry,
        abi: registryAbi,
        functionName: "rsvp",
        args: [BigInt(eventId)]
      });
      await refetchGuest();
    } catch (e) {
      setError(explainError(e));
    }
  }

  async function simple(fn: "cancelRsvp" | "withdrawDeposit") {
    setError(undefined);
    try {
      await writeContractAsync({
        address: contracts.registry,
        abi: registryAbi,
        functionName: fn,
        args: [BigInt(eventId)]
      });
      await refetchGuest();
    } catch (e) {
      setError(explainError(e));
    }
  }

  return (
    <div className="dark">
      <div className="shell">
        <BackBar title="" href="/discover" />
        <main className="pad col gap16">
          {meta.coverCID ? <img className="cover" src={ipfsUrl(meta.coverCID)} alt="" /> : <div className="cover" />}

          <div className="col gap8">
            <h1 className="display h1">{meta.title ?? `Event #${eventId}`}</h1>
            <span className="muted">{dateRange(event.startTime, event.endTime)}</span>
            <div className="row gap8" style={{ flexWrap: "wrap" }}>
              <span className="chip">Deposit {amount(event.minHolding)}</span>
              <span className="chip">Burn {amount(event.burnAmount)} on check-in</span>
              <span className="chip">{REWARD_MODE[event.rewardMode]}</span>
              {event.requireApproval ? <span className="chip">Approval required</span> : null}
            </div>
          </div>

          <div className="col gap12">
            {isOrganizer ? (
              <Link className="btn wide" href={`/manage?id=${eventId}`}>
                Manage event and approve guests
              </Link>
            ) : null}
            {!address ? <WalletButton /> : null}
            {address && status === 0 ? (
              <button className="btn accent wide" disabled={isPending} onClick={rsvp}>
                {isPending ? "Confirm in wallet…" : `RSVP + deposit ${amount(event.minHolding)}`}
              </button>
            ) : null}
            {address && status > 0 ? (
              <div className="card col gap8">
                <div className="between">
                  <span className="muted small">Your status</span>
                  <strong>{GUEST_STATUS[status]}</strong>
                </div>
                <div className="between">
                  <span className="muted small">Deposited</span>
                  <strong>{amount(guest?.deposit)}</strong>
                </div>
                <div className="between">
                  <span className="muted small">Refundable</span>
                  <strong>{amount(guest?.refundable)}</strong>
                </div>
                <div className="grid2">
                  <Link className="btn ghost" href={`/pass?id=${eventId}`}>
                    Open pass
                  </Link>
                  {Number(guest?.refundable ?? 0n) > 0 ? (
                    <button className="btn ghost" onClick={() => simple("withdrawDeposit")}>
                      Withdraw
                    </button>
                  ) : (
                    <button className="btn ghost" onClick={() => simple("cancelRsvp")}>
                      Cancel RSVP
                    </button>
                  )}
                </div>
              </div>
            ) : null}
            {error ? <div className="notice">{error}</div> : null}
          </div>

          <div className="card col gap8">
            <strong>Deposit and refund policy</strong>
            {[
              ["Left after check-in burn", event.policy.remainder],
              ["Cancel before cutoff", event.policy.cancelBefore],
              ["Cancel after cutoff", event.policy.cancelAfter],
              ["RSVP rejected", event.policy.rejected],
              ["No-show", event.policy.noShow]
            ].map(([label, dest]) => (
              <div className="between" key={label as string}>
                <span className="muted small">{label as string}</span>
                <span className="small">{DESTINATION[dest as number]}</span>
              </div>
            ))}
          </div>

          <div className="grid2">
            <div className="card col">
              <span className="tiny muted">Check-in pool</span>
              <strong className="display" style={{ fontSize: 22 }}>
                {amount(pools?.checkIn.native)} KUB
              </strong>
              <span className="tiny muted">+ {amount(pools?.checkIn.token)} tokens</span>
            </div>
            <div className="card col">
              <span className="tiny muted">Checked in</span>
              <strong className="display" style={{ fontSize: 22 }}>
                {Number(state?.checkedIn ?? 0)}
              </strong>
              <span className="tiny muted">Min credit {event.minCreditMinutes} min</span>
            </div>
          </div>

          {meta.venue || meta.mapUrl ? (
            <div className="col gap8">
              <strong>Location</strong>
              {meta.venue ? <span className="small muted">{meta.venue}</span> : null}
              {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && meta.lat && meta.lng ? (
                <iframe
                  title="map"
                  style={{ border: 0, width: "100%", height: 160, borderRadius: 14 }}
                  src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${meta.lat},${meta.lng}`}
                />
              ) : null}
              {meta.mapUrl ? (
                <a className="btn ghost wide" href={meta.mapUrl} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="col gap8">
            <strong>Host</strong>
            <div className="between">
              <Link href={`/organizer?address=${event.organizer}`} className="col">
                <strong className="small">{host?.name || shortAddress(event.organizer)}</strong>
                {host?.name ? <span className="tiny muted">{shortAddress(event.organizer)}</span> : null}
              </Link>
              {meta.telegram ? (
                <a className="chip" href={meta.telegram} target="_blank" rel="noreferrer">
                  Telegram
                </a>
              ) : null}
            </div>
            {!event.tokenCreated ? (
              <span className="tiny muted">This token was not created by this organizer.</span>
            ) : null}
          </div>

          {meta.description ? (
            <div className="col gap8">
              <strong>About event</strong>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
                {meta.description}
              </p>
            </div>
          ) : null}

          <p className="tiny muted" style={{ lineHeight: 1.5 }}>
            Event tokens trade on a bonding curve and can lose value. The organizer may hold and sell tokens and sets
            the refund policy above. Only deposit what you can afford to lose.
          </p>
        </main>
      </div>
    </div>
  );
}

export default function EventPage() {
  return (
    <Suspense fallback={<p className="pad muted">Loading…</p>}>
      <EventInner />
    </Suspense>
  );
}
