import { Check, ClipboardCopy } from "lucide-react";
import { useCallback, useState } from "react";

interface CopyButtonProps {
	text: string;
	title?: string;
	size?: number;
}

export function CopyButton({ text, title = "Copy", size = 12 }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		},
		[text],
	);

	return (
		<button
			type="button"
			onClick={handleCopy}
			className={`transition-colors ${
				copied
					? "text-success"
					: "text-muted-foreground hover:text-foreground"
			}`}
			title={copied ? "Copied!" : title}
		>
			{copied ? <Check size={size} /> : <ClipboardCopy size={size} />}
		</button>
	);
}
