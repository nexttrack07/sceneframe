/**
 * TTS Provider Factory
 *
 * Creates and manages TTS provider instances.
 * Supports multiple providers with a unified interface.
 */

import { ElevenLabsProvider } from "./elevenlabs";
import type { TTSProvider, TTSProviderConfig } from "./types";
import { TTSProviderError } from "./types";

export * from "./types";
export { ElevenLabsProvider } from "./elevenlabs";

// ---------------------------------------------------------------------------
// Provider Factory
// ---------------------------------------------------------------------------

/**
 * Create a TTS provider instance from configuration
 */
export function createTTSProvider(config: TTSProviderConfig): TTSProvider {
	switch (config.provider) {
		case "elevenlabs":
			return new ElevenLabsProvider(config.apiKey);

		case "openai":
			// TODO: Implement OpenAI TTS provider
			throw new TTSProviderError(
				"OpenAI TTS provider not yet implemented",
				"openai",
				"NOT_CONFIGURED",
			);

		case "playht":
			// TODO: Implement Play.ht provider
			throw new TTSProviderError(
				"Play.ht provider not yet implemented",
				"playht",
				"NOT_CONFIGURED",
			);

		default:
			throw new TTSProviderError(
				`Unknown TTS provider: ${config.provider}`,
				config.provider,
				"NOT_CONFIGURED",
			);
	}
}

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

export interface ProviderInfo {
	id: TTSProviderConfig["provider"];
	name: string;
	description: string;
	implemented: boolean;
	features: {
		voiceCloning: boolean;
		multiLanguage: boolean;
		streaming: boolean;
	};
}

/**
 * List of all supported TTS providers
 */
export const TTS_PROVIDERS: ProviderInfo[] = [
	{
		id: "elevenlabs",
		name: "ElevenLabs",
		description: "High-quality AI voices with emotion and multilingual support",
		implemented: true,
		features: {
			voiceCloning: true,
			multiLanguage: true,
			streaming: true,
		},
	},
	{
		id: "openai",
		name: "OpenAI TTS",
		description: "Simple, reliable text-to-speech from OpenAI",
		implemented: false,
		features: {
			voiceCloning: false,
			multiLanguage: true,
			streaming: true,
		},
	},
	{
		id: "playht",
		name: "Play.ht",
		description: "Ultra-realistic AI voices with voice cloning",
		implemented: false,
		features: {
			voiceCloning: true,
			multiLanguage: true,
			streaming: true,
		},
	},
];

/**
 * Get information about a specific provider
 */
export function getProviderInfo(
	providerId: TTSProviderConfig["provider"],
): ProviderInfo | undefined {
	return TTS_PROVIDERS.find((p) => p.id === providerId);
}

/**
 * Get all implemented providers
 */
export function getImplementedProviders(): ProviderInfo[] {
	return TTS_PROVIDERS.filter((p) => p.implemented);
}
