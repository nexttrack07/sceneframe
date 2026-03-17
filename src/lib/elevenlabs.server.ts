import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { decryptUserApiKey } from "@/lib/encryption.server";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George — deep, warm narrator
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

/**
 * Get the user's ElevenLabs API key (decrypted).
 * Falls back to the server-wide env var if the user hasn't set one.
 */
export async function getUserElevenLabsKey(userId: string): Promise<string> {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
	});

	if (user?.elevenlabsKeyEnc && user?.elevenlabsKeyDek) {
		return decryptUserApiKey(user.elevenlabsKeyEnc, user.elevenlabsKeyDek);
	}

	const envKey = process.env.ELEVENLABS_API_KEY;
	if (envKey) return envKey;

	throw new Error(
		"No ElevenLabs API key found. Add one in your account settings.",
	);
}

/**
 * Generate speech audio from text using ElevenLabs TTS.
 * Returns the audio as a Buffer (mpeg format).
 */
export async function generateSpeech({
	apiKey,
	text,
	voiceId = DEFAULT_VOICE_ID,
	modelId = DEFAULT_MODEL_ID,
	stability = 0.5,
	similarityBoost = 0.75,
	style = 0.3,
}: {
	apiKey: string;
	text: string;
	voiceId?: string;
	modelId?: string;
	stability?: number;
	similarityBoost?: number;
	style?: number;
}): Promise<{ audio: Buffer; contentType: string }> {
	// Validate voiceId to prevent SSRF via path traversal
	if (!/^[a-zA-Z0-9]{10,30}$/.test(voiceId)) {
		throw new Error("Invalid ElevenLabs voice ID format");
	}

	const response = await fetch(
		`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
		{
			method: "POST",
			headers: {
				"xi-api-key": apiKey,
				"Content-Type": "application/json",
				Accept: "audio/mpeg",
			},
			body: JSON.stringify({
				text,
				model_id: modelId,
				voice_settings: {
					stability,
					similarity_boost: similarityBoost,
					style,
				},
			}),
		},
	);

	if (!response.ok) {
		const errorBody = await response.text().catch(() => "Unknown error");
		throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorBody}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	return {
		audio: Buffer.from(arrayBuffer),
		contentType: response.headers.get("content-type") ?? "audio/mpeg",
	};
}

/**
 * List available voices from ElevenLabs.
 */
export async function listVoices(apiKey: string) {
	const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
		headers: { "xi-api-key": apiKey },
	});

	if (!response.ok) {
		throw new Error(`Failed to list voices (${response.status})`);
	}

	const data = (await response.json()) as {
		voices: Array<{
			voice_id: string;
			name: string;
			category: string;
			labels: Record<string, string>;
			preview_url: string | null;
		}>;
	};

	return data.voices.map((v) => ({
		id: v.voice_id,
		name: v.name,
		category: v.category,
		labels: v.labels,
		previewUrl: v.preview_url,
	}));
}
