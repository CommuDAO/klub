"use client";

import { useReadContract } from "wagmi";
import { contracts, factoryAbi, registryAbi, vaultAbi } from "./contracts";

export type KlubEvent = {
  id: number;
  organizer: `0x${string}`;
  token: `0x${string}`;
  tokenCreated: boolean;
  startTime: bigint;
  endTime: bigint;
  rewardMode: number;
  minCreditMinutes: number;
  methods: number;
  requireApproval: boolean;
  capacity: number;
  minHolding: bigint;
  burnAmount: bigint;
  metadataCID: string;
  policy: {
    remainder: number;
    cancelBefore: number;
    cancelAfter: number;
    rejected: number;
    noShow: number;
    refundCutoff: bigint;
  };
};

type RawEvent = Omit<KlubEvent, "id">;

export function useEventList(limit = 50) {
  const { data, isLoading, refetch } = useReadContract({
    address: contracts.factory,
    abi: factoryAbi,
    functionName: "getEvents",
    args: [0n, BigInt(limit)]
  });

  const page = (data?.[0] ?? []) as readonly RawEvent[];
  const events: KlubEvent[] = page.map((e, i) => ({ ...(e as RawEvent), id: i + 1 }));
  return { events, total: Number(data?.[1] ?? 0n), isLoading, refetch };
}

export function useEvent(eventId?: number) {
  const { data, isLoading, refetch } = useReadContract({
    address: contracts.factory,
    abi: factoryAbi,
    functionName: "getEvent",
    args: eventId ? [BigInt(eventId)] : undefined,
    query: { enabled: Boolean(eventId) }
  });
  const event = data ? ({ ...(data as unknown as RawEvent), id: eventId! } as KlubEvent) : undefined;
  return { event, isLoading, refetch };
}

export function useEventState(eventId?: number) {
  return useReadContract({
    address: contracts.registry,
    abi: registryAbi,
    functionName: "stateOf",
    args: eventId ? [BigInt(eventId)] : undefined,
    query: { enabled: Boolean(eventId), refetchInterval: 15_000 }
  });
}

export function useGuest(eventId?: number, guest?: `0x${string}`) {
  return useReadContract({
    address: contracts.registry,
    abi: registryAbi,
    functionName: "guestOf",
    args: eventId && guest ? [BigInt(eventId), guest] : undefined,
    query: { enabled: Boolean(eventId && guest), refetchInterval: 15_000 }
  });
}

export function usePools(eventId?: number) {
  return useReadContract({
    address: contracts.vault,
    abi: vaultAbi,
    functionName: "poolsOf",
    args: eventId ? [BigInt(eventId)] : undefined,
    query: { enabled: Boolean(eventId), refetchInterval: 20_000 }
  });
}
