"use client";

import { ReactNode, useEffect, useRef } from "react";

export type NoticeTone = "error" | "success" | "info";

/// A banner that is hard to miss: it scrolls itself into view when it appears.
export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [children]);

  const colors: Record<NoticeTone, { bg: string; fg: string }> = {
    error: { bg: "#f6e3de", fg: "#8c2d16" },
    success: { bg: "#e1f1e4", fg: "#1f5b2b" },
    info: { bg: "#efeae3", fg: "#3b342c" }
  };

  return (
    <div
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: colors[tone].bg,
        color: colors[tone].fg,
        fontSize: 14,
        lineHeight: 1.5,
        wordBreak: "break-word"
      }}
    >
      {children}
    </div>
  );
}
