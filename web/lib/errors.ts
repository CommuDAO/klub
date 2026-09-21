import { BaseError, ContractFunctionRevertedError } from "viem";

/// Plain-language reasons for every revert a guest or organizer can hit.
const REASONS: Record<string, string> = {
  BadTimes: "The start time has already passed, or the end is not after the start.",
  BadCutoff: "The cancel cutoff must be on or before the start time.",
  BadAmounts: "Burn at check-in cannot be more than the amount held.",
  BadMethods: "Choose at least one check-in method.",
  BadMinCredit: "Minimum credit must be above 0 when rewards are split by time.",
  InitialBuyTooSmall: "The initial buy is below the minimum.",
  ValueBelowCreateFee: "The initial buy must be more than the 0.1 KUB token creation fee.",
  SlippageTooHigh: "The price moved while buying. Try again.",
  RouteRequired: "This token has left the bonding curve and needs a swap route.",
  TokenNotDelivered: "The launchpad did not return a token.",
  NotOrganizer: "Only the organizer can do this.",
  NotStaff: "Only staff or the organizer can do this.",
  AlreadyRsvped: "This wallet has already RSVP'd.",
  NoRsvp: "There is no RSVP to cancel.",
  NotApproved: "This guest has not been approved yet.",
  TooLate: "It is too late for that now.",
  TooEarly: "It is too early for that. Wait until the event has ended.",
  OutsideEventWindow: "Check-in is only open while the event is running.",
  AlreadyCheckedIn: "This guest is already checked in.",
  NotCheckedIn: "This guest has not checked in.",
  AlreadyCheckedOut: "This guest has already checked out.",
  MethodDisabled: "The organizer turned this check-in method off.",
  BadWindow: "That QR code has expired. Scan the new one.",
  BadSigner: "That code or QR is not valid for this event.",
  NothingToWithdraw: "There is nothing to withdraw.",
  CodeClosed: "The secret code is not open right now."
};

/// Turns whatever wagmi/viem threw into one sentence a person can act on.
export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    const reverted = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && REASONS[name]) return REASONS[name];
      if (name) return `The contract refused this (${name}).`;
    }
    if (e.shortMessage?.toLowerCase().includes("user rejected")) return "You cancelled the request in your wallet.";
    return e.shortMessage || e.message.split("\n")[0];
  }
  return (e as Error)?.message?.split("\n")[0] ?? "Something went wrong.";
}
