import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

type ToastVariant = "success" | "error" | "info";

interface Toast {
	id: string;
	message: string;
	variant: ToastVariant;
}

interface ToastContextValue {
	toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
	return ctx;
}

const ICON_MAP = {
	success: CheckCircle2,
	error: AlertCircle,
	info: Info,
} as const;

const ICON_COLOR_MAP = {
	success: "text-blue-600",
	error: "text-red-500",
	info: "text-foreground/70",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const addToast = useCallback(
		(message: string, variant: ToastVariant = "info") => {
			const id = crypto.randomUUID();
			setToasts((prev) => [...prev, { id, message, variant }]);
			setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, variant === "error" ? 6000 : 3000);
		},
		[],
	);

	const dismiss = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return (
		<ToastContext.Provider value={{ toast: addToast }}>
			{children}
			{/* Toast container — bottom right */}
			{toasts.length > 0 && (
				<div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
					{toasts.map((t) => {
						const Icon = ICON_MAP[t.variant];
						return (
							<div
								key={t.id}
								className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-border bg-background text-foreground shadow-lg text-sm animate-in slide-in-from-right-5 fade-in duration-200"
							>
								<Icon
									size={15}
									className={`shrink-0 ${ICON_COLOR_MAP[t.variant]}`}
								/>
								<span className="flex-1">{t.message}</span>
								<button
									type="button"
									onClick={() => dismiss(t.id)}
									className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
								>
									<X size={13} />
								</button>
							</div>
						);
					})}
				</div>
			)}
		</ToastContext.Provider>
	);
}
