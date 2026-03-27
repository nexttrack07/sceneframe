import {PlayerRef} from '@remotion/player';
import {toast} from 'sonner';
import {TimelineWriteOnlyContext} from '../context-provider';
import {makeItem} from '../items/make-item';
import {addAssetToState} from '../state/actions/add-asset-to-state';
import {addItem} from '../state/actions/add-item';
import {TrackType} from '../state/types';
import {getErrorStack, performAssetUpload} from '../utils/asset-upload-utils';
import {isTimelineEmpty} from '../utils/is-timeline-empty';
import {getUploadUrls} from '../utils/use-uploader';

export type DropPosition = {
	x: number;
	y: number;
};

const innerAddAsset = async ({
	file,
	timelineWriteContext,
	playerRef,
	dropPosition,
	fps,
	compositionWidth,
	compositionHeight,
	tracks,
	filename,
}: {
	file: Blob;
	timelineWriteContext: TimelineWriteOnlyContext;
	playerRef: React.RefObject<PlayerRef | null>;
	dropPosition: DropPosition | null;
	fps: number;
	compositionWidth: number;
	compositionHeight: number;
	tracks: TrackType[];
	filename: string;
}) => {
	const {setState} = timelineWriteContext;

	// Try to get upload URLs, but don't fail if this doesn't work
	const presignResultPromise = getUploadUrls(file);

	const {item, asset} = await makeItem({
		file,
		fps,
		compositionWidth,
		compositionHeight,
		playerRef,
		dropPosition,
		remoteUrl: null,
		remoteFileKey: null,
		filename,
	});

	const isEmpty = isTimelineEmpty(tracks);

	// Add asset and item to state
	setState({
		update: (state) => {
			const withItem = addItem({
				state,
				item: item,
				select: true,
				position: {type: 'front'},
			});
			const withAsset = addAssetToState({state: withItem, asset});
			return withAsset;
		},
		commitToUndoStack: true,
	});

	if (isEmpty) {
		setState({
			update: (state) => {
				return {
					...state,
					compositionWidth: item.width,
					compositionHeight: item.height,
				};
			},
			commitToUndoStack: true,
		});
	}

	// Handle cloud upload or local-only mode
	await performAssetUpload({setState, asset, presignResultPromise, file});
};

export const addAsset = async ({
	file,
	filename,
	timelineWriteContext,
	playerRef,
	dropPosition,
	fps,
	compositionWidth,
	compositionHeight,
	tracks,
}: {
	file: Blob;
	filename: string;
	timelineWriteContext: TimelineWriteOnlyContext;
	playerRef: React.RefObject<PlayerRef | null>;
	dropPosition: DropPosition | null;
	fps: number;
	compositionWidth: number;
	compositionHeight: number;
	tracks: TrackType[];
}) => {
	try {
		await innerAddAsset({
			file,
			fps,
			compositionWidth,
			compositionHeight,
			tracks,
			timelineWriteContext,
			playerRef,
			dropPosition,
			filename,
		});
	} catch (error: unknown) {
		const message = getErrorStack(error);
		toast.error('Error processing asset', {
			description: message,
		});
	}
};

/**
 * Infer asset type from filename extension.
 */
function inferAssetType(filename: string): 'image' | 'video' | 'audio' | null {
	const ext = filename.split('.').pop()?.toLowerCase();
	const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
	const videoExts = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
	const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'];

	if (ext && imageExts.includes(ext)) return 'image';
	if (ext && videoExts.includes(ext)) return 'video';
	if (ext && audioExts.includes(ext)) return 'audio';
	return null;
}

/**
 * Load image dimensions using an HTMLImageElement (avoids CORS fetch issues).
 */
function loadImageDimensions(url: string): Promise<{width: number; height: number}> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({width: img.naturalWidth, height: img.naturalHeight});
		img.onerror = () => reject(new Error('Failed to load image'));
		img.src = url;
	});
}

/**
 * Load video metadata using an HTMLVideoElement (avoids CORS fetch issues).
 */
function loadVideoMetadata(url: string): Promise<{width: number; height: number; durationInSeconds: number}> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		video.preload = 'metadata';
		video.onloadedmetadata = () => {
			resolve({
				width: video.videoWidth,
				height: video.videoHeight,
				durationInSeconds: video.duration,
			});
			video.src = '';
		};
		video.onerror = () => reject(new Error('Failed to load video metadata'));
		video.src = url;
	});
}

/**
 * Load audio metadata using an HTMLAudioElement (avoids CORS fetch issues).
 */
