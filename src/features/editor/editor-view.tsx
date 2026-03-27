import { useCallback, useMemo, useRef } from "react";
import type { Shot } from "@/db/schema";
import type {
	SceneAssetSummary,
	TransitionVideoSummary,
	VoiceoverAssetSummary,
} from "@/features/projects/project-types";
import { saveEditorState } from "@/features/projects/project-mutations";
import { buildEditorState } from "./bridge/build-editor-state";
import { ShotLibraryPanel } from "./components/shot-library-panel";
import { Editor } from "./vendor/editor";
import type { UndoableState } from "./vendor/state/types";

const AUTOSAVE_DELAY_MS = 2_000;

export function EditorView({
	shots,
	assets,
	transitionVideos,
	voiceovers,
	projectId,
	savedEditorState,
}: {
	shots: Shot[];
	assets: SceneAssetSummary[];
	transitionVideos: TransitionVideoSummary[];
	voiceovers: VoiceoverAssetSummary[];
	projectId: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb from DB arrives as Record<string, any>
	savedEditorState?: Record<string, any> | null;
}) {
	const initialState = useMemo(() => {
		if (savedEditorState) return savedEditorState as UndoableState;
		return buildEditorState({ shots, assets, transitionVideos, voiceovers });
	}, [shots, assets, transitionVideos, voiceovers, savedEditorState]);

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleStateChange = useCallback(
		(state: UndoableState) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				saveEditorState({
					data: {
						projectId,
						editorState: state as unknown as Record<string, unknown>,
					},
				}).catch((err) => console.error("Editor autosave failed:", err));
			}, AUTOSAVE_DELAY_MS);
		},
		[projectId],
	);

	return (
		<div className="h-full w-full flex">
			<ShotLibraryPanel
				shots={shots}
				assets={assets}
				transitionVideos={transitionVideos}
				voiceovers={voiceovers}
			/>
			<div className="flex-1 min-w-0">
				<Editor
					initialUndoableState={initialState}
					onStateChange={handleStateChange}
				/>
			</div>
		</div>
	);
}
