import {PlayerRef} from '@remotion/player';
import React from 'react';
import {
	FEATURE_CANVAS_ZOOM_CONTROLS,
	FEATURE_DOWNLOAD_STATE,
	FEATURE_LOAD_STATE,
	FEATURE_REDO_BUTTON,
	FEATURE_SAVE_BUTTON,
	FEATURE_UNDO_BUTTON,
} from '../flags';
import {CanvasZoomControls} from './canvas-zoom-controls';
import {DownloadStateButton} from './download-state-button';
import {LoadStateButton} from './load-state-button';
import {RedoButton} from './redo-button';
import {SaveButton} from './save-button';
import {TasksIndicator} from './tasks-indicator/tasks-indicator';
import {ToolSelection} from './tool-selection';
import {UndoButton} from './undo-button';

export const ActionRow: React.FC<{
	playerRef: React.RefObject<PlayerRef | null>;
}> = ({playerRef}) => {
	return (
		<div className="border-b-editor-starter-border bg-editor-starter-panel flex w-full items-center gap-4 border-b p-3">
			<ToolSelection playerRef={playerRef} />
			<div className="flex overflow-hidden rounded">
				{FEATURE_UNDO_BUTTON && <UndoButton />}
				<div className="bg-editor-starter-panel w-px"></div>
				{FEATURE_REDO_BUTTON && <RedoButton />}
				<div className="bg-editor-starter-panel w-px"></div>
				{FEATURE_SAVE_BUTTON && <SaveButton />}
				{FEATURE_DOWNLOAD_STATE && (
					<>
						<div className="bg-editor-starter-panel w-px"></div>
						<DownloadStateButton />
					</>
				)}
				{FEATURE_LOAD_STATE && (
					<>
						<div className="bg-editor-starter-panel w-px"></div>
						<LoadStateButton />
					</>
				)}
			</div>
			<TasksIndicator />
			<div className="flex-1"></div>
			{FEATURE_CANVAS_ZOOM_CONTROLS ? <CanvasZoomControls /> : null}
		</div>
	);
};
