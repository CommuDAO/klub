import { BaseError, ContractFunctionRevertedError } from "viem";
import en, { TKey } from "./locales/en";

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

const english: Translate = (key, vars) => {
  let text = en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
};

/// Turns whatever wagmi/viem threw into one sentence a person can act on, in
/// the reader's language when a translator is passed.
export function explainError(e: unknown, t: Translate = english): string {
  if (e instanceof Error && e.message in en) return t(e.message as TKey);
  if (e instanceof BaseError) {
    const reverted = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const key = `err.${name}` as TKey;
      if (name && key in en) return t(key);
      if (name) return t("err.refused", { name });
    }
    if (e.shortMessage?.toLowerCase().includes("user rejected")) return t("err.userRejected");
    return e.shortMessage || e.message.split("\n")[0];
  }
  return (e as Error)?.message?.split("\n")[0] ?? t("err.generic");
}
