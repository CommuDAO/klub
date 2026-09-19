"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
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
    <button className="btn" style={{ height: 40 }} disabled={isPending || connectors.length === 0} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

export function Header({ title }: { title?: string }) {
  return (
    <header className="between pad" style={{ paddingTop: 16, paddingBottom: 12 }}>
      <Link href="/" className="display" style={{ fontSize: 24 }}>
        {title ?? "KLUB"}
      </Link>
      <div className="row gap8">
        <Link href="/create" className="chip" aria-label="Create event">
          + Event
        </Link>
        <WalletButton />
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
  const path = usePathname();
  const tabs = [
    { href: "/", label: "Home" },
    { href: "/discover", label: "Discover" },
    { href: "/chats", label: "Chats" }
  ];
  return (
    <nav className="nav">
      <div className="nav-inner">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={path === t.href ? "on" : ""}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
