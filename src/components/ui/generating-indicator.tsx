import { useEffect, useState } from "react";
import { Loader2, Sparkles, Wand2, Zap } from "lucide-react";

const ENCOURAGING_MESSAGES = [
	"Crafting something special...",
	"Working on it...",
	"Almost there...",
	"Putting the pieces together...",
	"Making magic happen...",
	"Just a moment...",
];

const PHASE_ICONS = [Sparkles, Wand2, Zap] as const;

interface GeneratingIndicatorProps {
	/** Custom status message to display */
	status?: string;
	/** Show phase dots animation */
	showPhases?: boolean;
	/** Variant style */
	variant?: "inline" | "card" | "minimal";
	/** Size */
	size?: "sm" | "md" | "lg";
}

export function GeneratingIndicator({
	status,
	showPhases = true,
	variant = "card",
	size = "md",
}: GeneratingIndicatorProps) {
	const [messageIndex, setMessageIndex] = useState(0);
	const [phase, setPhase] = useState(0);

	// Rotate through encouraging messages
	useEffect(() => {
		if (status) return; // Don't rotate if custom status provided
		const interval = setInterval(() => {
			setMessageIndex((i) => (i + 1) % ENCOURAGING_MESSAGES.length);
		}, 3000);
		return () => clearInterval(interval);
	}, [status]);

	// Animate phase dots
	useEffect(() => {
		if (!showPhases) return;
		const interval = setInterval(() => {
			setPhase((p) => (p + 1) % 3);
		}, 600);
		return () => clearInterval(interval);
	}, [showPhases]);

	const displayMessage = status ?? ENCOURAGING_MESSAGES[messageIndex];
	const PhaseIcon = PHASE_ICONS[phase];

	const sizeClasses = {
		sm: { icon: 14, text: "text-xs", padding: "px-3 py-2", gap: "gap-2" },
		md: { icon: 16, text: "text-sm", padding: "px-4 py-3", gap: "gap-3" },
		lg: { icon: 20, text: "text-base", padding: "px-5 py-4", gap: "gap-4" },
	}[size];

	if (variant === "minimal") {
		return (
			<div className={`flex items-center ${sizeClasses.gap}`}>
				<Loader2 size={sizeClasses.icon} className="animate-spin text-primary" />
				<span className={`${sizeClasses.text} text-muted-foreground`}>
					{displayMessage}
				</span>
			</div>
		);
	}

	if (variant === "inline") {
		return (
			<div className={`inline-flex items-center ${sizeClasses.gap} ${sizeClasses.text}`}>
				<div className="relative">
					<Loader2 size={sizeClasses.icon} className="animate-spin text-primary" />
					{showPhases && (
						<PhaseIcon
							size={sizeClasses.icon * 0.5}
							className="absolute -top-0.5 -right-0.5 text-primary animate-pulse"
						/>
					)}
				</div>
				<span className="text-muted-foreground animate-in fade-in duration-300">
					{displayMessage}
				</span>
			</div>
		);
	}

	// Card variant (default)
	return (
		<div
			className={`
				flex items-center ${sizeClasses.gap} ${sizeClasses.padding}
				rounded-xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5
				border border-primary/20 backdrop-blur-sm
				animate-in fade-in slide-in-from-bottom-2 duration-300
			`}
		>
			{/* Animated icon container */}
			<div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-primary/15">
				<Loader2 size={20} className="animate-spin text-primary" />
				{showPhases && (
					<div className="absolute inset-0 flex items-center justify-center">
						<PhaseIcon
							size={10}
							className="absolute -top-0.5 -right-0.5 text-primary/80 animate-bounce"
						/>
					</div>
				)}
			</div>

			{/* Message and phase indicators */}
			<div className="flex-1 min-w-0">
				<p
					className={`${sizeClasses.text} font-medium text-foreground animate-in fade-in duration-300`}
					key={displayMessage}
				>
					{displayMessage}
				</p>
				{showPhases && (
					<div className="flex items-center gap-1 mt-1.5">
						{[0, 1, 2].map((i) => (
							<div
								key={i}
								className={`
									h-1 rounded-full transition-all duration-300
									${i === phase ? "w-4 bg-primary" : "w-1.5 bg-primary/30"}
								`}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/** Skeleton placeholder for content being generated */
export function GeneratingSkeleton({
	lines = 3,
	className = "",
}: {
	lines?: number;
	className?: string;
}) {
	return (
		<div className={`space-y-2 ${className}`}>
			{Array.from({ length: lines }).map((_, i) => (
				<div
					key={i}
					className="h-4 rounded bg-muted animate-pulse"
					style={{
						width: `${85 - i * 15}%`,
						animationDelay: `${i * 150}ms`,
					}}
				/>
			))}
		</div>
	);
}
