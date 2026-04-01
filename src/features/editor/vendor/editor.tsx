"use client";

import type { PlayerRef } from "@remotion/player";
import { useRef } from "react";
import { ActionRow } from "./action-row/action-row";
import { DownloadRemoteAssets } from "./caching/download-remote-assets";
import { UseLocalCachedAssets } from "./caching/use-local-cached-assets";
import { ContextProvider } from "./context-provider";
import "./editor-starter.css";
import { FEATURE_RESIZE_TIMELINE_PANEL } from "./flags";
import { ForceSpecificCursor } from "./force-specific-cursor";
import { PlaybackControls } from "./playback-controls";
import { PreviewSizeProvider } from "./preview-size-provider";
import { Timeline } from "./timeline/timeline";
import { TimelineContainer } from "./timeline/timeline-container";
import { TimelineResizer } from "./timeline-resizer";
import { TopPanel } from "./top-panel";
import { WaitForInitialized } from "./wait-for-initialized";

export const Editor: React.FC<{
	initialUndoableState?: import("./state/types").UndoableState;
	onStateChange?: (state: import("./state/types").UndoableState) => void;
}> = ({ initialUndoableState, onStateChange }) => {
	const playerRef = useRef<PlayerRef | null>(null);

	return (
		<div className="editor-starter-root bg-editor-starter-bg flex h-full w-full flex-col items-center justify-between">
			<ContextProvider
				initialUndoableState={initialUndoableState}
				onStateChange={onStateChange}
			>
				<WaitForInitialized>
					<PreviewSizeProvider>
						<ActionRow playerRef={playerRef} />
						<TopPanel playerRef={playerRef} />
					</PreviewSizeProvider>
					<PlaybackControls playerRef={playerRef} />
					{FEATURE_RESIZE_TIMELINE_PANEL && <TimelineResizer />}
					<TimelineContainer playerRef={playerRef}>
						<Timeline playerRef={playerRef} />
					</TimelineContainer>
				</WaitForInitialized>
				<ForceSpecificCursor />
				<DownloadRemoteAssets />
				<UseLocalCachedAssets />
			</ContextProvider>
		</div>
	);
};
