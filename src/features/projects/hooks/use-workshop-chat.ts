import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "@/db/schema";
import { parseQuickReplies } from "../lib/script-helpers";
import { sendMessage } from "../project-mutations";
import type { WorkshopStage } from "../project-types";

interface UseWorkshopChatArgs {
	projectId: string;
	existingMessages: Message[];
	stage?: WorkshopStage;
}

export function useWorkshopChat({
	projectId,
	existingMessages,
	stage,
}: UseWorkshopChatArgs) {
	const [chatMessages, setChatMessages] = useState<Message[]>(existingMessages);
	const [input, setInput] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		setChatMessages(existingMessages);
		setInput("");
		setError(null);
		setIsSending(false);
	}, [existingMessages]);

	const lastMessageId = chatMessages[chatMessages.length - 1]?.id;
	useEffect(() => {
		if (lastMessageId) {
			scrollRef.current?.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [lastMessageId]);

	const quickReplies = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			if (chatMessages[i].role === "assistant") {
				return parseQuickReplies(chatMessages[i].content);
			}
		}
		return null;
	}, [chatMessages]);

	const appendUserMessage = useCallback(
		(content: string, clientMessageId?: string) => {
			const id = crypto.randomUUID();
			const msg: Message = {
				id,
				projectId,
				role: "user",
				content,
				createdAt: new Date(),
				clientMessageId: clientMessageId ?? null,
			};
			setChatMessages((prev) => [...prev, msg]);
			return id;
		},
		[projectId],
	);

	const appendAssistantMessage = useCallback(
		(content: string) => {
			setChatMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					projectId,
					role: "assistant" as const,
					content,
					createdAt: new Date(),
					clientMessageId: null,
				},
			]);
		},
		[projectId],
	);

	const removeMessage = useCallback((messageId: string) => {
		setChatMessages((prev) => prev.filter((m) => m.id !== messageId));
	}, []);

	const runChatMessage = useCallback(
		async (content: string, selectedItemId?: string | null) => {
			const trimmed = content.trim();
			const clientMessageId = crypto.randomUUID();
			const tempId = appendUserMessage(trimmed, clientMessageId);
			setIsSending(true);
			setError(null);

			try {
				const result = await sendMessage({
					data: {
						projectId,
						content: trimmed,
						stage,
						clientMessageId,
						selectedItemId: selectedItemId ?? undefined,
					},
				});
				appendAssistantMessage(result.content);
			} catch (err) {
				removeMessage(tempId);
				setError(
					err instanceof Error ? err.message : "Failed to send message",
				);
			} finally {
				setIsSending(false);
			}
		},
		[
			appendAssistantMessage,
			appendUserMessage,
			projectId,
			removeMessage,
			stage,
		],
	);

	function handleKeyDown(
		e: React.KeyboardEvent,
		onSend: () => void,
	) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			onSend();
		}
	}

	function clearInput() {
		setInput("");
	}

	return {
		chatMessages,
		setChatMessages,
		input,
		setInput,
		isSending,
		setIsSending,
		error,
		setError,
		scrollRef,
		textareaRef,
		quickReplies,
		appendUserMessage,
		appendAssistantMessage,
		removeMessage,
		runChatMessage,
		handleKeyDown,
		clearInput,
	};
}
