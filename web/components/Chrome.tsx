"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";
import { LanguageSelect, useI18n } from "@/lib/i18n";

export function WalletButton() {
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button className="chip" onClick={() => disconnect()}>
        {shortAddress(address)}
      </button>
    );
  }
  return (
    <button
      className="btn"
      style={{ height: 40 }}
      disabled={isPending || connectors.length === 0}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      {isPending ? t("wallet.connecting") : t("wallet.connect")}
    </button>
  );
}

export function Header({ title }: { title?: string }) {
  const { t } = useI18n();
  return (
    <header className="between pad" style={{ paddingTop: 16, paddingBottom: 12, gap: 8 }}>
      <Link href="/" className="display" style={{ fontSize: 24 }}>
        {title ?? "KLUB"}
      </Link>
      <div className="row gap8" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
        <LanguageSelect compact />
        <Link href="/create" className="chip" aria-label={t("create.title")}>
          {t("header.newEvent")}
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}

export function BackBar({ title, href = "/" }: { title: string; href?: string }) {
  return (
    <header className="between pad" style={{ paddingTop: 16, paddingBottom: 12 }}>
      <div className="row">
        <Link href={href} className="chip">
          ←
        </Link>
        <strong>{title}</strong>
      </div>
      <LanguageSelect compact />
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
