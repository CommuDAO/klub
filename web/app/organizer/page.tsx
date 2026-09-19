"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { BackBar } from "@/components/Chrome";
import { EventRow } from "@/components/EventRow";
import { contracts, factoryAbi, profilesAbi } from "@/lib/contracts";
import { useEventList } from "@/lib/useEvents";
import { shortAddress } from "@/lib/format";

function OrganizerInner() {
  const params = useSearchParams();
  const organizer = (params.get("address") ?? "") as `0x${string}`;
  const { address } = useAccount();
  const { events } = useEventList();
  const { writeContractAsync, isPending } = useWriteContract();

  const { data: profile } = useReadContract({
    address: contracts.profiles,
    abi: profilesAbi,
    functionName: "profileOf",
    args: organizer ? [organizer] : undefined,
    query: { enabled: Boolean(organizer) }
  });

  const { data: followers } = useReadContract({
    address: contracts.profiles,
    abi: profilesAbi,
    functionName: "followerCount",
    args: organizer ? [organizer] : undefined,
    query: { enabled: Boolean(organizer) }
  });

  const { data: following, refetch } = useReadContract({
    address: contracts.profiles,
    abi: profilesAbi,
    functionName: "isFollowing",
    args: address && organizer ? [address, organizer] : undefined,
    query: { enabled: Boolean(address && organizer) }
  });

  const { data: ids } = useReadContract({
    address: contracts.factory,
    abi: factoryAbi,
    functionName: "eventsByOrganizer",
    args: organizer ? [organizer] : undefined,
    query: { enabled: Boolean(organizer) }
  });

  const theirs = events.filter((e) => (ids ?? []).some((id) => Number(id) === e.id));
  const now = BigInt(Math.floor(Date.now() / 1000));

  async function toggleFollow() {
    await writeContractAsync({
      address: contracts.profiles,
      abi: profilesAbi,
      functionName: following ? "unfollow" : "follow",
      args: [organizer]
    });
    await refetch();
  }

  return (
    <div className="shell">
      <BackBar title="Organizer" href="/discover" />
      <main className="pad col gap16">
        <div className="col gap8">
          <h1 className="display h1">{profile?.name || shortAddress(organizer)}</h1>
          <span className="small muted">{Number(followers ?? 0)} followers · {theirs.length} events</span>
          <div className="row gap8">
            <button className="btn" disabled={isPending || !address} onClick={toggleFollow}>
              {following ? "Unfollow" : "Follow"}
            </button>
            {profile?.telegram ? (
              <a className="btn ghost" href={profile.telegram} target="_blank" rel="noreferrer">
                Telegram
              </a>
            ) : null}
          </div>
        </div>

        <section className="col gap8">
          <strong>Upcoming</strong>
          {theirs.filter((e) => e.endTime > now).map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </section>

        <section className="col gap8">
          <strong>Past</strong>
          {theirs.filter((e) => e.endTime <= now).map((e) => (
            <EventRow key={e.id} event={e} badge="Ended" />
          ))}
        </section>
      </main>
    </div>
  );
}

export default function OrganizerPage() {
  return (
    <Suspense fallback={<p className="pad muted">Loading…</p>}>
      <OrganizerInner />
    </Suspense>
  );
}
