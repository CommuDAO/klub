"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { BackBar, WalletButton } from "@/components/Chrome";
import { contracts, profilesAbi } from "@/lib/contracts";
import { kubChain } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

export default function SettingsPage() {
  const { address, chainId } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: profile, refetch } = useReadContract({
    address: contracts.profiles,
    abi: profilesAbi,
    functionName: "profileOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  });

  const [form, setForm] = useState({ name: "", avatarCID: "", telegram: "" });
  const [status, setStatus] = useState<string>();

  async function save() {
    setStatus(undefined);
    try {
      await writeContractAsync({
        address: contracts.profiles,
        abi: profilesAbi,
        functionName: "setProfile",
        args: [form.name || profile?.name || "", form.avatarCID || profile?.avatarCID || "", form.telegram || profile?.telegram || ""]
      });
      await refetch();
      setStatus("Saved on chain");
    } catch (e) {
      setStatus((e as Error).message.split("\n")[0]);
    }
  }

  return (
    <div className="shell">
      <BackBar title="Settings" />
      <main className="pad col gap16">
        <div className="card col gap8">
          <div className="between">
            <span className="muted small">Wallet</span>
            <strong>{address ? shortAddress(address) : "Not connected"}</strong>
          </div>
          <div className="between">
            <span className="muted small">Network</span>
            <strong>{chainId === kubChain.id ? kubChain.name : `Switch to ${kubChain.name}`}</strong>
          </div>
          <WalletButton />
        </div>

        <div className="card col gap8">
          <strong>Profile</strong>
          <span className="label">Display name</span>
          <input className="field" placeholder={profile?.name || "Your name"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <span className="label">Avatar CID (IPFS)</span>
          <input className="field" placeholder={profile?.avatarCID || "bafy…"} value={form.avatarCID} onChange={(e) => setForm({ ...form, avatarCID: e.target.value })} />
          <span className="label">Telegram</span>
          <input className="field" placeholder={profile?.telegram || "https://t.me/…"} value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          <button className="btn accent wide" disabled={isPending || !address} onClick={save}>
            Save profile
          </button>
          {status ? <span className="tiny muted">{status}</span> : null}
        </div>

        <div className="card col gap8">
          <strong>Organizer</strong>
          <Link className="btn ghost wide" href="/manage">
            Manage my events
          </Link>
          <Link className="btn ghost wide" href="/create">
            Create an event
          </Link>
        </div>

        <p className="tiny muted">
          Notifications are sent from the KLUB n8n workflow over Telegram. Maps come from Google Maps and weather from
          Open-Meteo. Everything else is read straight from KUB Chain.
        </p>
      </main>
    </div>
  );
}
