import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-primary/90 hover:shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]",
				accent:
					"accent-bg-hover text-white shadow-[0_2px_8px_rgba(99,102,241,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_16px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]",
				destructive:
					"bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-destructive/90 hover:shadow-[0_2px_4px_rgba(0,0,0,0.4)] focus-visible:ring-destructive/30",
				outline:
					"border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:bg-accent hover:text-accent-foreground hover:border-muted-foreground/30",
				secondary:
					"bg-secondary text-secondary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:bg-secondary/80",
				ghost:
					"hover:bg-accent hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
				// Glass variants - glassmorphism style with backdrop blur
				"glass-primary":
					"bg-primary/20 text-primary-foreground backdrop-blur-md border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-primary/30 hover:shadow-[0_8px_24px_rgba(99,102,241,0.2),inset_0_1px_0_rgba(255,255,255,0.25)] hover:border-white/30",
				"glass-accent":
					"bg-indigo-500/25 text-white backdrop-blur-md border border-indigo-300/30 shadow-[0_4px_16px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-indigo-500/35 hover:shadow-[0_8px_24px_rgba(99,102,241,0.3),inset_0_1px_0_rgba(255,255,255,0.3)] hover:border-indigo-300/40",
				"glass-secondary":
					"bg-white/10 text-foreground backdrop-blur-md border border-white/15 shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-white/15 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.2)] hover:border-white/25",
				"glass-ghost":
					"bg-white/5 text-muted-foreground backdrop-blur-sm border border-transparent hover:bg-white/10 hover:text-foreground hover:border-white/10",
				"glass-destructive":
					"bg-destructive/20 text-destructive-foreground backdrop-blur-md border border-red-300/20 shadow-[0_4px_16px_rgba(239,68,68,0.1),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-destructive/30 hover:shadow-[0_8px_24px_rgba(239,68,68,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:border-red-300/30",
			},
			size: {
				// Touch targets: minimum 32px for compact, 40px for primary actions
				default: "h-10 px-4 py-2 has-[>svg]:px-3",
				xs: "h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
				sm: "h-9 rounded-md gap-1.5 px-3.5 has-[>svg]:px-3",
				lg: "h-11 rounded-md px-6 has-[>svg]:px-4",
				icon: "size-10",
				"icon-xs": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-4",
				"icon-sm": "size-9",
				"icon-lg": "size-11",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
