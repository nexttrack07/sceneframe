import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { createContext, useContext, useMemo } from "react";
import { toast as sonnerToast, Toaster } from "sonner";

export type ToastVariant = "success" | "error" | "info";

interface ToastContextValue {
	toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
	return ctx;
}

function dispatchToast(message: string, variant: ToastVariant = "info") {
	const baseOptions = {
		description: undefined,
		duration: variant === "error" ? 6000 : 3000,
	};

	switch (variant) {
		case "success":
			sonnerToast.success(message, baseOptions);
			break;
		case "error":
			sonnerToast.error(message, baseOptions);
			break;
		default:
			sonnerToast(message, baseOptions);
	}
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const value = useMemo<ToastContextValue>(
		() => ({
			toast: dispatchToast,
		}),
		[],
	);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<Toaster
				position="bottom-right"
				expand
				closeButton
				visibleToasts={8}
				toastOptions={{
					classNames: {
						toast:
							"group rounded-[10px] border border-border/60 bg-background/95 text-foreground shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur-sm",
						title: "text-sm font-medium tracking-[-0.01em]",
						description: "text-xs text-muted-foreground",
						closeButton:
							"border-border/70 bg-background/90 text-muted-foreground hover:text-foreground",
					},
				}}
				icons={{
					success: <CheckCircle2 size={16} className="text-success" />,
					error: <AlertCircle size={16} className="text-destructive" />,
					info: <Info size={16} className="text-muted-foreground" />,
				}}
			/>
		</ToastContext.Provider>
	);
}
