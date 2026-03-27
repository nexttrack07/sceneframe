import {PlayerRef} from '@remotion/player';
import React, {useCallback, useContext, useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {addAsset, addAssetFromUrl, DropPosition} from './assets/add-asset';
import {CANVAS_PADDING} from './canvas/canvas';
import {CanvasSizeContext} from './canvas/canvas-size';
import {
	FEATURE_DROP_ASSETS_ON_CANVAS,
	FEATURE_DROP_ASSETS_ON_TIMELINE,
} from './flags';
import {PreviewSizeContext} from './preview-size';
import {calculateTrackHeights} from './timeline/utils/drag/calculate-track-heights';
import {TICKS_HEIGHT} from './timeline/ticks/constants';
import {calculateScale} from './utils/calculate-canvas-transformation';
import {useCurrentStateAsRef, useWriteContext} from './utils/use-context';

// SceneFrame custom asset drag payload
interface SceneFrameAssetPayload {
	type: 'image' | 'video' | 'audio';
	assetId: string;
	url: string;
	width?: number;
	height?: number;
	durationMs?: number;
	filename: string;
}

export const DropHandler: React.FC<{
	children: React.ReactNode;
	playerRef: React.RefObject<PlayerRef | null>;
	compositionHeight: number;
	compositionWidth: number;
	context: 'canvas' | 'timeline';
}> = ({children, playerRef, compositionHeight, compositionWidth, context}) => {
	const size = useContext(CanvasSizeContext);
	const {size: previewSize} = useContext(PreviewSizeContext);
	const timelineWriteContext = useWriteContext();
	const stateAsRef = useCurrentStateAsRef();

	const onDragOver: React.DragEventHandler = useCallback(
		(e) => {
			if (!FEATURE_DROP_ASSETS_ON_TIMELINE && context === 'timeline') {
				return;
			}

			if (!FEATURE_DROP_ASSETS_ON_CANVAS && context === 'canvas') {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = 'copy';
		},
		[context],
	);

	const onDrop: React.DragEventHandler = useCallback(
		async (e) => {
			if (!FEATURE_DROP_ASSETS_ON_TIMELINE && context === 'timeline') {
				return;
			}

			if (!FEATURE_DROP_ASSETS_ON_CANVAS && context === 'canvas') {
				return;
			}
			e.preventDefault();

			const {current} = playerRef;
			if (!current) {
				throw new Error('playerRef is null');
			}

			let dropPosition: DropPosition | null = null;
			if (context === 'canvas') {
				const containerNode = current.getContainerNode();
				if (!containerNode) {
					throw new Error('containerNode is null');
				}

				const playerRect = containerNode.getBoundingClientRect();
				if (!size) {
					throw new Error('size is null');
				}

				const scale = calculateScale({
					canvasSize: size,
					compositionHeight,
					compositionWidth,
					previewSize: previewSize.size,
				});
				const dropPositionX = Math.round((e.clientX - playerRect.left) / scale);
				const dropPositionY = Math.round((e.clientY - playerRect.top) / scale);
				dropPosition = {x: dropPositionX, y: dropPositionY};
			} else {
				dropPosition = null;
			}

			const state = stateAsRef.current;
			const tracks = state.undoableState.tracks;
			const items = state.undoableState.items;
			const fps = state.undoableState.fps;

			// Calculate target track index for timeline drops
			let targetTrackIndex: number | null = null;
			if (context === 'timeline' && tracks.length > 0) {
				const timelineElement = e.currentTarget as HTMLElement;
				const rect = timelineElement.getBoundingClientRect();
				const dropY = e.clientY - rect.top - TICKS_HEIGHT;

				if (dropY >= 0) {
					const trackLayouts = calculateTrackHeights({tracks, items});
					for (let i = 0; i < trackLayouts.length; i++) {
						const layout = trackLayouts[i];
						if (dropY >= layout.top && dropY < layout.top + layout.height) {
							targetTrackIndex = i;
							break;
						}
					}
					// If dropped below all tracks, target the last track
					if (targetTrackIndex === null && trackLayouts.length > 0) {
						targetTrackIndex = trackLayouts.length - 1;
					}
				}
			}

			// Check for SceneFrame custom asset payload first
			const sceneFrameData = e.dataTransfer.getData('application/x-sceneframe-asset');
			if (sceneFrameData) {
				try {
					const payload: SceneFrameAssetPayload = JSON.parse(sceneFrameData);
					await addAssetFromUrl({
						url: payload.url,
						filename: payload.filename,
						compositionHeight,
						compositionWidth,
						tracks,
						fps,
						timelineWriteContext,
						playerRef,
						dropPosition,
						targetTrackIndex,
					});
				} catch (err) {
					console.error('Failed to add SceneFrame asset:', err);
				}
				e.dataTransfer.clearData();
				return;
			}

			// Handle regular file drops
			const uploadPromises = [];
			for (const file of e.dataTransfer.files) {
				uploadPromises.push(
					addAsset({
						file,
						compositionHeight,
						compositionWidth,
						tracks: tracks,
						fps,
						timelineWriteContext: timelineWriteContext,
						playerRef,
						dropPosition,
						filename: file.name,
					}),
				);
			}
			await Promise.all(uploadPromises);

			e.dataTransfer.clearData();
		},
		[
			compositionHeight,
			compositionWidth,
			context,
			playerRef,
			previewSize.size,
			size,
			timelineWriteContext,
			stateAsRef,
		],
	);

	const style = useMemo(() => {
		if (context === 'canvas') {
			return {
				padding: CANVAS_PADDING,
			};
		}

		return {};
	}, [context]);

	return (
		<AbsoluteFill onDragOver={onDragOver} onDrop={onDrop} style={style}>
			{children}
		</AbsoluteFill>
	);
};
