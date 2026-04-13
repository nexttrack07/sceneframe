import { Film } from "lucide-react";
import type { Message } from "@/db/schema";
import { stripSuggestions } from "../lib/script-helpers";

function renderMarkdown(text: string): React.ReactNode[] {
	const lines = text.split("\n");
	return lines.map((line, lineIdx) => {
		const parts: React.ReactNode[] = [];
		let remaining = line;
		let key = 0;

		while (remaining.length > 0) {
			const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
			const italicMatch = remaining.match(
				/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/,
			);

			const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;
			const italicIdx = italicMatch
				? remaining.indexOf(italicMatch[0])
				: Infinity;

			if (boldIdx === Infinity && italicIdx === Infinity) {
				parts.push(remaining);
				break;
			}

			const prevLength = remaining.length;

			if (boldIdx <= italicIdx && boldMatch) {
				if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx));
				parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
				remaining = remaining.slice(boldIdx + boldMatch[0].length);
			} else if (italicMatch) {
				if (italicIdx > 0) parts.push(remaining.slice(0, italicIdx));
				parts.push(<em key={key++}>{italicMatch[1]}</em>);
				remaining = remaining.slice(italicIdx + italicMatch[0].length);
			}

			if (remaining.length === prevLength) break;
		}

		const lineKey = `${lineIdx}-${line.length}`;
		return (
			<span key={lineKey}>
				{parts}
				{lineIdx < lines.length - 1 && "\n"}
			</span>
		);
	});
}

export function ChatBubble({ message }: { message: Message }) {
	const isUser = message.role === "user";

	const displayText = !isUser
		? stripSuggestions(
				message.content.replace(/```scenes\s*[\s\S]*?```/, "").trim(),
			)
		: message.content;

	return (
		<div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
			<div
				className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
					isUser ? "bg-muted" : "bg-primary/15"
				}`}
			>
				{isUser ? (
					<span className="text-xs font-semibold text-muted-foreground">
						You
					</span>
				) : (
					<Film size={13} className="text-primary" />
				)}
			</div>
			<div className="max-w-[75%] space-y-3">
				{displayText && (
					<div
						className={`rounded-2xl px-4 py-3 ${
							isUser
								? "bg-primary text-primary-foreground rounded-tr-md"
								: "bg-muted text-foreground rounded-tl-md"
						}`}
					>
						<p className="text-sm whitespace-pre-wrap leading-relaxed">
							{renderMarkdown(displayText)}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
