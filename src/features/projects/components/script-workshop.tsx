import { useRouter } from "@tanstack/react-router";
import { Check, Film, Loader2, Pencil, Send, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/db/schema";
import {
	composeBrief,
	estimateDuration,
	parseQuickReplies,
	parseSceneProposal,
	targetDurationRange,
} from "../lib/script-helpers";
import {
	approveScenes,
	resetWorkshop,
	saveIntake,
	sendMessage,
} from "../project-mutations";
import type { IntakeAnswers, ProjectSettings } from "../project-types";
import { ChatBubble } from "./chat-bubble";
import { IntakeForm } from "./intake-form";

export function ScriptWorkshop({
	projectId,
	existingMessages,
	projectSettings,
}: {
	projectId: string;
	existingMessages: Message[];
	projectSettings: ProjectSettings | null;
}) {
	const router = useRouter();
	const [chatMessages, setChatMessages] = useState<Message[]>(existingMessages);
	const [input, setInput] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [isApproving, setIsApproving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const intake = projectSettings?.intake ?? null;
	const intakeComplete = Boolean(intake?.concept);
	const [showIntake, setShowIntake] = useState(!intakeComplete);

	const messageCount = chatMessages.length;
	useEffect(() => {
		if (messageCount > 0) {
			scrollRef.current?.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [messageCount]);

	const lastProposal = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			if (chatMessages[i].role === "assistant") {
				const parsed = parseSceneProposal(chatMessages[i].content);
				if (parsed && parsed.length >= 1) return parsed;
			}
		}
		return null;
	}, [chatMessages]);

	const quickReplies = useMemo(() => {
		if (lastProposal) return null; // hide chips when scenes are proposed
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			if (chatMessages[i].role === "assistant") {
				return parseQuickReplies(chatMessages[i].content);
			}
		}
		return null;
	}, [chatMessages, lastProposal]);
	const totalDurationSec = useMemo(
		() =>
			lastProposal
				? lastProposal.reduce((sum, s) => sum + estimateDuration(s), 0)
				: 0,
		[lastProposal],
	);
	const targetRange = useMemo(
		() =>
			intake ? targetDurationRange(intake.targetDurationSec ?? 300) : null,
		[intake],
	);

	const doSendMessage = useCallback(
		async (content: string) => {
			const tempId = crypto.randomUUID();
			const userMsg: Message = {
				id: tempId,
				projectId,
				role: "user",
				content,
				createdAt: new Date(),
			};
			setChatMessages((prev) => [...prev, userMsg]);
			setIsSending(true);
			setError(null);

			try {
				const result = await sendMessage({ data: { projectId, content } });
				const assistantMsg: Message = {
					id: crypto.randomUUID(),
					projectId,
					role: "assistant",
					content: result.content,
					createdAt: new Date(),
				};
				setChatMessages((prev) => [...prev, assistantMsg]);
			} catch (err) {
				// Remove the optimistic user message on failure so the chat stays consistent
				setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
				setError(err instanceof Error ? err.message : "Failed to get response");
			} finally {
				setIsSending(false);
			}
		},
		[projectId],
	);

	async function handleSend() {
		if (!input.trim() || isSending) return;
		const content = input.trim();
		setInput("");
		await doSendMessage(content);
	}

	const handleIntakeComplete = useCallback(
		async (intake: IntakeAnswers) => {
			setError(null);
			try {
				await saveIntake({ data: { projectId, intake } });
				setShowIntake(false);
				const brief = composeBrief(intake);
				await doSendMessage(brief);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to save creative brief",
				);
			}
		},
		[projectId, doSendMessage],
	);

	async function handleEditBrief() {
		setError(null);
		try {
			await resetWorkshop({ data: projectId });
			setChatMessages([]);
			setShowIntake(true);
			await router.invalidate();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to restart brief and chat",
			);
		}
	}

	async function handleApprove() {
		if (!lastProposal || isApproving) return;
		setIsApproving(true);
		try {
			await approveScenes({
				data: {
					projectId,
					parsedScenes: lastProposal,
					targetDurationSec: intake?.targetDurationSec ?? 300,
				},
			});
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to approve scenes");
		} finally {
			setIsApproving(false);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	if (showIntake) {
		return (
			<IntakeForm
				onComplete={handleIntakeComplete}
				error={error}
				onDismissError={() => setError(null)}
			/>
		);
	}

	return (
		<div className="flex-1 flex flex-col min-h-0">
			{/* Chat header with Edit Creative Brief */}
			{intakeComplete && chatMessages.length > 0 && (
				<div className="px-6 py-2 border-b bg-card flex items-center justify-between">
					<div className="flex items-center gap-2 flex-wrap">
						<p className="text-xs text-muted-foreground">Script Chat</p>
						{intake?.audience && (
							<Badge variant="outline">Audience: {intake.audience}</Badge>
						)}
						{intake?.viewerAction && (
							<Badge variant="outline">Goal: {intake.viewerAction}</Badge>
						)}
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<button
								type="button"
								className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
							>
								<Pencil size={12} />
								Edit Creative Brief
							</button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Re-do Creative Brief?</AlertDialogTitle>
								<AlertDialogDescription>
									This will clear your current Script Chat and scenes so you can
									start fresh with a new Creative Brief.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={handleEditBrief}
									className="bg-destructive hover:bg-destructive/90"
								>
									Reset &amp; re-do
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			)}

			{/* Messages */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
			>
				{chatMessages.length === 0 && (
					<div className="text-center py-12">
						<Film size={32} className="text-muted-foreground/50 mx-auto mb-3" />
						<p className="text-muted-foreground font-medium">
							Welcome to Script Chat
						</p>
						<p className="text-sm text-muted-foreground/70 mt-1 max-w-md mx-auto">
							Describe your video concept and I&apos;ll help you develop it into
							a set of scenes. Start with the big idea — we&apos;ll refine it
							together.
						</p>
					</div>
				)}

				{chatMessages.map((msg) => (
					<ChatBubble key={msg.id} message={msg} />
				))}

				{isSending && (
					<div className="flex gap-3">
						<div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
							<Film size={13} className="text-primary" />
						</div>
						<div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
							<Loader2
								size={16}
								className="animate-spin text-muted-foreground"
							/>
						</div>
					</div>
				)}
			</div>

			{/* Approve bar */}
			{lastProposal && !isSending && (
				<div className="border-t bg-primary/10">
					{targetRange && (
						<div className="px-6 pt-3">
							<div className="rounded-lg border border-border bg-card p-2.5 flex items-center gap-2 text-xs text-muted-foreground">
								<Timer size={13} />
								<span>
									Estimated runtime:{" "}
									<strong className="text-foreground">
										{totalDurationSec}s
									</strong>{" "}
									(target {targetRange.min}-{targetRange.max}s)
								</span>
							</div>
						</div>
					)}
					<div className="px-6 py-3 flex items-center justify-between">
						<p className="text-sm text-primary">
							<strong>{lastProposal.length} scenes</strong> proposed. Happy with
							this breakdown?
						</p>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									setInput("Can you adjust...");
									setTimeout(() => textareaRef.current?.focus(), 0);
								}}
								disabled={isApproving}
							>
								Request changes
							</Button>
							<Button
								size="sm"
								onClick={handleApprove}
								disabled={isApproving}
								className="bg-primary hover:bg-primary/90"
							>
								{isApproving ? (
									<Loader2 size={13} className="animate-spin mr-1.5" />
								) : (
									<Check size={13} className="mr-1.5" />
								)}
								{isApproving ? "Approving…" : "Approve script"}
							</Button>
						</div>
					</div>
					<p className="px-6 pb-3 text-xs text-muted-foreground">
						Don&apos;t worry — you can still edit and refine each scene
						individually after approving.
					</p>
				</div>
			)}

			{/* Quick reply chips */}
			{quickReplies && !isSending && (
				<div className="px-6 py-2 flex flex-wrap gap-2 border-t bg-card/50">
					{quickReplies.map((reply) => (
						<button
							key={reply}
							type="button"
							onClick={() => {
								setInput(reply);
								setTimeout(() => textareaRef.current?.focus(), 0);
							}}
							className="px-3 py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary hover:text-primary transition-colors"
						>
							{reply}
						</button>
					))}
				</div>
			)}

			{/* Input */}
			<div className="px-6 py-4 border-t bg-card">
				{error && (
					<div className="flex items-center gap-2 mb-2 text-xs text-destructive">
						<span className="flex-1">{error}</span>
						<button
							type="button"
							onClick={() => setError(null)}
							className="text-destructive/50 hover:text-destructive"
						>
							✕
						</button>
					</div>
				)}
				<div className="flex gap-2">
					<Textarea
						ref={textareaRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Type a message..."
						rows={2}
						className="resize-none flex-1"
						disabled={isSending}
					/>
					<Button
						size="icon"
						onClick={handleSend}
						disabled={!input.trim() || isSending}
						className="shrink-0 self-end"
					>
						<Send size={16} />
					</Button>
				</div>
			</div>
		</div>
	);
}
