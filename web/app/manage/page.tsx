"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseEther } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { BackBar } from "@/components/Chrome";
import { Notice, NoticeTone } from "@/components/Notice";
import { contracts, factoryAbi, registryAbi, vaultAbi } from "@/lib/contracts";
import { explainError } from "@/lib/errors";
import { useEvent, useEventState } from "@/lib/useEvents";
import { amount, shortAddress } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/locales/en";

function ManageInner() {
  const { t } = useI18n();
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

  async function run(labelKey: TKey, fn: () => Promise<`0x${string}`>) {
    const label = t(labelKey);
    setNotice({ tone: "info", text: t("manage.confirm", { label }) });
    try {
      const hash = await fn();
      setNotice({ tone: "info", text: t("manage.waiting", { label }) });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setNotice({ tone: "success", text: t("manage.done", { label }) });
      await Promise.all([refetchRsvps(), refetchGuests()]);
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e, t) });
    }
  }

  const decide = (labelKey: TKey, fn: "approve" | "reject", who: `0x${string}`[]) =>
    run(labelKey, () =>
      writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: fn, args: [BigInt(eventId), who] })
    );

  const statusOf = (i: number) => Number((guestStates?.[i]?.result as { status: number } | undefined)?.status ?? 0);

  const guests = guestInput
    .split(/[\s,]+/)
    .filter((g) => g.startsWith("0x") && g.length === 42) as `0x${string}`[];

  if (!eventId) {
    return (
      <div className="shell">
        <BackBar title={t("manage.list")} />
        <main className="pad col gap12">
          {(myEvents ?? []).map((id) => (
            <Link key={String(id)} className="card between" href={`/manage?id=${id}`}>
              <strong>{t("common.event", { id: String(id) })}</strong>
              <span className="muted small">{t("manage.open")}</span>
            </Link>
          ))}
          {(myEvents ?? []).length === 0 ? <p className="muted small">{t("manage.none")}</p> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <BackBar title={t("manage.title", { id: eventId })} href="/manage" />
      <main className="pad col gap16">
        <div className="grid2">
          <div className="card col">
            <span className="tiny muted">{t("event.checkedIn")}</span>
            <strong className="display" style={{ fontSize: 22 }}>
              {Number(state?.checkedIn ?? 0)}
            </strong>
          </div>
          <div className="card col">
            <span className="tiny muted">{t("manage.checkedOut")}</span>
            <strong className="display" style={{ fontSize: 22 }}>
              {Number(state?.checkedOut ?? 0)}
            </strong>
          </div>
        </div>

        <div className="card col gap12">
          <strong>{t("manage.guests")}</strong>
          <div className="col gap8">
            <span className="label">{t("manage.rsvps", { count: guestList.length })}</span>
            {guestList.length === 0 ? <span className="small muted">{t("manage.noRsvps")}</span> : null}
            {guestList.map((g, i) => {
              const info = guestStates?.[i]?.result as { status: number; checkInTime: bigint } | undefined;
              const statusIndex = Number(info?.status ?? 0);
              const checkedIn = Boolean(info && info.checkInTime > 0n);
              return (
                <div key={g} className="between divider" style={{ padding: "8px 0" }}>
                  <div className="col">
                    <span className="small">{shortAddress(g)}</span>
                    <span className="tiny muted">{checkedIn ? t("event.checkedIn") : t(`status.${statusIndex}` as TKey)}</span>
                  </div>
                  <div className="row gap8">
                    {statusIndex === 1 ? (
                      <button className="chip" disabled={isPending} onClick={() => decide("manage.approve", "approve", [g])}>
                        {t("manage.approve")}
                      </button>
                    ) : null}
                    {statusIndex === 1 || statusIndex === 2 ? (
                      <button className="chip" disabled={isPending} onClick={() => decide("manage.reject", "reject", [g])}>
                        {t("manage.reject")}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {guestList.some((_, i) => statusOf(i) === 1) ? (
              <button
                className="btn wide"
                disabled={isPending}
                onClick={() => decide("manage.approveAll", "approve", guestList.filter((_, i) => statusOf(i) === 1))}
              >
                {t("manage.approveAll")}
              </button>
            ) : null}
          </div>

          <textarea className="field area" placeholder={t("manage.paste")} value={guestInput} onChange={(e) => setGuestInput(e.target.value)} />
          <div className="grid2">
            <button className="btn" disabled={isPending || guests.length === 0} onClick={() => decide("manage.approve", "approve", guests)}>
              {t("manage.approve")}
            </button>
            <button className="btn ghost" disabled={isPending || guests.length === 0} onClick={() => decide("manage.reject", "reject", guests)}>
              {t("manage.reject")}
            </button>
            <button
              className="btn ghost"
              disabled={isPending || guests.length === 0}
              onClick={() => run("manage.invite", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "invite", args: [BigInt(eventId), guests] }))}
            >
              {t("manage.invite")}
            </button>
            <button
              className="btn ghost"
              disabled={isPending || guests.length === 0}
              onClick={() => run("manage.checkIn", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "checkInBatch", args: [BigInt(eventId), guests] }))}
            >
              {t("manage.checkIn")}
            </button>
          </div>
        </div>

        <div className="card col gap12">
          <strong>{t("manage.door")}</strong>
          <Link className="btn ghost wide" href={`/kiosk?id=${eventId}`}>
            {t("manage.kiosk")}
          </Link>
          <button
            className="btn ghost wide"
            disabled={isPending || guests.length !== 1}
            onClick={() => run("manage.addStaff", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "setStaff", args: [BigInt(eventId), guests[0], true] }))}
          >
            {t("manage.addStaff")}
          </button>
        </div>

        <div className="card col gap12">
          <strong>{t("manage.rewards")}</strong>
          <label className="between">
            <span className="small">{t("manage.topUp")}</span>
            <input className="field" style={{ width: 120 }} value={topUp} onChange={(e) => setTopUp(e.target.value)} />
          </label>
          <button
            className="btn accent wide"
            disabled={isPending}
            onClick={() => run("manage.fund", () => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "fundCheckIn", value: parseEther(topUp || "0"), args: [BigInt(eventId), 0n] }))}
          >
            {t("manage.fund")}
          </button>
          <button
            className="btn ghost wide"
            disabled={isPending}
            onClick={() => run("manage.withdrawProceeds", () => writeContractAsync({ address: contracts.registry, abi: registryAbi, functionName: "withdrawProceeds", args: [BigInt(eventId)] }))}
          >
            {t("manage.withdrawProceeds", { amount: amount(state?.organizerProceeds) })}
          </button>
          <span className="tiny muted">{t("manage.proceedsHint")}</span>
          <div className="grid2">
            <button
              className="btn ghost"
              disabled={isPending}
              onClick={() => run("manage.finalize", () => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "finalize", args: [BigInt(eventId)] }))}
            >
              {t("manage.finalize")}
            </button>
            <button
              className="btn ghost"
              disabled={isPending}
              onClick={() => run("manage.leftover", () => writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "withdrawLeftover", args: [BigInt(eventId)] }))}
            >
              {t("manage.leftover")}
            </button>
          </div>
          {event ? (
            <span className="tiny muted">
              {t("manage.depositBurn", { deposit: amount(event.minHolding), burn: amount(event.burnAmount) })}
            </span>
          ) : null}
        </div>
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      </main>
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={null}>
      <ManageInner />
    </Suspense>
  );
}