function loadAudioMetadata(url: string): Promise<{durationInSeconds: number}> {
	return new Promise((resolve, reject) => {
		const audio = document.createElement('audio');
		audio.preload = 'metadata';
		audio.onloadedmetadata = () => {
			resolve({durationInSeconds: audio.duration});
			audio.src = '';
		};
		audio.onerror = () => reject(new Error('Failed to load audio metadata'));
		audio.src = url;
	});
}

/**
 * Add an asset from a remote URL (used by SceneFrame asset library drag-and-drop).
 * Uses HTML elements to probe media properties, avoiding CORS fetch issues.
 */
export const addAssetFromUrl = async ({
	url,
	filename,
	timelineWriteContext,
	playerRef,
	dropPosition,
	fps,
	compositionWidth,
	compositionHeight,
	tracks,
	targetTrackIndex,
}: {
	url: string;
	filename: string;
	timelineWriteContext: TimelineWriteOnlyContext;
	playerRef: React.RefObject<PlayerRef | null>;
	dropPosition: DropPosition | null;
	fps: number;
	compositionWidth: number;
	compositionHeight: number;
	tracks: TrackType[];
	targetTrackIndex?: number | null;
}) => {
	const {generateRandomId} = await import('../utils/generate-random-id');
	const {setLocalUrl} = await import('../caching/load-to-blob-url');
	const {makeImageItem} = await import('../items/image/make-image-item');
	const {makeVideoItem} = await import('../items/video/make-video-item');
	const {makeAudioItem} = await import('../items/audio/make-audio-item');

	try {
		const assetType = inferAssetType(filename);
		if (!assetType) {
			throw new Error(`Unknown asset type for file: ${filename}`);
		}

		const {setState} = timelineWriteContext;
		const assetId = generateRandomId();
		const currentFrame = playerRef.current?.getCurrentFrame() ?? 0;
		const isEmpty = isTimelineEmpty(tracks);

		// Set the remote URL as the local URL for this asset (used by the player)
		setLocalUrl(assetId, url);

		// Create a minimal blob placeholder (not used for playback, just for type compatibility)
		const placeholderBlob = new Blob([], {type: 'application/octet-stream'});

		let item;
		let asset;

		if (assetType === 'image') {
			const dimensions = await loadImageDimensions(url);
			const result = await makeImageItem({
				file: placeholderBlob,
				fps,
				compositionWidth,
				compositionHeight,
				currentFrame,
				dropPosition,
				dimensions,
				assetId,
				filename,
				remoteUrl: url,
				remoteFileKey: null,
			});
			item = result.item;
			asset = result.asset;
		} else if (assetType === 'video') {
			const metadata = await loadVideoMetadata(url);
			const result = await makeVideoItem({
				file: placeholderBlob,
				fps,
				compositionWidth,
				compositionHeight,
				durationInSeconds: metadata.durationInSeconds,
				dimensions: {width: metadata.width, height: metadata.height},
				currentFrame,
				dropPosition,
				assetId,
				hasAudioTrack: true, // Assume videos have audio
				filename,
				remoteUrl: url,
				remoteFileKey: null,
			});
			item = result.item;
			asset = result.asset;
		} else {
			// Audio
			const metadata = await loadAudioMetadata(url);
			const result = await makeAudioItem({
				file: placeholderBlob,
				fps,
				durationInSeconds: metadata.durationInSeconds,
				currentFrame,
				size: 0,
				assetId,
				filename,
				remoteUrl: url,
				remoteFileKey: null,
			});
			item = result.item;
			asset = result.asset;
		}

		// Determine position: use target track if specified, otherwise add to front
		const position = targetTrackIndex != null
			? {type: 'directly-above' as const, trackIndex: targetTrackIndex}
			: {type: 'front' as const};

		// Add asset and item to state
		setState({
			update: (state) => {
				const withItem = addItem({
					state,
					item: item,
					select: true,
					position,
				});
				const withAsset = addAssetToState({state: withItem, asset});
				return withAsset;
			},
			commitToUndoStack: true,
		});

		if (isEmpty) {
			setState({
				update: (state) => {
					return {
						...state,
						compositionWidth: item.width,
						compositionHeight: item.height,
					};
				},
				commitToUndoStack: true,
			});
		}
	} catch (error: unknown) {
		console.error('Failed to add asset from URL:', url, error);
		const message = getErrorStack(error);
		toast.error('Error adding asset from URL', {
			description: message,
		});
	}
};
