"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount, usePublicClient, useReadContract, useSignMessage, useWriteContract } from "wagmi";
import { BackBar, ConnectOnHome } from "@/components/Chrome";
import { contracts, erc20Abi, profilesAbi, registryAbi, secretsAbi } from "@/lib/contracts";
import { explainError } from "@/lib/errors";
import { useEvent, useEventState, useGuest, usePools } from "@/lib/useEvents";
import { EventMetadata, ipfsUrl, loadMetadata, PrivateLocation } from "@/lib/ipfs";
import { decryptJSON, eventKeyMessage, GUEST_KEY_MESSAGE, guestKeys, keyFromSignature, openKey, ZERO_KEY } from "@/lib/secrets";
import { amount, dateRange, shortAddress } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/locales/en";

function EventInner() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const eventId = Number(params.get("id") ?? 0);
  const { address } = useAccount();
  const { event } = useEvent(eventId || undefined);
  const { data: state } = useEventState(eventId || undefined);
  const { data: guest, refetch: refetchGuest } = useGuest(eventId || undefined, address);
  const { data: pools } = usePools(eventId || undefined);
  const [meta, setMeta] = useState<EventMetadata>({});
  const { writeContractAsync, isPending } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [revealed, setRevealed] = useState<PrivateLocation>();

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

  const isPrivate = Boolean(meta.private);

  const { data: myKey, refetch: refetchMyKey } = useReadContract({
    address: contracts.secrets,
    abi: secretsAbi,
    functionName: "encryptionKey",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && isPrivate) }
  });

  const { data: sealed } = useReadContract({
    address: contracts.secrets,
    abi: secretsAbi,
    functionName: "sealedKeyOf",
    args: address && eventId ? [BigInt(eventId), address] : undefined,
    query: { enabled: Boolean(address && isPrivate && eventId) }
  });

  if (!eventId) return <p className="pad muted">{t("common.noEvent")}</p>;
  if (!event) return <p className="pad muted">{t("common.loadingEvent")}</p>;
  const ev = event;

  const status = Number(guest?.status ?? 0);
  const isOrganizer = Boolean(address && address.toLowerCase() === event.organizer.toLowerCase());
  const needsApproval = Number(allowance ?? 0n) < Number(event.minHolding);

  async function rsvp() {
    setError(undefined);
    try {
      // Private events need the guest's public key on chain before approval,
      // so the organizer can seal the location to it.
      if (isPrivate && (!myKey || myKey === ZERO_KEY)) {
        setInfo(t("event.keySetup"));
        const { pub } = guestKeys(await signMessageAsync({ message: GUEST_KEY_MESSAGE }));
        const keyHash = await writeContractAsync({
          address: contracts.secrets,
          abi: secretsAbi,
          functionName: "setEncryptionKey",
          args: [pub]
        });
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash: keyHash });
        await refetchMyKey();
        setInfo(undefined);
      }
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
      setError(explainError(e, t));
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
      setError(explainError(e, t));
    }
  }

  async function reveal() {
    const box = meta.private;
    if (!box) return;
    setError(undefined);
    setInfo(t("event.signUnlock"));
    try {
      let key: Uint8Array;
      if (isOrganizer) {
        key = keyFromSignature(await signMessageAsync({ message: eventKeyMessage(box.salt) }));
      } else {
        const { priv } = guestKeys(await signMessageAsync({ message: GUEST_KEY_MESSAGE }));
        key = await openKey(sealed as `0x${string}`, priv);
      }
      setRevealed(await decryptJSON<PrivateLocation>(key, box));
    } catch (e) {
      setError((e as Error)?.name === "OperationError" ? t("event.unlockFailed") : explainError(e, t));
    } finally {
      setInfo(undefined);
    }
  }

  const hasSealed = Boolean(sealed && sealed !== "0x");
  const canReveal = isPrivate && !revealed && (isOrganizer || (status === 2 && hasSealed));
  const location: PrivateLocation = isPrivate ? revealed ?? {} : meta;

  const policy: [TKey, number][] = [
    ["policy.remainder", event.policy.remainder],
    ["policy.cancelBefore", event.policy.cancelBefore],
    ["policy.cancelAfter", event.policy.cancelAfter],
    ["policy.rejected", event.policy.rejected],
    ["policy.noShow", event.policy.noShow]
  ];

  return (
    <div className="dark">
      <div className="shell">
        <BackBar title="" href="/discover" />
        <main className="pad col gap16">
          {meta.coverCID ? <img className="cover" src={ipfsUrl(meta.coverCID)} alt="" /> : <div className="cover" />}

          <div className="col gap8">
            <h1 className="display h1">{meta.title ?? t("common.event", { id: eventId })}</h1>
            <span className="muted">{dateRange(event.startTime, event.endTime, locale)}</span>
            <div className="row gap8" style={{ flexWrap: "wrap" }}>
              <span className="chip">{t("event.depositChip", { amount: amount(event.minHolding) })}</span>
              <span className="chip">{t("event.burnChip", { amount: amount(event.burnAmount) })}</span>
              <span className="chip">{t(`mode.${event.rewardMode}` as TKey)}</span>
              {event.requireApproval ? <span className="chip">{t("event.approvalRequired")}</span> : null}
            </div>
          </div>

          <div className="col gap12">
            {isOrganizer ? (
              <Link className="btn wide" href={`/manage?id=${eventId}`}>
                {t("event.manage")}
              </Link>
            ) : null}
            {!address ? <ConnectOnHome /> : null}
            {address && status === 0 ? (
              <button className="btn accent wide" disabled={isPending} onClick={rsvp}>
                {isPending ? t("common.confirmWallet") : t("event.rsvp", { amount: amount(event.minHolding) })}
              </button>
            ) : null}
            {address && status > 0 ? (
              <div className="card col gap8">
                <div className="between">
                  <span className="muted small">{t("event.yourStatus")}</span>
                  <strong>{t(`status.${status}` as TKey)}</strong>
                </div>
                <div className="between">
                  <span className="muted small">{t("event.deposited")}</span>
                  <strong>{amount(guest?.deposit)}</strong>
                </div>
                <div className="between">
                  <span className="muted small">{t("event.refundable")}</span>
                  <strong>{amount(guest?.refundable)}</strong>
                </div>
                <div className="grid2">
                  <Link className="btn ghost" href={`/pass?id=${eventId}`}>
                    {t("event.openPass")}
                  </Link>
                  {Number(guest?.refundable ?? 0n) > 0 ? (
                    <button className="btn ghost" onClick={() => simple("withdrawDeposit")}>
                      {t("event.withdraw")}
                    </button>
                  ) : (
                    <button className="btn ghost" onClick={() => simple("cancelRsvp")}>
                      {t("event.cancelRsvp")}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
            {info ? <div className="card small">{info}</div> : null}
            {error ? <div className="notice">{error}</div> : null}
          </div>

          <div className="card col gap8">
            <strong>{t("event.policyTitle")}</strong>
            {policy.map(([label, dest]) => (
              <div className="between" key={label}>
                <span className="muted small">{t(label)}</span>
                <span className="small">{t(`dest.${dest}` as TKey)}</span>
              </div>
            ))}
          </div>

          <div className="grid2">
            <div className="card col">
              <span className="tiny muted">{t("event.pool")}</span>
              <strong className="display" style={{ fontSize: 22 }}>
                {t("event.poolAmount", { amount: amount(pools?.checkIn.token) })}
              </strong>
              <span className="tiny muted">{t("event.poolHint")}</span>
            </div>
            <div className="card col">
              <span className="tiny muted">{t("event.checkedIn")}</span>
              <strong className="display" style={{ fontSize: 22 }}>
                {Number(state?.checkedIn ?? 0)}
              </strong>
              <span className="tiny muted">{t("event.minCredit", { minutes: event.minCreditMinutes })}</span>
            </div>
          </div>

          {isPrivate && !revealed ? (
            <div className="col gap8">
              <strong>{t("event.location")}</strong>
              <span className="small muted">
                {status === 2 && !hasSealed && !isOrganizer ? t("event.notSharedYet") : t("event.locationPrivate")}
              </span>
              {canReveal ? (
                <button className="btn ghost wide" onClick={reveal}>
                  {t("event.showLocation")}
                </button>
              ) : null}
            </div>
          ) : null}

          {location.venue || location.mapUrl ? (
            <div className="col gap8">
              <strong>{t("event.location")}</strong>
              {location.venue ? <span className="small muted">{location.venue}</span> : null}
              {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && location.lat && location.lng ? (
                <iframe
                  title="map"
                  style={{ border: 0, width: "100%", height: 160, borderRadius: 14 }}
                  src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${location.lat},${location.lng}`}
                />
              ) : null}
              {location.mapUrl ? (
                <a className="btn ghost wide" href={location.mapUrl} target="_blank" rel="noreferrer">
                  {t("event.openMaps")}
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="col gap8">
            <strong>{t("event.host")}</strong>
            <div className="between">
              <Link href={`/organizer?address=${event.organizer}`} className="col">
                <strong className="small">{host?.name || shortAddress(event.organizer)}</strong>
                {host?.name ? <span className="tiny muted">{shortAddress(event.organizer)}</span> : null}
              </Link>
              {meta.telegram ? (
                <a className="chip" href={meta.telegram} target="_blank" rel="noreferrer">
                  {t("common.telegram")}
                </a>
              ) : null}
            </div>
            {!event.tokenCreated ? <span className="tiny muted">{t("event.notCreator")}</span> : null}
          </div>

          {meta.description ? (
            <div className="col gap8">
              <strong>{t("event.about")}</strong>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                {meta.description}
              </p>
            </div>
          ) : null}

          <p className="tiny muted" style={{ lineHeight: 1.5 }}>
            {t("event.risk")}
          </p>
        </main>
      </div>
    </div>
  );
}

export default function EventPage() {
  return (
    <Suspense fallback={null}>
      <EventInner />
    </Suspense>
  );
}
