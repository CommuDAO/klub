"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en, { Dict, TKey } from "./locales/en";
import th from "./locales/th";
import zh from "./locales/zh";
import ms from "./locales/ms";
import vi from "./locales/vi";
import id from "./locales/id";
import fil from "./locales/fil";

export const LANGS = [
  { code: "th", label: "ไทย", locale: "th-TH" },
  { code: "en", label: "English", locale: "en-US" },
  { code: "zh", label: "中文", locale: "zh-CN" },
  { code: "ms", label: "Bahasa Melayu", locale: "ms-MY" },
  { code: "vi", label: "Tiếng Việt", locale: "vi-VN" },
  { code: "id", label: "Bahasa Indonesia", locale: "id-ID" },
  { code: "fil", label: "Filipino", locale: "fil-PH" }
] as const;

export type Lang = (typeof LANGS)[number]["code"];

const DICTS: Record<Lang, Dict> = { en, th, zh, ms, vi, id, fil };
const STORAGE_KEY = "klub.lang";

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && saved in DICTS) return saved;
  } catch {
    // storage can be blocked; fall through to the browser language
  }
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("tl") || nav.startsWith("fil")) return "fil";
  const short = nav.split("-")[0] as Lang;
  return short in DICTS ? short : "en";
}

type Vars = Record<string, string | number>;

type I18n = {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
};

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(detect());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not remembered, still switches for this visit
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = DICTS[lang];
    const locale = LANGS.find((l) => l.code === lang)?.locale ?? "en-US";
    const t = (key: TKey, vars?: Vars) => {
      let text = dict[key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
      return text;
    };
    return { lang, locale, setLang, t };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      aria-label={t("common.language")}
      className={compact ? "chip" : "field"}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      style={compact ? { border: "none", cursor: "pointer" } : undefined}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
