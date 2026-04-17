/**
 * useWorkshopAudio Hook
 *
 * Manages audio state for Workshop: voice listing, voiceover generation,
 * playback state, and audio asset management.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	listVoices,
	generateVoiceover,
	listProjectVoiceovers,
	getVoiceUsage,
} from "@/features/audio";
import { projectKeys } from "../query-keys";

interface VoiceoverAsset {
	id: string;
	url: string | null;
	prompt: string | null;
	model: string | null;
	status: string;
	isSelected: boolean;
	durationMs: number | null;
	createdAt: string;
}

interface VoiceUsage {
	charactersUsed: number;
	charactersLimit: number;
	resetDate: string | null;
}

interface UseWorkshopAudioArgs {
	projectId: string;
}

export function useWorkshopAudio({ projectId }: UseWorkshopAudioArgs) {
	const queryClient = useQueryClient();

	// Voice selection state
	const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

	// Generation state
	const [isGenerating, setIsGenerating] = useState(false);
	const [generationError, setGenerationError] = useState<string | null>(null);

	// Playback state
	const [playingAssetId, setPlayingAssetId] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Fetch available voices
	const {
		data: voices = [],
		isLoading: isLoadingVoices,
		error: voicesError,
	} = useQuery({
		queryKey: ["voices", "elevenlabs"],
		queryFn: () => listVoices({ data: { provider: "elevenlabs" } }),
		staleTime: 1000 * 60 * 5, // Cache for 5 minutes
	});

	// Fetch project voiceovers
	const {
		data: voiceovers = [],
		isLoading: isLoadingVoiceovers,
		refetch: refetchVoiceovers,
	} = useQuery({
		queryKey: projectKeys.voiceovers(projectId),
		queryFn: () => listProjectVoiceovers({ data: { projectId } }),
	});

	// Fetch voice usage
	const { data: usage } = useQuery({
		queryKey: ["voiceUsage"],
		queryFn: () => getVoiceUsage(),
		staleTime: 1000 * 60, // Cache for 1 minute
	});

	// Set default voice when voices load
	useEffect(() => {
		if (voices.length > 0 && !selectedVoiceId) {
			// Default to first voice or a known good voice
			const defaultVoice = voices.find((v) => v.name === "George") ?? voices[0];
			if (defaultVoice) {
				setSelectedVoiceId(defaultVoice.id);
			}
		}
	}, [voices, selectedVoiceId]);

	// Generate voiceover from script text
	const handleGenerateVoiceover = useCallback(
		async (text: string, options?: { stability?: number; similarityBoost?: number }) => {
			if (!selectedVoiceId) {
				setGenerationError("Please select a voice first");
				return null;
			}

			if (!text.trim()) {
				setGenerationError("Script text is required");
				return null;
			}

			setIsGenerating(true);
			setGenerationError(null);

			try {
				const result = await generateVoiceover({
					data: {
						projectId,
						text: text.trim(),
						voiceId: selectedVoiceId,
						options,
					},
				});

				// Refresh voiceovers list
				await refetchVoiceovers();

				// Invalidate usage
				await queryClient.invalidateQueries({ queryKey: ["voiceUsage"] });

				return result;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to generate voiceover";
				setGenerationError(message);
				return null;
			} finally {
				setIsGenerating(false);
			}
		},
		[projectId, selectedVoiceId, refetchVoiceovers, queryClient],
	);

	// Playback controls
	const handlePlay = useCallback((assetId: string, url: string) => {
		// Stop any currently playing audio
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}

		const audio = new Audio(url);
		audioRef.current = audio;

		audio.addEventListener("ended", () => {
			setIsPlaying(false);
			setPlayingAssetId(null);
		});

		audio.addEventListener("error", () => {
			setIsPlaying(false);
			setPlayingAssetId(null);
		});

		audio.play();
		setPlayingAssetId(assetId);
		setIsPlaying(true);
	}, []);

	const handlePause = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
		}
		setIsPlaying(false);
	}, []);

	const handleStop = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.currentTime = 0;
			audioRef.current = null;
		}
		setIsPlaying(false);
		setPlayingAssetId(null);
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current = null;
			}
		};
	}, []);

	return {
		// Voice data
		voices,
		isLoadingVoices,
		voicesError: voicesError instanceof Error ? voicesError.message : null,
		selectedVoiceId,
		setSelectedVoiceId,

		// Voiceover assets
		voiceovers: voiceovers as VoiceoverAsset[],
		isLoadingVoiceovers,
		refetchVoiceovers,

		// Usage
		usage: usage as VoiceUsage | null,

		// Generation
		isGenerating,
		generationError,
		clearGenerationError: () => setGenerationError(null),
		handleGenerateVoiceover,

		// Playback
		playingAssetId,
		isPlaying,
		handlePlay,
		handlePause,
		handleStop,
	};
}
