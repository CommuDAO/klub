import { formatUnits } from "viem";

export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const amount = (v?: bigint, decimals = 18, digits = 2) =>
  v === undefined ? "0" : Number(formatUnits(v, decimals)).toLocaleString(undefined, { maximumFractionDigits: digits });

export const dateRange = (start?: bigint, end?: bigint) => {
  if (!start) return "";
  const s = new Date(Number(start) * 1000);
  const e = end ? new Date(Number(end) * 1000) : undefined;
  const day = s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const from = s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const to = e ? e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  return `${day} · ${from}${to ? ` – ${to}` : ""}`;
};

export const dayLabel = (start?: bigint) =>
  start
    ? new Date(Number(start) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long" })
    : "";

export const minutesAt = (checkIn?: bigint, checkOut?: bigint) => {
  if (!checkIn) return 0;
  const end = checkOut && checkOut > 0n ? Number(checkOut) : Math.floor(Date.now() / 1000);
  return Math.max(0, Math.floor((end - Number(checkIn)) / 60));
};
