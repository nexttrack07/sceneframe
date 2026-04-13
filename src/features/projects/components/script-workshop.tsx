import type { Message } from "@/db/schema";
import type { ProjectSettings, ScriptDraft } from "../project-types";
import { ChatWorkshop } from "./workshop/chat-workshop";

export function ScriptWorkshop({
	projectId,
	existingMessages,
	projectSettings,
	scriptDraft,
}: {
	projectId: string;
	existingMessages: Message[];
	projectSettings: ProjectSettings | null;
	scriptDraft?: ScriptDraft | null;
}) {
	return (
		<ChatWorkshop
			projectId={projectId}
			existingMessages={existingMessages}
			project={{
				scriptDraft: scriptDraft ?? null,
				settings: projectSettings,
			}}
		/>
	);
}
