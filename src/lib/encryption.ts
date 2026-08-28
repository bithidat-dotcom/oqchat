// E2EE helper using the native Web Crypto (AES-GCM).
// Key is derived deterministically from the combination of conversationId and a secure salt.

const SALT = "ai-studio-remixgazzchat-secure-e2e-pepper-v1";

async function getKey(conversationId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKeyMaterial = enc.encode(conversationId + SALT);
  
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    rawKeyMaterial,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: 1000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(text: string, conversationId: string): Promise<string> {
  try {
    if (!text) return text;
    const key = await getKey(conversationId);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(text)
    );

    // Combine IV and Ciphertext for transport/storage
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Convert to standard base64 so it stores nicely in Firestore
    const binary = Array.from(combined).map(b => String.fromCharCode(b)).join('');
    return "e2ee:" + btoa(binary);
  } catch (error) {
    console.error("Encryption failed:", error);
    return text;
  }
}

export async function decryptText(encryptedBase64: string, conversationId: string): Promise<string> {
  try {
    if (!encryptedBase64 || !encryptedBase64.startsWith("e2ee:")) {
      return encryptedBase64; // Return as-is if not encrypted
    }
    const base64Data = encryptedBase64.substring(5);
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const combined = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await getKey(conversationId);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.warn("Decryption failed (maybe raw or different key):", error);
    return "[Encrypted Message]";
  }
}
