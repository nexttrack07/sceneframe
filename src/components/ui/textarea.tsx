import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
				"border-border bg-card/50 flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base outline-none",
				"shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.08)]",
				"transition-[color,box-shadow,border-color] duration-150",
				"hover:border-muted-foreground/40",
				"focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-[3px] focus-visible:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_0_0_1px_var(--primary)]",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
				"md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
