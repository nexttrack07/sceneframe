import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingContainerProps {
	message?: string;
	size?: "sm" | "md" | "lg";
	className?: string;
}

const sizeClasses = {
	sm: { icon: 16, text: "text-xs" },
	md: { icon: 24, text: "text-sm" },
	lg: { icon: 32, text: "text-base" },
};

export function LoadingContainer({
	message = "Loading...",
	size = "md",
	className,
}: LoadingContainerProps) {
	const { icon, text } = sizeClasses[size];

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-3 p-6 animate-fade-in-up",
				className
			)}
		>
			<div className="relative">
				<Loader2
					size={icon}
					className="animate-spin text-primary"
				/>
				<div
					className="absolute inset-0 rounded-full bg-primary/20 animate-ping"
					style={{ animationDuration: "1.5s" }}
				/>
			</div>
			{message && (
				<p className={cn("text-muted-foreground", text)}>{message}</p>
			)}
		</div>
	);
}
