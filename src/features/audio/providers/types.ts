/**
 * TTS Provider Abstraction Layer
 *
 * Unified interface for text-to-speech providers (ElevenLabs, OpenAI, etc.)
 * Allows easy switching between providers without changing application code.
 */

// ---------------------------------------------------------------------------
// Voice Types
// ---------------------------------------------------------------------------

export interface Voice {
	id: string;
	name: string;
	/** Provider-specific preview URL if available */
	previewUrl?: string;
	/** Voice characteristics */
	labels?: {
		accent?: string;
		description?: string;
		age?: string;
		gender?: string;
		useCase?: string;
	};
	/** Provider-specific metadata */
	metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Generation Options
// ---------------------------------------------------------------------------

export interface TTSOptions {
	/** Voice stability (0-1). Higher = more consistent, lower = more expressive */
	stability?: number;
	/** Similarity boost (0-1). Higher = closer to original voice */
	similarityBoost?: number;
	/** Speaking style (0-1). Provider-specific */
	style?: number;
	/** Output format */
	outputFormat?: "mp3_44100_128" | "mp3_22050_32" | "pcm_16000" | "pcm_22050";
	/** Model to use for generation */
	model?: string;
}

export interface TTSGenerationResult {
	/** Audio data as Buffer */
	audio: Buffer;
	/** Content type (e.g., "audio/mpeg") */
	contentType: string;
	/** Duration in milliseconds (if available) */
	durationMs?: number;
	/** Characters consumed (for billing) */
	charactersUsed?: number;
}

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export interface TTSProvider {
	/** Provider name (e.g., "elevenlabs", "openai") */
	readonly name: string;

	/** Display name for UI */
	readonly displayName: string;

	/**
	 * List available voices for this provider
	 */
	listVoices(): Promise<Voice[]>;

	/**
	 * Get a specific voice by ID
	 */
	getVoice(voiceId: string): Promise<Voice | null>;

	/**
	 * Generate speech from text
	 * @param text - Text to convert to speech
	 * @param voiceId - Voice identifier
	 * @param options - Generation options
	 */
	generateSpeech(
		text: string,
		voiceId: string,
		options?: TTSOptions,
	): Promise<TTSGenerationResult>;

	/**
	 * Check if the provider is properly configured (API key exists, etc.)
	 */
	isConfigured(): Promise<boolean>;

	/**
	 * Get current usage/quota information if available
	 */
	getUsage?(): Promise<{
		charactersUsed: number;
		charactersLimit: number;
		resetDate?: Date;
	}>;
}

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

export interface TTSProviderConfig {
	/** Provider identifier */
	provider: "elevenlabs" | "openai" | "playht";
	/** API key (encrypted or raw depending on context) */
	apiKey: string;
	/** Default voice ID to use */
	defaultVoiceId?: string;
	/** Default generation options */
	defaultOptions?: TTSOptions;
}

// ---------------------------------------------------------------------------
// Provider Errors
// ---------------------------------------------------------------------------

export class TTSProviderError extends Error {
	constructor(
		message: string,
		public readonly provider: string,
		public readonly code:
			| "NOT_CONFIGURED"
			| "INVALID_API_KEY"
			| "VOICE_NOT_FOUND"
			| "QUOTA_EXCEEDED"
			| "RATE_LIMITED"
			| "GENERATION_FAILED"
			| "NETWORK_ERROR",
		public readonly statusCode?: number,
	) {
		super(message);
		this.name = "TTSProviderError";
	}
}
