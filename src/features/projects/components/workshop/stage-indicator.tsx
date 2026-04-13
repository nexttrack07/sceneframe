import { AlertTriangle, Check } from "lucide-react";
import type { WorkshopStage } from "../../project-types";

const STAGES: { key: WorkshopStage; label: string }[] = [
	{ key: "discovery", label: "Discovery" },
	{ key: "outline", label: "Outline" },
	{ key: "shots", label: "Shots" },
	{ key: "prompts", label: "Prompts" },
];

interface StageIndicatorProps {
	currentStage: WorkshopStage;
	staleStages: string[];
	onStageClick: (stage: WorkshopStage) => void;
}

export function StageIndicator({
	currentStage,
	staleStages,
	onStageClick,
}: StageIndicatorProps) {
	const currentIndex = STAGES.findIndex((s) => s.key === currentStage);

	return (
		<div className="flex items-center gap-1 px-4 py-2 border-b bg-card/50">
			{STAGES.map((stage, i) => {
				const isCurrent = stage.key === currentStage;
				const isPast = i < currentIndex;
				const isStale = staleStages.includes(stage.key);

				return (
					<button
						key={stage.key}
						type="button"
						onClick={() => onStageClick(stage.key)}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
							isCurrent
								? "bg-primary text-primary-foreground"
								: isPast
									? "bg-muted text-foreground hover:bg-muted/80"
									: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{isStale ? (
							<AlertTriangle size={11} className="text-warning" />
						) : isPast ? (
							<Check size={11} />
						) : null}
						{stage.label}
					</button>
				);
			})}
		</div>
	);
}
