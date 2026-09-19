export type EventMetadata = {
  title?: string;
  description?: string;
  coverCID?: string;
  venue?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  telegram?: string;
};

const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io/ipfs/";

export const ipfsUrl = (cid?: string) => (cid ? `${gateway}${cid.replace("ipfs://", "")}` : "");

const cache = new Map<string, EventMetadata>();

export async function loadMetadata(cid: string): Promise<EventMetadata> {
  if (!cid) return {};
  const hit = cache.get(cid);
  if (hit) return hit;
  try {
    const res = await fetch(ipfsUrl(cid));
    if (!res.ok) return {};
    const json = (await res.json()) as EventMetadata;
    cache.set(cid, json);
    return json;
  } catch {
    return {};
  }
}
