import type { Message } from "@/db/schema";
import type { ProjectSettings, ScriptDraft } from "../project-types";
import { ChatWorkshop } from "./workshop/chat-workshop";

export function ScriptWorkshop({
	projectId,
	existingMessages,
	projectSettings,
	scriptDraft,
	selectedItemId,
	onSelectedItemIdChange,
}: {
	projectId: string;
	existingMessages: Message[];
	projectSettings: ProjectSettings | null;
	scriptDraft?: ScriptDraft | null;
	selectedItemId: string | null;
	onSelectedItemIdChange: (id: string | null) => void;
}) {
	return (
		<ChatWorkshop
			projectId={projectId}
			existingMessages={existingMessages}
			project={{
				scriptDraft: scriptDraft ?? null,
				settings: projectSettings,
			}}
			selectedItemId={selectedItemId}
			onSelectedItemIdChange={onSelectedItemIdChange}
		/>
	);
}
