"use client";

import { useState } from "react";
import { parseEther, parseUnits } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { BackBar } from "@/components/Chrome";
import { contracts, factoryAbi, DESTINATION, METHOD } from "@/lib/contracts";

const toUnix = (value: string) => BigInt(Math.floor(new Date(value).getTime() / 1000));

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
    metadataCID: "",
    token: "",
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
    initialBuy: "10"
  });
  const [status, setStatus] = useState<string>();

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setStatus(undefined);
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
            metadataCID: form.metadataCID,
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
            minTokensOut: 0n
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
        <div className="col gap8">
          <span className="label">Event name</span>
          <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <span className="label">Token symbol</span>
          <input className="field" value={form.symbol} onChange={(e) => set("symbol", e.target.value)} />
          <span className="label">Existing token address (leave empty to create a new one)</span>
          <input className="field" value={form.token} onChange={(e) => set("token", e.target.value)} placeholder="0x…" />
          <span className="label">Metadata CID (cover, description, venue, Telegram link)</span>
          <input className="field" value={form.metadataCID} onChange={(e) => set("metadataCID", e.target.value)} />
        </div>

        <div className="grid2">
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
          <div className="row gap8">
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
          </label>
        </div>

        <div className="card col gap12">
          <div className="between">
            <div className="col">
              <strong>Initial buy</strong>
              <span className="tiny muted">
                Required, minimum {minInitialBuy ? Number(minInitialBuy) / 1e18 : 10} KUB
              </span>
            </div>
            <input className="field" style={{ width: 120 }} value={form.initialBuy} onChange={(e) => set("initialBuy", e.target.value)} />
          </div>
          <button className="btn accent wide" disabled={isPending} onClick={submit}>
            {isPending ? "Confirm in wallet…" : "Create event and buy"}
          </button>
          {status ? <span className="tiny muted">{status}</span> : null}
        </div>
      </main>
    </div>
  );
}
