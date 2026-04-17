/**
 * Audio Feature Module
 *
 * Text-to-speech generation with provider abstraction.
 */

// Server actions
export {
	listVoices,
	generateVoiceover,
	selectVoiceover,
	listProjectVoiceovers,
	getVoiceUsage,
	type VoiceInfo,
} from "./audio-actions";

// Provider types and utilities
export {
	createTTSProvider,
	TTS_PROVIDERS,
	getProviderInfo,
	getImplementedProviders,
	type TTSProvider,
	type TTSProviderConfig,
	type TTSOptions,
	type TTSGenerationResult,
	type Voice,
	TTSProviderError,
} from "./providers";
