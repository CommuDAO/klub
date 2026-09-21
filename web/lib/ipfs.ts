import type { SecretBox } from "./secrets";

export const CATEGORIES = ["meetup", "workshop", "party", "sports", "conference", "community", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

/// Venue fields that move into the encrypted box when the organizer hides the location.
export type PrivateLocation = { venue?: string; mapUrl?: string; lat?: number; lng?: number };

export type EventMetadata = {
  title?: string;
  category?: Category;
  private?: SecretBox;
  description?: string;
  coverCID?: string;
  venue?: string;
  mapUrl?: string;
  lat?: number;
  lng?: number;
  telegram?: string;
};

const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io/ipfs/";

/// Accepts a CID, an ipfs:// URI or a plain https link.
export const ipfsUrl = (cid?: string) => {
  if (!cid) return "";
  if (cid.startsWith("http://") || cid.startsWith("https://")) return cid;
  return `${gateway}${cid.replace("ipfs://", "")}`;
};

const cache = new Map<string, EventMetadata>();

/// The chain field holds either the metadata JSON itself (what the create form
/// writes now) or an IPFS CID pointing at the same shape.
export async function loadMetadata(value: string): Promise<EventMetadata> {
  if (!value) return {};
  const trimmed = value.trim();

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as EventMetadata;
    } catch {
      return {};
    }
  }

  const hit = cache.get(trimmed);
  if (hit) return hit;
  try {
    const res = await fetch(ipfsUrl(trimmed));
    if (!res.ok) return {};
    const json = (await res.json()) as EventMetadata;
    cache.set(trimmed, json);
    return json;
  } catch {
    return {};
  }
}

/// Pulls coordinates out of the links Google Maps hands out:
/// .../@13.7458,100.5341,17z  or  ...!3d13.7458!4d100.5341  or  ?q=13.7,100.5
export function coordsFromMapUrl(url: string): { lat?: number; lng?: number } {
  if (!url) return {};
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  const bang = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (bang) return { lat: Number(bang[1]), lng: Number(bang[2]) };
  const q = url.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) };
  return {};
}
