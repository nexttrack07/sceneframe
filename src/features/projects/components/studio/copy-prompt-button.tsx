import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyPromptButton({
	value,
	label = "Copy prompt",
}: {
	value: string;
	label?: string;
}) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = setTimeout(() => setCopied(false), 1200);
		return () => clearTimeout(timeout);
	}, [copied]);

	async function handleCopy() {
		if (!value.trim()) return;
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			disabled={!value.trim()}
			title={copied ? "Copied" : label}
			className="p-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-40"
		>
			{copied ? <Check size={13} /> : <Copy size={13} />}
		</button>
	);
}
