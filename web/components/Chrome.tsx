"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";
import { LanguageSelect, useI18n } from "@/lib/i18n";

/// Only rendered on the Home page. Every other page reuses the connection.
export function WalletButton() {
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected) {
    return (
      <button className="chip" onClick={() => disconnect()}>
        {shortAddress(address)}
      </button>
    );
  }

  // wagmi also lists wallets it discovers on its own; keep one entry per name
  const choices = connectors.filter((c, i) => connectors.findIndex((o) => o.name === c.name) === i);

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn"
        style={{ height: 40 }}
        disabled={isPending || choices.length === 0}
        onClick={() => (choices.length === 1 ? connect({ connector: choices[0] }) : setOpen(!open))}
      >
        {isPending ? t("wallet.connecting") : t("wallet.connect")}
      </button>
      {open ? (
        <div className="card col gap8" style={{ position: "absolute", right: 0, top: 46, zIndex: 20, minWidth: 210 }}>
          <span className="tiny muted">{t("wallet.choose")}</span>
          {choices.map((c) => (
            <button
              key={c.uid}
              className="btn ghost"
              style={{ height: 40, justifyContent: "flex-start" }}
              onClick={() => {
                setOpen(false);
                connect({ connector: c });
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/// Pages that need a wallet but are not Home point people back there.
export function ConnectOnHome() {
  const { t } = useI18n();
  return (
    <div className="card col gap8">
      <span className="small muted">{t("wallet.connectOnHome")}</span>
      <Link className="btn wide" href="/">
        {t("wallet.goHome")}
      </Link>
    </div>
  );
}

export function Header({ title, home = false, language = false }: { title?: string; home?: boolean; language?: boolean }) {
  const { t } = useI18n();
  return (
    <header className="between pad" style={{ paddingTop: 16, paddingBottom: 12, gap: 8 }}>
      <Link href="/" className="display" style={{ fontSize: 24 }}>
        {title ?? "KLUB"}
      </Link>
      <div className="row gap8">
        {language ? <LanguageSelect compact /> : null}
        {home ? (
          <>
            <Link
              href="/create"
              aria-label={t("create.title")}
              className="chip"
              style={{ width: 40, height: 40, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}
            >
              +
            </Link>
            <WalletButton />
          </>
        ) : null}
      </div>
    </header>
  );
}

export function BackBar({ title, href = "/" }: { title: string; href?: string }) {
  return (
    <header className="row pad" style={{ paddingTop: 16, paddingBottom: 12 }}>
      <Link href={href} className="chip">
        ←
      </Link>
      <strong>{title}</strong>
    </header>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const path = usePathname();
  const tabs = [
    { href: "/", label: t("nav.home") },
    { href: "/discover", label: t("nav.discover") },
    { href: "/chats", label: t("nav.chats") }
  ];
  return (
    <nav className="nav">
      <div className="nav-inner">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className={path === tab.href ? "on" : ""}>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
