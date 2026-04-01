import { useCallback, useMemo, useRef } from "react";
import type { Scene, Shot } from "@/db/schema";
import { saveEditorState } from "@/features/projects/project-mutations";
import type {
	BackgroundMusicAssetSummary,
	SceneAssetSummary,
	ShotVideoSummary,
	TransitionVideoSummary,
	VoiceoverAssetSummary,
} from "@/features/projects/project-types";
import { buildEditorState } from "./bridge/build-editor-state";
import { ShotLibraryPanel } from "./components/shot-library-panel";
import { Editor } from "./vendor/editor";
import type { UndoableState } from "./vendor/state/types";

const AUTOSAVE_DELAY_MS = 2_000;

export function EditorView({
	scenes,
	shots,
	assets,
	shotVideoAssets,
	transitionVideos,
	voiceovers,
	backgroundMusic,
	projectId,
	savedEditorState,
}: {
	scenes: Scene[];
	shots: Shot[];
	assets: SceneAssetSummary[];
	shotVideoAssets: ShotVideoSummary[];
	transitionVideos: TransitionVideoSummary[];
	voiceovers: VoiceoverAssetSummary[];
	backgroundMusic: BackgroundMusicAssetSummary[];
	projectId: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb from DB arrives as Record<string, any>
	savedEditorState?: Record<string, any> | null;
}) {
	const initialState = useMemo(() => {
		if (savedEditorState) return savedEditorState as UndoableState;
		return buildEditorState({
			scenes,
			shots,
			assets,
			shotVideoAssets,
			transitionVideos,
			voiceovers,
			backgroundMusic,
		});
	}, [
		shots,
		scenes,
		assets,
		shotVideoAssets,
		transitionVideos,
		voiceovers,
		backgroundMusic,
		savedEditorState,
	]);

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
				scenes={scenes}
				shots={shots}
				assets={assets}
				shotVideoAssets={shotVideoAssets}
				transitionVideos={transitionVideos}
				voiceovers={voiceovers}
				backgroundMusic={backgroundMusic}
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
