import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "viem";

/// Private event details are encrypted in the browser. Nothing here talks to a
/// server: keys come from wallet signatures, which are deterministic, so the
/// same wallet can re-derive them on any device.

export const GUEST_KEY_MESSAGE =
  "KLUB private details key v1\n\nSigning creates your personal key for unlocking private event details. It costs no gas.";

export const eventKeyMessage = (salt: string) =>
  `KLUB event key v1\n${salt}\n\nSigning unlocks the private details of an event you organize. It costs no gas.`;

export type SecretBox = { v: 1; salt: string; iv: string; data: string };

type Hex = `0x${string}`;

const toHex = (bytes: Uint8Array) => bytesToHex(bytes);
/// WebCrypto wants buffers backed by a plain ArrayBuffer; copying guarantees that.
const buf = (bytes: Uint8Array) => new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
const fromHex = (hex: string) => buf(hexToBytes(hex as Hex));

async function aes(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", buf(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

/// 32-byte key from a wallet signature.
export const keyFromSignature = (signature: Hex) => sha256(fromHex(signature));

export function guestKeys(signature: Hex) {
  const priv = keyFromSignature(signature);
  return { priv, pub: toHex(x25519.getPublicKey(priv)) as Hex };
}

export async function encryptJSON(key: Uint8Array, value: unknown, salt: string): Promise<SecretBox> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(key), plain));
  return { v: 1, salt, iv: toHex(iv), data: toHex(cipher) };
}

export async function decryptJSON<T>(key: Uint8Array, box: SecretBox): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(box.iv) }, await aes(key), fromHex(box.data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/// Seals the event key to one guest: ephemeral X25519 public key (32) | iv (12) | AES-GCM ciphertext.
export async function sealKey(eventKey: Uint8Array, guestPub: Hex): Promise<Hex> {
  const eph = x25519.utils.randomPrivateKey();
  const shared = sha256(x25519.getSharedSecret(eph, fromHex(guestPub)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(shared), buf(eventKey)));
  const out = new Uint8Array(32 + 12 + cipher.length);
  out.set(x25519.getPublicKey(eph), 0);
  out.set(iv, 32);
  out.set(cipher, 44);
  return toHex(out) as Hex;
}

export async function openKey(sealed: Hex, guestPriv: Uint8Array): Promise<Uint8Array> {
  const bytes = fromHex(sealed);
  const shared = sha256(x25519.getSharedSecret(guestPriv, bytes.slice(0, 32)));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(bytes.slice(32, 44)) }, await aes(shared), buf(bytes.slice(44)));
  return new Uint8Array(plain);
}

export const ZERO_KEY = "0x0000000000000000000000000000000000000000000000000000000000000000";
