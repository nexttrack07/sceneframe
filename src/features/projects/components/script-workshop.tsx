import type { Message } from "@/db/schema";
import type { ProjectSettings, WorkshopState } from "../project-types";
import { ChatWorkshop } from "./workshop/chat-workshop";

export function ScriptWorkshop({
	projectId,
	existingMessages,
	projectSettings,
	workshop,
	selectedItemId,
	onSelectedItemIdChange,
}: {
	projectId: string;
	existingMessages: Message[];
	projectSettings: ProjectSettings | null;
	workshop?: WorkshopState | null;
	selectedItemId: string | null;
	onSelectedItemIdChange: (id: string | null) => void;
}) {
	return (
		<ChatWorkshop
			projectId={projectId}
			existingMessages={existingMessages}
			project={{
				workshop: workshop ?? null,
				settings: projectSettings,
			}}
			selectedItemId={selectedItemId}
			onSelectedItemIdChange={onSelectedItemIdChange}
		/>
	);
}
