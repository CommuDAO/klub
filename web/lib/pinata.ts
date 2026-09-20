/// Cover images are pinned straight from the browser through Pinata's V3
/// uploads API. The JWT is a public, upload-only key: keep it scoped to Files
/// write with no admin rights, because anything shipped to a static site is
/// readable by anyone.
const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

export const pinataReady = Boolean(jwt);

type UploadResponse = { data?: { cid?: string } };

export async function uploadCover(file: File): Promise<string> {
  if (!jwt) throw new Error("Image upload is not configured yet");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller");

  const body = new FormData();
  body.append("file", file);
  body.append("network", "public");
  body.append("name", `klub-cover-${Date.now()}`);

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Upload failed: ${detail.slice(0, 120)}`);
  }

  const json = (await res.json()) as UploadResponse;
  const cid = json.data?.cid;
  if (!cid) throw new Error("Upload succeeded but no CID came back");
  return cid;
}
