"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeAbiParameters, parseAbiParameters, parseEther, parseEventLogs, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { BackBar } from "@/components/Chrome";
import { Notice, NoticeTone } from "@/components/Notice";
import { contracts, factoryAbi, profilesAbi, DESTINATION, METHOD } from "@/lib/contracts";
import { explainError } from "@/lib/errors";
import { coordsFromMapUrl, EventMetadata, ipfsUrl } from "@/lib/ipfs";
import { pinataReady, uploadCover } from "@/lib/pinata";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/locales/en";

const toUnix = (value: string) => BigInt(Math.floor(new Date(value).getTime() / 1000));

/// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const MIN_LEAD_MINUTES = 5;

export default function CreatePage() {
  const { t } = useI18n();
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: profile } = useReadContract({
    address: contracts.profiles,
    abi: profilesAbi,
    functionName: "profileOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  });
  const { data: minInitialBuy } = useReadContract({
    address: contracts.factory,
    abi: factoryAbi,
    functionName: "minInitialBuy"
  });

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    organizerName: "",
    token: "",
    description: "",
    venue: "",
    mapUrl: "",
    telegram: "",
    start: "",
    end: "",
    rewardMode: 0,
    minCredit: 60,
    capacity: 0,
    minHolding: "500",
    burnAmount: "200",
    requireApproval: true,
    methods: METHOD.STAFF | METHOD.KIOSK,
    remainder: 0,
    cancelBefore: 0,
    cancelAfter: 1,
    rejected: 0,
    noShow: 1,
    cutoff: "",
    initialBuy: "0.2"
  });
  const [coverCID, setCoverCID] = useState("");
  const [tokenImageCID, setTokenImageCID] = useState("");
  const [uploading, setUploading] = useState<"" | "cover" | "token">("");
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | undefined>();
  const [working, setWorking] = useState(false);

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (profile?.name) setForm((f) => ({ ...f, organizerName: f.organizerName || profile.name }));
  }, [profile?.name]);

  useEffect(() => {
    const start = new Date(Date.now() + 30 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    setForm((f) => ({ ...f, start: f.start || toLocalInput(start), end: f.end || toLocalInput(end) }));
  }, []);

  /// Same rules the factory enforces, checked before the wallet opens so a
  /// bad form never becomes a failed transaction.
  function validate(): string | undefined {
    if (!address) return t("v.connect");
    if (!form.name.trim()) return t("v.name");
    if (!form.symbol.trim()) return t("v.symbol");
    if (!form.start || !form.end) return t("v.times");
    const start = new Date(form.start).getTime();
    const end = new Date(form.end).getTime();
    if (start < Date.now() + MIN_LEAD_MINUTES * 60 * 1000) return t("v.startLead", { minutes: MIN_LEAD_MINUTES });
    if (end <= start) return t("v.endAfter");
    if (form.cutoff && new Date(form.cutoff).getTime() > start) return t("v.cutoff");
    if (Number(form.burnAmount || 0) > Number(form.minHolding || 0)) return t("v.burn");
    if (Number(form.rewardMode) === 0 && Number(form.minCredit) <= 0) return t("v.minCredit");
    if (!form.token && Number(form.initialBuy || 0) <= 0.1) return t("v.initialBuy");
    return undefined;
  }

  async function onImagePicked(kind: "cover" | "token", file?: File) {
    if (!file) return;
    setNotice(undefined);
    setUploading(kind);
    try {
      const cid = await uploadCover(file);
      if (kind === "cover") setCoverCID(cid);
      else setTokenImageCID(cid);
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e, t) });
    } finally {
      setUploading("");
    }
  }

  function buildMetadata(): string {
    const { lat, lng } = coordsFromMapUrl(form.mapUrl);
    const meta: EventMetadata = {
      title: form.name,
      description: form.description || undefined,
      coverCID: coverCID || undefined,
      venue: form.venue || undefined,
      mapUrl: form.mapUrl || undefined,
      lat,
      lng,
      telegram: form.telegram || undefined
    };
    return JSON.stringify(meta);
  }

  async function submit() {
    setNotice(undefined);
    const problem = validate();
    if (problem) {
      setNotice({ tone: "error", text: problem });
      return;
    }
    if (!publicClient) return;
    setWorking(true);

    const logoCID = tokenImageCID || coverCID;
    const logo = logoCID ? ipfsUrl(logoCID) : "";
    const needsName = Boolean(form.organizerName.trim()) && form.organizerName.trim() !== (profile?.name ?? "");
    const total = 2 + (needsName ? 1 : 0);

    try {
      // The launchpad shows logo, description and three links. link1 is the
      // event page, link2 (X) stays empty, link3 is Telegram, which is the
      // same order other tokens on the launchpad use.
      const count = await publicClient.readContract({ address: contracts.factory, abi: factoryAbi, functionName: "eventCount" });
      const eventUrl = `${window.location.origin}/event?id=${count + 1n}`;
      const packed = encodeAbiParameters(parseAbiParameters("string, string, string, string, string"), [
        logo,
        form.description.trim(),
        eventUrl,
        "",
        form.telegram.trim()
      ]);
      const launchInfo = `klub:${packed.slice(2)}`;

      setNotice({ tone: "info", text: t("create.step1", { n: 1, total }) });
      const hash = await writeContractAsync({
        address: contracts.factory,
        abi: factoryAbi,
        functionName: "createEvent",
        value: parseEther(form.initialBuy || "0"),
        args: [
          {
            token: (form.token || "0x0000000000000000000000000000000000000000") as `0x${string}`,
            name: form.name,
            symbol: form.symbol,
            metadataCID: launchInfo,
            startTime: toUnix(form.start),
            endTime: toUnix(form.end),
            rewardMode: Number(form.rewardMode),
            minCreditMinutes: Number(form.minCredit),
            methods: Number(form.methods),
            requireApproval: form.requireApproval,
            capacity: Number(form.capacity),
            minHolding: parseUnits(form.minHolding || "0", 18),
            burnAmount: parseUnits(form.burnAmount || "0", 18),
            policy: {
              remainder: Number(form.remainder),
              cancelBefore: Number(form.cancelBefore),
              cancelAfter: Number(form.cancelAfter),
              rejected: Number(form.rejected),
              noShow: Number(form.noShow),
              refundCutoff: form.cutoff ? toUnix(form.cutoff) : toUnix(form.start)
            },
            minTokensOut: 0n,
            routeData: "0x" as `0x${string}`
          }
        ]
      });
      setNotice({ tone: "info", text: t("create.waiting") });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(t("create.failedOnChain"));
      const created = parseEventLogs({ abi: factoryAbi, eventName: "EventCreated", logs: receipt.logs })[0];
      if (!created) throw new Error(t("create.noEventId"));
      const eventId = created.args.eventId;

      setNotice({ tone: "info", text: t("create.step2", { n: 2, total }) });
      const metaHash = await writeContractAsync({
        address: contracts.factory,
        abi: factoryAbi,
        functionName: "setMetadata",
        args: [eventId, buildMetadata()]
      });
      await publicClient.waitForTransactionReceipt({ hash: metaHash });

      if (needsName) {
        setNotice({ tone: "info", text: t("create.step3", { n: 3, total }) });
        const nameHash = await writeContractAsync({
          address: contracts.profiles,
          abi: profilesAbi,
          functionName: "setProfile",
          args: [form.organizerName.trim(), profile?.avatarCID ?? "", profile?.telegram || form.telegram || ""]
        });
        await publicClient.waitForTransactionReceipt({ hash: nameHash });
      }

      setNotice({ tone: "success", text: t("create.done") });
      router.push(`/event?id=${eventId}`);
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e, t) });
    } finally {
      setWorking(false);
    }
  }

  const policyRows: [TKey, keyof typeof form][] = [
    ["policy.remainder", "remainder"],
    ["policy.cancelBefore", "cancelBefore"],
    ["policy.cancelAfter", "cancelAfter"],
    ["policy.rejected", "rejected"],
    ["policy.noShow", "noShow"]
  ];

  const methods: [TKey, number][] = [
    ["method.staff", METHOD.STAFF],
    ["method.kiosk", METHOD.KIOSK],
    ["method.code", METHOD.CODE]
  ];

  return (
    <div className="shell">
      <BackBar title={t("create.title")} />
      <main className="pad col gap16">
        <div className="card col gap12">
          <strong>{t("create.about")}</strong>

          <label className="col gap8">
            <span className="label">{t("create.eventName")}</span>
            <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>

          <label className="col gap8">
            <span className="label">{t("create.symbol")}</span>
            <input className="field" value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="KNIGHT" />
          </label>

          <label className="col gap8">
            <span className="label">{t("create.organizerName")}</span>
            <input className="field" value={form.organizerName} onChange={(e) => set("organizerName", e.target.value)} placeholder={t("create.organizerNameHint")} />
          </label>

          <div className="col gap8">
            <span className="label">{t("create.cover")}</span>
            <span className="tiny muted">{t("create.coverHint")}</span>
            {coverCID ? <img className="cover" src={ipfsUrl(coverCID)} alt="" /> : null}
            <input
              className="field"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!pinataReady || uploading !== ""}
              onChange={(e) => onImagePicked("cover", e.target.files?.[0])}
              style={{ paddingTop: 11 }}
            />
            {uploading === "cover" ? <span className="tiny muted">{t("create.uploading")}</span> : null}
            {!pinataReady ? <span className="tiny muted">{t("create.uploadOff")}</span> : null}
          </div>

          <div className="col gap8">
            <span className="label">{t("create.tokenImage")}</span>
            <span className="tiny muted">{t("create.tokenImageHint")}</span>
            {tokenImageCID ? (
              <img src={ipfsUrl(tokenImageCID)} alt="" style={{ width: 96, height: 96, borderRadius: 16, objectFit: "cover" }} />
            ) : null}
            <input
              className="field"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!pinataReady || uploading !== ""}
              onChange={(e) => onImagePicked("token", e.target.files?.[0])}
              style={{ paddingTop: 11 }}
            />
            {uploading === "token" ? <span className="tiny muted">{t("create.uploading")}</span> : null}
          </div>

          <label className="col gap8">
            <span className="label">{t("create.description")}</span>
            <textarea
              className="field area"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("create.descriptionHint")}
            />
          </label>
        </div>

        <div className="card col gap12">
          <strong>{t("create.whereWhen")}</strong>

          <label className="col gap8">
            <span className="label">{t("create.venue")}</span>
            <input className="field" value={form.venue} onChange={(e) => set("venue", e.target.value)} />
          </label>

          <label className="col gap8">
            <span className="label">{t("create.mapLink")}</span>
            <input className="field" value={form.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
            <span className="tiny muted">{t("create.mapHint")}</span>
          </label>

          <label className="col gap8">
            <span className="label">{t("create.telegram")}</span>
            <input className="field" value={form.telegram} onChange={(e) => set("telegram", e.target.value)} placeholder="https://t.me/…" />
            <span className="tiny muted">{t("create.telegramHint")}</span>
          </label>

          <label className="col gap8">
            <span className="label">{t("create.starts")}</span>
            <input className="field" type="datetime-local" value={form.start} onChange={(e) => set("start", e.target.value)} />
          </label>

          <label className="col gap8">
            <span className="label">{t("create.ends")}</span>
            <input className="field" type="datetime-local" value={form.end} onChange={(e) => set("end", e.target.value)} />
          </label>
        </div>

        <div className="card col gap12">
          <strong>{t("create.guests")}</strong>
          <label className="between">
            <span className="small">{t("create.capacity")}</span>
            <input className="field" style={{ width: 110 }} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
          </label>
          <label className="between">
            <span className="small">{t("create.hold")}</span>
            <input className="field" style={{ width: 110 }} value={form.minHolding} onChange={(e) => set("minHolding", e.target.value)} />
          </label>
          <label className="between">
            <span className="small">{t("create.burn")}</span>
            <input className="field" style={{ width: 110 }} value={form.burnAmount} onChange={(e) => set("burnAmount", e.target.value)} />
          </label>
          <label className="between">
            <span className="small">{t("create.requireApproval")}</span>
            <input type="checkbox" checked={form.requireApproval} onChange={(e) => set("requireApproval", e.target.checked)} />
          </label>
          <div className="row gap8" style={{ flexWrap: "wrap" }}>
            {methods.map(([label, bit]) => (
              <button
                key={label}
                className="chip"
                style={form.methods & bit ? { background: "var(--ink)", color: "#fff" } : {}}
                onClick={() => set("methods", form.methods ^ bit)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>

        <div className="card col gap12">
          <strong>{t("create.rewards")}</strong>
          <label className="between">
            <span className="small">{t("create.mode")}</span>
            <select className="field" style={{ width: 190 }} value={form.rewardMode} onChange={(e) => set("rewardMode", e.target.value)}>
              <option value={0}>{t("mode.0")}</option>
              <option value={1}>{t("mode.1")}</option>
            </select>
          </label>
          <label className="between">
            <span className="small">{t("create.minCredit")}</span>
            <input className="field" style={{ width: 110 }} value={form.minCredit} onChange={(e) => set("minCredit", e.target.value)} />
          </label>
        </div>

        <div className="card col gap12">
          <strong>{t("create.policy")}</strong>
          {policyRows.map(([label, key]) => (
            <label className="between" key={key}>
              <span className="small">{t(label)}</span>
              <select className="field" style={{ width: 160 }} value={form[key] as number} onChange={(e) => set(key, e.target.value)}>
                {DESTINATION.map((_, i) => (
                  <option key={i} value={i}>
                    {t(`dest.${i}` as TKey)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="col gap8">
            <span className="label">{t("create.cutoff")}</span>
            <input className="field" type="datetime-local" value={form.cutoff} onChange={(e) => set("cutoff", e.target.value)} />
            <span className="tiny muted">{t("create.cutoffHint")}</span>
          </label>
        </div>

        <div className="card col gap12">
          <label className="col gap8">
            <span className="label">{t("create.initialBuy")}</span>
            <input className="field" value={form.initialBuy} onChange={(e) => set("initialBuy", e.target.value)} />
            <span className="tiny muted">{t("create.initialBuyHint", { min: minInitialBuy ? Number(minInitialBuy) / 1e18 : 0.1 })}</span>
          </label>

          <label className="col gap8">
            <span className="label">{t("create.existingToken")}</span>
            <input className="field" value={form.token} onChange={(e) => set("token", e.target.value)} placeholder={t("create.existingTokenHint")} />
          </label>

          <button className="btn accent wide" disabled={isPending || working || uploading !== ""} onClick={submit}>
            {working ? t("common.working") : t("create.submit")}
          </button>
          {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
        </div>
      </main>
    </div>
  );
}
