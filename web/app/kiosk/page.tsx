"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useWriteContract } from "wagmi";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { contracts, registryAbi } from "@/lib/contracts";
import { kubChain } from "@/lib/chain";
import { LanguageSelect, useI18n } from "@/lib/i18n";

const STORAGE_KEY = "klub.kiosk.key";
const WINDOW_SECONDS = 30;

function KioskInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const eventId = Number(params.get("id") ?? 0);
  const [privateKey, setPrivateKey] = useState<`0x${string}`>();
  const [inbound, setInbound] = useState(true);
  const [qr, setQr] = useState<string>();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const { writeContractAsync, isPending } = useWriteContract();

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as `0x${string}` | null;
    const key = stored ?? generatePrivateKey();
    if (!stored) window.localStorage.setItem(STORAGE_KEY, key);
    setPrivateKey(key);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const account = useMemo(() => (privateKey ? privateKeyToAccount(privateKey) : undefined), [privateKey]);
  const windowId = Math.floor(now / WINDOW_SECONDS);
  const secondsLeft = WINDOW_SECONDS - (now % WINDOW_SECONDS);

  useEffect(() => {
    if (!account || !eventId) return;
    const digest = keccak256(
      encodeAbiParameters(parseAbiParameters("uint256, address, string, uint256, bool, uint64"), [
        BigInt(kubChain.id),
        contracts.registry,
        "KLUB_KIOSK",
        BigInt(eventId),
        inbound,
        BigInt(windowId)
      ])
    );
    account.signMessage({ message: { raw: digest } }).then((signature) => {
      const payload = JSON.stringify({ eventId, inbound, windowId, signature });
      QRCode.toDataURL(payload, { margin: 1, width: 600 }).then(setQr);
    });
  }, [account, eventId, inbound, windowId]);

  async function register() {
    if (!account) return;
    await writeContractAsync({
      address: contracts.registry,
      abi: registryAbi,
      functionName: "setKioskKey",
      args: [BigInt(eventId), account.address]
    });
  }

  async function revoke() {
    await writeContractAsync({
      address: contracts.registry,
      abi: registryAbi,
      functionName: "revokeKioskKey",
      args: [BigInt(eventId)]
    });
  }

  return (
    <div className="dark" style={{ minHeight: "100dvh", padding: 32 }}>
      <div style={{ display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <div className="col gap16" style={{ maxWidth: 420 }}>
          <div className="between">
            <span className="display" style={{ fontSize: 24 }}>
              KLUB
            </span>
            <LanguageSelect compact />
          </div>
          <h1 className="display" style={{ fontSize: 44, margin: 0 }}>
            {t("common.event", { id: eventId })}
          </h1>
          <div className="row gap8">
            <button className={inbound ? "btn accent" : "btn ghost"} onClick={() => setInbound(true)}>
              {t("kiosk.checkIn")}
            </button>
            <button className={!inbound ? "btn accent" : "btn ghost"} onClick={() => setInbound(false)}>
              {t("kiosk.checkOut")}
            </button>
          </div>
          <ol className="muted" style={{ lineHeight: 1.8, paddingLeft: 18 }}>
            <li>{t("kiosk.step1")}</li>
            <li>{t("kiosk.step2")}</li>
            <li>{t("kiosk.step3")}</li>
          </ol>
          <div className="row gap8">
            <button className="btn ghost" disabled={isPending} onClick={register}>
              {t("kiosk.register")}
            </button>
            <button className="btn ghost" disabled={isPending} onClick={revoke}>
              {t("kiosk.revoke")}
            </button>
          </div>
          <span className="tiny muted">{t("kiosk.key", { address: account?.address ?? "" })}</span>
        </div>
        <div className="col gap12" style={{ alignItems: "center" }}>
          {qr ? <img src={qr} alt="QR" style={{ width: 420, maxWidth: "100%", borderRadius: 24, background: "#fff", padding: 16 }} /> : null}
          <span className="muted">{t("kiosk.newCode", { seconds: secondsLeft })}</span>
        </div>
      </div>
    </div>
  );
}

export default function KioskPage() {
  return (
    <Suspense fallback={null}>
      <KioskInner />
    </Suspense>
  );
}
