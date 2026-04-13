import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-all duration-150 overflow-hidden",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground border-primary/50 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] [a&]:hover:bg-primary/90",
				secondary:
					"bg-secondary text-secondary-foreground border-secondary/50 shadow-[0_1px_2px_rgba(0,0,0,0.15)] [a&]:hover:bg-secondary/90",
				destructive:
					"bg-destructive text-destructive-foreground border-destructive/50 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] [a&]:hover:bg-destructive/90",
				outline:
					"border-border bg-card/50 text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.1)] [a&]:hover:bg-accent [a&]:hover:text-accent-foreground [a&]:hover:border-muted-foreground/30",
				ghost:
					"border-transparent [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
				link: "border-transparent text-primary underline-offset-4 [a&]:hover:underline",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant = "default",
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "span";

	return (
		<Comp
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
