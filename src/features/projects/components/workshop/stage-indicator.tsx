import { AlertTriangle, Check, FileText, Film, Image, Mic } from "lucide-react";
import type { WorkshopStage } from "../../project-types";

const STAGES: { key: WorkshopStage; label: string; icon: typeof FileText }[] = [
	{ key: "outline", label: "Outline", icon: FileText },
	{ key: "shots", label: "Shots", icon: Film },
	{ key: "prompts", label: "Prompts", icon: Image },
	{ key: "audio", label: "Audio", icon: Mic },
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
		<div className="flex items-center px-4 py-3 border-b bg-gradient-to-r from-card/80 to-card/40 backdrop-blur-sm">
			{STAGES.map((stage, i) => {
				const isCurrent = stage.key === currentStage;
				const isPast = i < currentIndex;
				const isStale = staleStages.includes(stage.key);
				const isLast = i === STAGES.length - 1;
				const Icon = stage.icon;

				return (
					<div key={stage.key} className="flex items-center">
						<button
							type="button"
							onClick={() => onStageClick(stage.key)}
							className={`
								group relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
								transition-all duration-200 min-h-[40px]
								${
									isCurrent
										? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-[1.02]"
										: isPast
											? "bg-muted/80 text-foreground hover:bg-muted"
											: "text-muted-foreground hover:text-foreground hover:bg-muted/50"
								}
							`}
						>
							{/* Status indicator */}
							<span
								className={`
									flex items-center justify-center w-5 h-5 rounded-full text-[10px]
									transition-all duration-300
									${
										isStale
											? "bg-warning/20 text-warning"
											: isPast
												? "bg-primary/20 text-primary"
												: isCurrent
													? "bg-white/20"
													: "bg-muted"
									}
								`}
							>
								{isStale ? (
									<AlertTriangle size={12} />
								) : isPast ? (
									<Check size={12} className="animate-in zoom-in-50 duration-200" />
								) : (
									<Icon size={12} />
								)}
							</span>

							{/* Label */}
							<span className="font-display tracking-tight">{stage.label}</span>

							{/* Active indicator dot */}
							{isCurrent && (
								<span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-foreground/60" />
							)}
						</button>

						{/* Connector line */}
						{!isLast && (
							<div className="relative w-8 h-px mx-1">
								{/* Background track */}
								<div className="absolute inset-0 bg-border/50 rounded-full" />
								{/* Progress fill */}
								<div
									className={`
										absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out
										${isPast ? "w-full bg-primary/40" : "w-0"}
									`}
								/>
								{/* Animated pulse for transitioning */}
								{isPast && i === currentIndex - 1 && (
									<div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
