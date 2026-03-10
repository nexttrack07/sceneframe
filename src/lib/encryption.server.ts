import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKek(): Buffer {
	const key = process.env.ENCRYPTION_KEY;
	if (!key) throw new Error("ENCRYPTION_KEY env var is not set");
	if (key.length !== 64)
		throw new Error(
			"ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes for AES-256)",
		);
	return Buffer.from(key, "hex");
}

// ---------------------------------------------------------------------------
// Low-level helpers — IV is embedded in the output blob: [IV | ciphertext | authTag]
// ---------------------------------------------------------------------------

function encrypt(plaintext: Buffer, key: Buffer): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

function decrypt(blob: string, key: Buffer): Buffer {
	const buf = Buffer.from(blob, "base64");
	const iv = buf.subarray(0, IV_LENGTH);
	const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
	const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Envelope encryption — public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a new Replicate API key for a user.
 * Returns the three values to be stored in the `users` table.
 *
 * Scheme:
 *   1. Generate a random 256-bit DEK.
 *   2. Encrypt the DEK with the env KEK  → stored in `provider_key_dek`
 *   3. Encrypt the API key with the DEK  → stored in `provider_key_enc`
 *   `provider_key_iv` is kept null (IV is embedded inside each blob).
 */
export function encryptUserApiKey(apiKey: string): {
	providerKeyEnc: string;
	providerKeyDek: string;
} {
	const dek = randomBytes(32);
	const kek = getKek();

	const providerKeyDek = encrypt(dek, kek);
	const providerKeyEnc = encrypt(Buffer.from(apiKey, "utf8"), dek);

	return { providerKeyEnc, providerKeyDek };
}

/**
 * Decrypt a user's API key using the stored DB values.
 */
export function decryptUserApiKey(
	providerKeyEnc: string,
	providerKeyDek: string,
): string {
	const kek = getKek();
	const dek = decrypt(providerKeyDek, kek);
	return decrypt(providerKeyEnc, dek).toString("utf8");
}
