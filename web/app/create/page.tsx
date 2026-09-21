"use client";

import { useEffect, useState } from "react";
import { parseEther, parseUnits } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { BackBar } from "@/components/Chrome";
import { contracts, factoryAbi, DESTINATION, METHOD } from "@/lib/contracts";
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
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: minInitialBuy } = useReadContract({
    address: contracts.factory,
    abi: factoryAbi,
    functionName: "minInitialBuy"
  });

  const [form, setForm] = useState({
    name: "",
    symbol: "",
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
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string>();

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const start = new Date(Date.now() + 30 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    setForm((f) => ({ ...f, start: f.start || toLocalInput(start), end: f.end || toLocalInput(end) }));
  }, []);

  /// Same rules the factory enforces, checked before the wallet opens so a
  /// bad form never becomes a failed transaction.
  function validate(): string | undefined {
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

  async function onCoverPicked(file?: File) {
    if (!file) return;
    setStatus(undefined);
    setUploading(true);
    try {
      setCoverCID(await uploadCover(file));
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setUploading(false);
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
    try {
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
            metadataCID: buildMetadata(),
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
      setStatus(`Sent: ${hash}`);
    } catch (e) {
      setStatus((e as Error).message.split("\n")[0]);
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

          <div className="col gap8">
            <span className="label">Cover image</span>
            <span className="tiny muted">Square, 1200 × 1200 px works best. JPG or PNG, up to 5 MB.</span>
            {coverCID ? <img className="cover" src={ipfsUrl(coverCID)} alt="Cover preview" /> : null}
            <input
              className="field"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!pinataReady || uploading}
              onChange={(e) => onCoverPicked(e.target.files?.[0])}
              style={{ paddingTop: 11 }}
            />
            {uploading ? <span className="tiny muted">Uploading to IPFS…</span> : null}
            {!pinataReady ? <span className="tiny muted">Image upload is not configured on this deployment.</span> : null}
            {coverCID ? <span className="tiny muted">Pinned: {coverCID}</span> : null}
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

          <button className="btn accent wide" disabled={isPending || uploading} onClick={submit}>
            {isPending ? "Confirm in wallet…" : "Create event and buy"}
          </button>
          {status ? <span className="tiny muted" style={{ wordBreak: "break-all" }}>{status}</span> : null}
        </div>
      </main>
    </div>
  );
}
