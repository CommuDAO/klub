/// Cover images are pinned straight from the browser. The JWT is a public,
/// upload-only key: keep it scoped to pinFileToIPFS with a usage limit, because
/// anything shipped to a static site is readable by anyone.
const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

export const pinataReady = Boolean(jwt);

export async function uploadCover(file: File): Promise<string> {
  if (!jwt) throw new Error("Image upload is not configured yet");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller");

  const body = new FormData();
  body.append("file", file);
  body.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  body.append("pinataMetadata", JSON.stringify({ name: `klub-cover-${Date.now()}` }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Upload failed: ${detail.slice(0, 120)}`);
  }
  const json = (await res.json()) as { IpfsHash: string };
  return json.IpfsHash;
}
