import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
				"border-border bg-card/50 h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base outline-none",
				"shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.08)]",
				"transition-[color,box-shadow,border-color] duration-150",
				"hover:border-muted-foreground/40",
				"focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-[3px] focus-visible:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2),0_0_0_1px_var(--primary)]",
				"file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
				"md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
