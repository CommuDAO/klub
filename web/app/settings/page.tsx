"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { BackBar, WalletButton } from "@/components/Chrome";
import { contracts, profilesAbi } from "@/lib/contracts";
import { explainError } from "@/lib/errors";
import { kubChain } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { LanguageSelect, useI18n } from "@/lib/i18n";

export default function SettingsPage() {
  const { t } = useI18n();
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
      setStatus(t("settings.saved"));
    } catch (e) {
      setStatus(explainError(e, t));
    }
  }

  return (
    <div className="shell">
      <BackBar title={t("settings.title")} />
      <main className="pad col gap16">
        <div className="card col gap8">
          <strong>{t("common.language")}</strong>
          <LanguageSelect />
        </div>

        <div className="card col gap8">
          <div className="between">
            <span className="muted small">{t("settings.wallet")}</span>
            <strong>{address ? shortAddress(address) : t("settings.notConnected")}</strong>
          </div>
          <div className="between">
            <span className="muted small">{t("settings.network")}</span>
            <strong>{chainId === kubChain.id ? kubChain.name : t("settings.switchTo", { name: kubChain.name })}</strong>
          </div>
          <WalletButton />
        </div>

        <div className="card col gap8">
          <strong>{t("settings.profile")}</strong>
          <span className="label">{t("settings.displayName")}</span>
          <input
            className="field"
            placeholder={profile?.name || t("settings.namePlaceholder")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <span className="label">{t("settings.avatar")}</span>
          <input
            className="field"
            placeholder={profile?.avatarCID || "bafy…"}
            value={form.avatarCID}
            onChange={(e) => setForm({ ...form, avatarCID: e.target.value })}
          />
          <span className="label">{t("common.telegram")}</span>
          <input
            className="field"
            placeholder={profile?.telegram || "https://t.me/…"}
            value={form.telegram}
            onChange={(e) => setForm({ ...form, telegram: e.target.value })}
          />
          <button className="btn accent wide" disabled={isPending || !address} onClick={save}>
            {t("settings.save")}
          </button>
          {status ? <span className="tiny muted">{status}</span> : null}
        </div>

        <div className="card col gap8">
          <strong>{t("settings.organizer")}</strong>
          <Link className="btn ghost wide" href="/manage">
            {t("settings.manageMine")}
          </Link>
          <Link className="btn ghost wide" href="/create">
            {t("settings.create")}
          </Link>
        </div>

        <p className="tiny muted">{t("settings.footer")}</p>
      </main>
    </div>
  );
}
