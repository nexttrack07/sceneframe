/**
 * ElevenLabs TTS Provider Implementation
 *
 * Implements the TTSProvider interface for ElevenLabs API.
 * https://elevenlabs.io/docs/api-reference
 */

import type {
	TTSGenerationResult,
	TTSOptions,
	TTSProvider,
	Voice,
} from "./types";
import { TTSProviderError } from "./types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

// ---------------------------------------------------------------------------
// ElevenLabs API Types
// ---------------------------------------------------------------------------

interface ElevenLabsVoice {
	voice_id: string;
	name: string;
	preview_url?: string;
	labels?: {
		accent?: string;
		description?: string;
		age?: string;
		gender?: string;
		use_case?: string;
	};
	category?: string;
}

interface ElevenLabsVoicesResponse {
	voices: ElevenLabsVoice[];
}

interface ElevenLabsSubscription {
	character_count: number;
	character_limit: number;
	next_character_count_reset_unix?: number;
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class ElevenLabsProvider implements TTSProvider {
	readonly name = "elevenlabs";
	readonly displayName = "ElevenLabs";

	constructor(private readonly apiKey: string) {}

	async listVoices(): Promise<Voice[]> {
		this.assertConfigured();

		const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
			headers: {
				"xi-api-key": this.apiKey,
			},
		});

		if (!response.ok) {
			throw this.handleApiError(response);
		}

		const data = (await response.json()) as ElevenLabsVoicesResponse;

		return data.voices.map((voice) => this.mapVoice(voice));
	}

	async getVoice(voiceId: string): Promise<Voice | null> {
		this.assertConfigured();

		const response = await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
			headers: {
				"xi-api-key": this.apiKey,
			},
		});

		if (response.status === 404) {
			return null;
		}

		if (!response.ok) {
			throw this.handleApiError(response);
		}

		const voice = (await response.json()) as ElevenLabsVoice;
		return this.mapVoice(voice);
	}

	async generateSpeech(
		text: string,
		voiceId: string,
		options?: TTSOptions,
	): Promise<TTSGenerationResult> {
		this.assertConfigured();

		if (!text.trim()) {
			throw new TTSProviderError(
				"Text cannot be empty",
				this.name,
				"GENERATION_FAILED",
			);
		}

		const model = options?.model ?? "eleven_multilingual_v2";
		const outputFormat = options?.outputFormat ?? "mp3_44100_128";

		const response = await fetch(
			`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
			{
				method: "POST",
				headers: {
					"xi-api-key": this.apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					text,
					model_id: model,
					voice_settings: {
						stability: options?.stability ?? 0.5,
						similarity_boost: options?.similarityBoost ?? 0.75,
						style: options?.style ?? 0,
						use_speaker_boost: true,
					},
				}),
			},
		);

		if (!response.ok) {
			throw this.handleApiError(response);
		}

		const arrayBuffer = await response.arrayBuffer();
		const audio = Buffer.from(arrayBuffer);

		// Extract character count from headers if available
		const charactersUsed = response.headers.get("x-characters-used");

		return {
			audio,
			contentType: this.getContentType(outputFormat),
			charactersUsed: charactersUsed ? parseInt(charactersUsed, 10) : undefined,
		};
	}

	async isConfigured(): Promise<boolean> {
		if (!this.apiKey) {
			return false;
		}

		try {
			// Make a lightweight API call to verify the key
			const response = await fetch(`${ELEVENLABS_API_BASE}/user`, {
				headers: {
					"xi-api-key": this.apiKey,
				},
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	async getUsage(): Promise<{
		charactersUsed: number;
		charactersLimit: number;
		resetDate?: Date;
	}> {
		this.assertConfigured();

		const response = await fetch(
			`${ELEVENLABS_API_BASE}/user/subscription`,
			{
				headers: {
					"xi-api-key": this.apiKey,
				},
			},
		);

		if (!response.ok) {
			throw this.handleApiError(response);
		}

		const data = (await response.json()) as ElevenLabsSubscription;

		return {
			charactersUsed: data.character_count,
			charactersLimit: data.character_limit,
			resetDate: data.next_character_count_reset_unix
				? new Date(data.next_character_count_reset_unix * 1000)
				: undefined,
		};
	}

	// ---------------------------------------------------------------------------
	// Private Helpers
	// ---------------------------------------------------------------------------

	private assertConfigured(): void {
		if (!this.apiKey) {
			throw new TTSProviderError(
				"ElevenLabs API key not configured",
				this.name,
				"NOT_CONFIGURED",
			);
		}
	}

	private mapVoice(voice: ElevenLabsVoice): Voice {
		return {
			id: voice.voice_id,
			name: voice.name,
			previewUrl: voice.preview_url,
			labels: voice.labels
				? {
						accent: voice.labels.accent,
						description: voice.labels.description,
						age: voice.labels.age,
						gender: voice.labels.gender,
						useCase: voice.labels.use_case,
					}
				: undefined,
			metadata: voice.category ? { category: voice.category } : undefined,
		};
	}

	private handleApiError(response: Response): TTSProviderError {
		const status = response.status;

		if (status === 401) {
			return new TTSProviderError(
				"Invalid ElevenLabs API key",
				this.name,
				"INVALID_API_KEY",
				status,
			);
		}

		if (status === 404) {
			return new TTSProviderError(
				"Voice not found",
				this.name,
				"VOICE_NOT_FOUND",
				status,
			);
		}

		if (status === 429) {
			return new TTSProviderError(
				"Rate limit exceeded",
				this.name,
				"RATE_LIMITED",
				status,
			);
		}

		if (status === 402 || status === 403) {
			return new TTSProviderError(
				"Quota exceeded or insufficient permissions",
				this.name,
				"QUOTA_EXCEEDED",
				status,
			);
		}

		return new TTSProviderError(
			`ElevenLabs API error: ${response.statusText}`,
			this.name,
			"GENERATION_FAILED",
			status,
		);
	}

	private getContentType(
		format: NonNullable<TTSOptions["outputFormat"]>,
	): string {
		switch (format) {
			case "mp3_44100_128":
			case "mp3_22050_32":
				return "audio/mpeg";
			case "pcm_16000":
			case "pcm_22050":
				return "audio/pcm";
			default:
				return "audio/mpeg";
		}
	}
}
