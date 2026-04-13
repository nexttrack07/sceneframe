import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "./button";

interface ErrorAlertProps {
	message: string;
	onDismiss: () => void;
	onRetry?: () => void;
	suggestion?: string;
}

const ERROR_SUGGESTIONS: Record<string, string> = {
	network: "Check your internet connection and try again.",
	timeout: "The request took too long. Try again or reduce the complexity.",
	"rate limit": "Too many requests. Please wait a moment before trying again.",
	unauthorized: "Your session may have expired. Try refreshing the page.",
	"not found": "The requested resource may have been moved or deleted.",
	server: "Our servers are experiencing issues. Please try again later.",
};

function getSuggestion(message: string): string | null {
	const lowerMessage = message.toLowerCase();
	for (const [key, suggestion] of Object.entries(ERROR_SUGGESTIONS)) {
		if (lowerMessage.includes(key)) {
			return suggestion;
		}
	}
	return null;
}

export function ErrorAlert({
	message,
	onDismiss,
	onRetry,
	suggestion,
}: ErrorAlertProps) {
	const autoSuggestion = suggestion ?? getSuggestion(message);

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
			<div className="flex items-start gap-2">
				<AlertCircle size={16} className="shrink-0 mt-0.5 text-destructive" />
				<div className="flex-1 min-w-0">
					<p className="text-destructive font-medium">{message}</p>
					{autoSuggestion && (
						<p className="text-destructive/70 text-xs mt-1">{autoSuggestion}</p>
					)}
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="shrink-0 p-0.5 rounded hover:bg-destructive/20 text-destructive/50 hover:text-destructive transition-colors"
					aria-label="Dismiss error"
				>
					<X size={14} />
				</button>
			</div>
			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					onClick={onRetry}
					className="self-start gap-1.5 h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
				>
					<RefreshCw size={12} />
					Try again
				</Button>
			)}
		</div>
	);
}
