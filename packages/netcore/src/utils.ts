/**
 * @fileoverview Utility functions for the project.
 */

/**
 * Represents the complex structure of scene data received from the server.
 */
interface RawSceneData {
  values: Array<{
    values: number[];
  }>;
  // The object can have other properties that we ignore.
  [key: string]: any;
}

/**
 * Transforms a raw scene data object from the server into a simple 2D array.
 *
 * The function expects an object with a `values` property, which is an array of objects.
 * Each of these nested objects should also have a `values` property containing an array of numbers.
 *
 * Example Input:
 * ```json
 * {
 *   "values": [
 *     { "values": [4, 8, 2, 3] },
 *     { "values": [2, 2, 2, 2] }
 *   ]
 * }
 * ```
 *
 * Example Output:
 * ```json
 * [
 *   [4, 8, 2, 3],
 *   [2, 2, 2, 2]
 * ]
 * ```
 *
 * @param data - The raw scene data object. Can be null or undefined.
 * @returns A 2D array of numbers, or an empty array if the input is invalid or empty.
 */
export function transformSceneData(data: RawSceneData | null | undefined): number[][] {
  if (!data || !Array.isArray(data.values)) {
    return [];
  }

  return data.values.map((row) => (row && Array.isArray(row.values) ? row.values : []));
}
// 导入密钥
export async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) {
    throw new Error(`AES‑256 expects a 32‑byte key; actual key length: ${rawKey.length}`);
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// 加密
export async function encrypt(plainText: string, cryptoKey: CryptoKey): Promise<ArrayBuffer> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(plainText);

  const encrypted = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    cryptoKey,
    encoded
  );

  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, encryptedArray.length - 16);
  const authTag = encryptedArray.slice(encryptedArray.length - 16);

  const combined = new Uint8Array(16 + 16 + ciphertext.length);
  combined.set(iv, 0);
  combined.set(authTag, 16);
  combined.set(ciphertext, 32);
  return combined.buffer;
}

// 解密
export async function decrypt(encryptedBuffer: ArrayBuffer, cryptoKey: CryptoKey): Promise<string> {
  const combined = new Uint8Array(encryptedBuffer);

  const iv = combined.slice(0, 16);
  const authTag = combined.slice(16, 32);
  const ciphertext = combined.slice(32);

  const encryptedWithTag = new Uint8Array(ciphertext.length + 16);
  encryptedWithTag.set(ciphertext, 0);
  encryptedWithTag.set(authTag, ciphertext.length);

  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    cryptoKey,
    encryptedWithTag
  );

  return new TextDecoder().decode(decrypted);
}
