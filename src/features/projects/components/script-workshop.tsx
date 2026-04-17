import type { Message } from "@/db/schema";
import type { ProjectSettings, WorkshopState } from "../project-types";
import { ChatWorkshop } from "./workshop/chat-workshop";

export function ScriptWorkshop({
	projectId,
	existingMessages,
	projectSettings,
	workshop,
	selectedItemIds,
	onSelectedItemIdsChange,
}: {
	projectId: string;
	existingMessages: Message[];
	projectSettings: ProjectSettings | null;
	workshop?: WorkshopState | null;
	selectedItemIds: string[];
	onSelectedItemIdsChange: (ids: string[]) => void;
}) {
	return (
		<ChatWorkshop
			projectId={projectId}
			existingMessages={existingMessages}
			project={{
				workshop: workshop ?? null,
				settings: projectSettings,
			}}
			selectedItemIds={selectedItemIds}
			onSelectedItemIdsChange={onSelectedItemIdsChange}
		/>
	);
}
