/**
 * Audio Feature Module
 *
 * Text-to-speech generation with provider abstraction.
 */

// Server actions
export {
	listVoices,
	generateVoiceover,
	summarizeForVoiceover,
	generateNarrationFromShots,
	selectVoiceover,
	listProjectVoiceovers,
	getVoiceUsage,
	type VoiceInfo,
} from "./audio-actions";

// Segment actions
export {
	computeSegmentBoundaries,
	listProjectSegments,
	autoSegmentProject,
	createAudioSegment,
	updateSegmentScript,
	updateSegmentShotRange,
	deleteAudioSegment,
	generateSegmentScript,
	generateSegmentAudio,
	generateAllSegments,
	migrateProjectToSegments,
	type SegmentWithShots,
	type SegmentBoundary,
} from "./segment-actions";

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
