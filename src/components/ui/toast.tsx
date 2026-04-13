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
							"group rounded-xl border-0 text-foreground pl-5",
						title: "text-sm font-medium tracking-[-0.01em]",
						description: "text-xs text-muted-foreground",
						closeButton: "",
					},
				}}
				icons={{
					success: <CheckCircle2 size={18} className="text-success" />,
					error: <AlertCircle size={18} className="text-destructive" />,
					info: <Info size={18} className="text-primary" />,
				}}
			/>
		</ToastContext.Provider>
	);
}
