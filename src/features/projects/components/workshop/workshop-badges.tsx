import { Camera, Target, Timer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProjectSettings, ShotDraftEntry } from "../../project-types";

interface WorkshopBadgesProps {
	settings: ProjectSettings | null | undefined;
	shots: ShotDraftEntry[] | null | undefined;
}

export function WorkshopBadges({ settings, shots }: WorkshopBadgesProps) {
	const audience = settings?.intake?.audience?.trim();
	const viewerAction = settings?.intake?.viewerAction?.trim();
	const shotCount = shots?.length ?? 0;
	const totalDuration =
		shots?.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) ?? 0;

	const hasAnything =
		audience || viewerAction || shotCount > 0 || totalDuration > 0;
	if (!hasAnything) return null;

	return (
		<div className="flex flex-wrap items-center gap-2 px-8 pt-4">
			{audience && (
				<Badge variant="outline" className="gap-1">
					<Users size={11} />
					{audience}
				</Badge>
			)}
			{viewerAction && (
				<Badge variant="outline" className="gap-1">
					<Target size={11} />
					{viewerAction}
				</Badge>
			)}
			{shotCount > 0 && (
				<Badge variant="outline" className="gap-1">
					<Camera size={11} />
					{shotCount} shot{shotCount === 1 ? "" : "s"}
				</Badge>
			)}
			{totalDuration > 0 && (
				<Badge variant="outline" className="gap-1">
					<Timer size={11} />
					{totalDuration}s
				</Badge>
			)}
		</div>
	);
}
