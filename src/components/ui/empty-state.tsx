import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

interface EmptyStateProps {
	/** Icon to display */
	icon: LucideIcon;
	/** Main headline */
	title: string;
	/** Encouraging description */
	description: string;
	/** Optional hint or tip */
	hint?: string;
	/** Action button label */
	actionLabel?: string;
	/** Action click handler or link */
	onAction?: () => void;
	/** Optional link (renders as anchor) */
	actionHref?: string;
	/** Additional content below */
	children?: ReactNode;
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	hint,
	actionLabel,
	onAction,
	actionHref,
	children,
}: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-16 px-6 text-center">
			{/* Decorative icon with layered background */}
			<div className="relative mb-6">
				{/* Outer glow ring */}
				<div className="absolute inset-0 w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 blur-xl" />
				{/* Inner icon container */}
				<div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center shadow-lg shadow-primary/5">
					<Icon size={28} className="text-primary" strokeWidth={1.5} />
				</div>
				{/* Sparkle decoration */}
				<div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary/40 animate-pulse" />
			</div>

			{/* Content */}
			<h2 className="font-display text-xl font-semibold text-foreground mb-2 tracking-tight">
				{title}
			</h2>
			<p className="text-sm text-muted-foreground max-w-sm mb-2 leading-relaxed">
				{description}
			</p>
			{hint && (
				<p className="text-xs text-muted-foreground/70 max-w-xs mb-6 italic">
					{hint}
				</p>
			)}

			{/* Action */}
			{(actionLabel && onAction) || actionHref ? (
				<div className="mt-4">
					{actionHref ? (
						<Button asChild variant="accent" size="lg">
							<a href={actionHref}>{actionLabel}</a>
						</Button>
					) : (
						<Button onClick={onAction} variant="accent" size="lg">
							{actionLabel}
						</Button>
					)}
				</div>
			) : null}

			{/* Additional content */}
			{children}
		</div>
	);
}

/** Preset empty states with curated copy */
export const emptyStatePresets = {
	projects: {
		title: "Your canvas awaits",
		description:
			"Every great video starts with an idea. Write a Director Prompt to describe your vision and we'll help bring it to life.",
		hint: "Tip: Be specific about mood, style, and story beats for best results.",
	},
	characters: {
		title: "Cast your characters",
		description:
			"Characters are the heart of your story. Add your protagonists, villains, and everyone in between.",
		hint: "Characters you create here can be reused across all your projects.",
	},
	locations: {
		title: "Build your world",
		description:
			"Great stories need great settings. Define the places where your narrative unfolds.",
		hint: "Locations with reference images generate more consistent visuals.",
	},
	shots: {
		title: "Ready for the breakdown",
		description:
			"Once you have an outline, we'll help you visualize each moment as individual shots.",
	},
	prompts: {
		title: "Prompts will appear here",
		description:
			"After breaking down your shots, we'll generate detailed image prompts for each one.",
	},
	audio: {
		title: "Add a voiceover",
		description:
			"Bring your story to life with AI-generated narration. Pick a voice and let's record.",
	},
	images: {
		title: "No images yet",
		description:
			"Upload reference images to maintain visual consistency across your project.",
	},
} as const;
