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

const toUnix = (value: string) => BigInt(Math.floor(new Date(value).getTime() / 1000));

/// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const MIN_LEAD_MINUTES = 5;

export default function CreatePage() {
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
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string; link?: string } | undefined>();
  const [working, setWorking] = useState(false);

  const setStatus = (text?: string, tone: NoticeTone = "error") => setNotice(text ? { tone, text } : undefined);

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
    if (!address) return "Connect your wallet first.";
    if (!form.name.trim()) return "Give the event a name.";
    if (!form.symbol.trim()) return "Give the token a symbol.";
    if (!form.start || !form.end) return "Set when the event starts and ends.";
    const start = new Date(form.start).getTime();
    const end = new Date(form.end).getTime();
    if (start < Date.now() + MIN_LEAD_MINUTES * 60 * 1000) {
      return `Start time must be at least ${MIN_LEAD_MINUTES} minutes from now.`;
    }
    if (end <= start) return "End time must be after the start time.";
    if (form.cutoff && new Date(form.cutoff).getTime() > start) {
      return "Cancel cutoff must be on or before the start time.";
    }
    const holding = Number(form.minHolding || 0);
    const burn = Number(form.burnAmount || 0);
    if (burn > holding) return "Burn at check-in cannot be more than the amount held.";
    if (Number(form.rewardMode) === 0 && Number(form.minCredit) <= 0) return "Minimum credit must be above 0.";
    if (!form.token && Number(form.initialBuy || 0) <= 0.1) {
      return "Initial buy must be more than 0.1 KUB, the launchpad keeps 0.1 KUB as the creation fee.";
    }
    return undefined;
  }

  async function onImagePicked(kind: "cover" | "token", file?: File) {
    if (!file) return;
    setStatus(undefined);
    setUploading(kind);
    try {
      const cid = await uploadCover(file);
      if (kind === "cover") setCoverCID(cid);
      else setTokenImageCID(cid);
    } catch (e) {
      setStatus((e as Error).message);
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
    setStatus(undefined);
    const problem = validate();
    if (problem) {
      setStatus(problem);
      return;
    }
    if (!publicClient) return;
    setWorking(true);

    // The launchpad keeps whatever we pass as the token logo, so the first
    // transaction carries only the image link. The full event details are
    // written to KLUB right after with setMetadata.
    const logoCID = tokenImageCID || coverCID;
    const logo = logoCID ? ipfsUrl(logoCID) : "";
    const needsName = Boolean(form.organizerName.trim()) && form.organizerName.trim() !== (profile?.name ?? "");
    const steps = 2 + (needsName ? 1 : 0);

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

      setNotice({ tone: "info", text: `Step 1 of ${steps}: creating the event and its token. Confirm in your wallet.` });
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
      setNotice({ tone: "info", text: "Waiting for the transaction to be confirmed…" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The create transaction failed on chain.");
      const created = parseEventLogs({ abi: factoryAbi, eventName: "EventCreated", logs: receipt.logs })[0];
      if (!created) throw new Error("The event was created but its number could not be read.");
      const eventId = created.args.eventId;

      setNotice({ tone: "info", text: `Step 2 of ${steps}: saving the event details. Confirm in your wallet.` });
      const metaHash = await writeContractAsync({
        address: contracts.factory,
        abi: factoryAbi,
        functionName: "setMetadata",
        args: [eventId, buildMetadata()]
      });
      await publicClient.waitForTransactionReceipt({ hash: metaHash });

      if (needsName) {
        setNotice({ tone: "info", text: `Step 3 of ${steps}: saving your organizer name. Confirm in your wallet.` });
        const nameHash = await writeContractAsync({
          address: contracts.profiles,
          abi: profilesAbi,
          functionName: "setProfile",
          args: [form.organizerName.trim(), profile?.avatarCID ?? "", profile?.telegram || form.telegram || ""]
        });
        await publicClient.waitForTransactionReceipt({ hash: nameHash });
      }

      setNotice({ tone: "success", text: "Event created. Opening it now…" });
      router.push(`/event?id=${eventId}`);
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e) });
    } finally {
      setWorking(false);
    }
  }

  const policyRows: [string, keyof typeof form][] = [
    ["Left after burn", "remainder"],
    ["Cancel before cutoff", "cancelBefore"],
    ["Cancel after cutoff", "cancelAfter"],
    ["Rejected RSVP", "rejected"],
    ["No-show", "noShow"]
  ];

  return (
    <div className="shell">
      <BackBar title="Create event" />
      <main className="pad col gap16">
        <div className="card col gap12">
          <strong>About the event</strong>

          <label className="col gap8">
            <span className="label">Event name</span>
            <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>

          <label className="col gap8">
            <span className="label">Token symbol</span>
            <input className="field" value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="KNIGHT" />
          </label>

          <label className="col gap8">
            <span className="label">Organizer name</span>
            <input className="field" value={form.organizerName} onChange={(e) => set("organizerName", e.target.value)} placeholder="Shown as the host on every event you run" />
          </label>

          <div className="col gap8">
            <span className="label">Cover image</span>
            <span className="tiny muted">Square, 1200 × 1200 px works best. JPG or PNG, up to 5 MB.</span>
            {coverCID ? <img className="cover" src={ipfsUrl(coverCID)} alt="Cover preview" /> : null}
            <input
              className="field"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!pinataReady || uploading !== ""}
              onChange={(e) => onImagePicked("cover", e.target.files?.[0])}
              style={{ paddingTop: 11 }}
            />
            {uploading === "cover" ? <span className="tiny muted">Uploading to IPFS…</span> : null}
            {!pinataReady ? <span className="tiny muted">Image upload is not configured on this deployment.</span> : null}
          </div>

          <div className="col gap8">
            <span className="label">Token image</span>
            <span className="tiny muted">Shown on the launchpad. Square, 512 × 512 px. Leave empty to use the cover.</span>
            {tokenImageCID ? (
              <img src={ipfsUrl(tokenImageCID)} alt="Token image preview" style={{ width: 96, height: 96, borderRadius: 16, objectFit: "cover" }} />
            ) : null}
            <input
              className="field"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!pinataReady || uploading !== ""}
              onChange={(e) => onImagePicked("token", e.target.files?.[0])}
              style={{ paddingTop: 11 }}
            />
            {uploading === "token" ? <span className="tiny muted">Uploading to IPFS…</span> : null}
          </div>

          <label className="col gap8">
            <span className="label">Description</span>
            <textarea
              className="field area"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What happens at this event, who it is for, what to bring."
            />
          </label>
        </div>

        <div className="card col gap12">
          <strong>Where and when</strong>

          <label className="col gap8">
            <span className="label">Venue name</span>
            <input className="field" value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Foundry, Sukhumvit 49" />
          </label>

          <label className="col gap8">
            <span className="label">Google Maps link</span>
            <input className="field" value={form.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
            <span className="tiny muted">Paste the share link. Coordinates are read from it for the map and weather.</span>
          </label>

          <label className="col gap8">
            <span className="label">Telegram group link</span>
            <input className="field" value={form.telegram} onChange={(e) => set("telegram", e.target.value)} placeholder="https://t.me/…" />
            <span className="tiny muted">Shown to guests once they have RSVP'd.</span>
          </label>

          <label className="col gap8">
            <span className="label">Starts</span>
            <input className="field" type="datetime-local" value={form.start} onChange={(e) => set("start", e.target.value)} />
          </label>

          <label className="col gap8">
            <span className="label">Ends</span>
            <input className="field" type="datetime-local" value={form.end} onChange={(e) => set("end", e.target.value)} />
          </label>
        </div>

        <div className="card col gap12">
          <strong>Guests and check-in</strong>
          <label className="between">
            <span className="small">Capacity (0 = unlimited)</span>
            <input className="field" style={{ width: 110 }} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
          </label>
          <label className="between">
            <span className="small">Hold to check in</span>
            <input className="field" style={{ width: 110 }} value={form.minHolding} onChange={(e) => set("minHolding", e.target.value)} />
          </label>
          <label className="between">
            <span className="small">Burn at check-in</span>
            <input className="field" style={{ width: 110 }} value={form.burnAmount} onChange={(e) => set("burnAmount", e.target.value)} />
          </label>
          <label className="between">
            <span className="small">Require approval</span>
            <input type="checkbox" checked={form.requireApproval} onChange={(e) => set("requireApproval", e.target.checked)} />
          </label>
          <div className="row gap8" style={{ flexWrap: "wrap" }}>
            {[
              ["Staff scan", METHOD.STAFF],
              ["Kiosk QR", METHOD.KIOSK],
              ["Secret code", METHOD.CODE]
            ].map(([label, bit]) => (
              <button
                key={label as string}
                className="chip"
                style={form.methods & (bit as number) ? { background: "var(--ink)", color: "#fff" } : {}}
                onClick={() => set("methods", form.methods ^ (bit as number))}
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>

        <div className="card col gap12">
          <strong>Rewards</strong>
          <label className="between">
            <span className="small">Mode</span>
            <select className="field" style={{ width: 190 }} value={form.rewardMode} onChange={(e) => set("rewardMode", e.target.value)}>
              <option value={0}>By time at event</option>
              <option value={1}>Split equally</option>
            </select>
          </label>
          <label className="between">
            <span className="small">Minimum credit (minutes)</span>
            <input className="field" style={{ width: 110 }} value={form.minCredit} onChange={(e) => set("minCredit", e.target.value)} />
          </label>
        </div>

        <div className="card col gap12">
          <strong>Refund policy (locked after create)</strong>
          {policyRows.map(([label, key]) => (
            <label className="between" key={key}>
              <span className="small">{label}</span>
              <select className="field" style={{ width: 150 }} value={form[key] as number} onChange={(e) => set(key, e.target.value)}>
                {DESTINATION.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="col gap8">
            <span className="label">Cancel cutoff</span>
            <input className="field" type="datetime-local" value={form.cutoff} onChange={(e) => set("cutoff", e.target.value)} />
            <span className="tiny muted">Must be on or before the start time. Leave empty to use the start time.</span>
          </label>
        </div>

        <div className="card col gap12">
          <label className="col gap8">
            <span className="label">Initial buy (KUB)</span>
            <input className="field" value={form.initialBuy} onChange={(e) => set("initialBuy", e.target.value)} />
            <span className="tiny muted">
              Minimum {minInitialBuy ? Number(minInitialBuy) / 1e18 : 0.1} KUB. The launchpad keeps 0.1 KUB as the token
              creation fee, so send more than that or the transaction reverts.
            </span>
          </label>

          <label className="col gap8">
            <span className="label">Existing token address (optional)</span>
            <input className="field" value={form.token} onChange={(e) => set("token", e.target.value)} placeholder="0x… — leave empty to create a new token" />
          </label>

          <button className="btn accent wide" disabled={isPending || working || uploading !== ""} onClick={submit}>
            {working ? "Working…" : "Create event and buy"}
          </button>
          {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
        </div>
      </main>
    </div>
  );
}
