import { ClipboardCopy, Film, Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/db/schema";
import {
	beginGenerationToast,
	resolveGenerationToast,
} from "../../generation-toast";
import { useWorkshopChat } from "../../hooks/use-workshop-chat";
import { useWorkshopFlow } from "../../hooks/use-workshop-flow";
import type { ProjectSettings, ScriptDraft } from "../../project-types";
import { ChatBubble } from "../chat-bubble";
import { OutlinePanel } from "./outline-panel";
import { PromptsPanel } from "./prompts-panel";
import { ShotsPanel } from "./shots-panel";
import { StageIndicator } from "./stage-indicator";

interface ChatWorkshopProps {
	projectId: string;
	existingMessages: Message[];
	project: {
		scriptDraft?: ScriptDraft | null;
		settings?: ProjectSettings | null;
	};
}

export function ChatWorkshop({
	projectId,
	existingMessages,
	project,
}: ChatWorkshopProps) {
	const flow = useWorkshopFlow({ projectId, project });
	const chat = useWorkshopChat({ projectId, existingMessages, stage: flow.stage });

	const handleSend = useCallback(async () => {
		if (!chat.input.trim() || chat.isSending || flow.isGenerating) return;
		const content = chat.input.trim();
		chat.clearInput();
		await chat.runChatMessage(content);
	}, [chat, flow.isGenerating]);

	const toastIdRef = useRef(0);

	const handleGenerateWithChat = useCallback(
		async (
			generateFn: (feedback?: string) => Promise<string>,
			operationName: string,
		) => {
			const toastId = `workshop-${++toastIdRef.current}`;
			chat.setIsSending(true);
			chat.setError(null);

			beginGenerationToast({
				id: toastId,
				title: operationName,
				location: "Script Workshop",
				medium: "workshop",
				status: "Generating...",
			});

			try {
				await generateFn();
				resolveGenerationToast(toastId, {
					status: "Complete",
					message: `${operationName} finished`,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : "Generation failed";
				resolveGenerationToast(toastId, {
					status: "Failed",
					message,
					error: true,
				});
				chat.appendAssistantMessage(
					`Something went wrong: ${message}. You can try again.`,
				);
			} finally {
				chat.setIsSending(false);
			}
		},
		[chat],
	);

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			{/* Chat panel */}
			<div className="w-[34%] min-w-[360px] max-w-[480px] border-r bg-card flex flex-col min-h-0 overflow-hidden">
				<div className="px-5 py-3 border-b bg-card flex items-center justify-between">
					<p className="text-xs text-muted-foreground">Script Workshop</p>
					{chat.chatMessages.length > 0 && (
						<button
							type="button"
							onClick={() => {
								const transcript = chat.chatMessages
									.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
									.join("\n\n");
								navigator.clipboard.writeText(transcript);
							}}
							className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
							title="Copy chat transcript"
						>
							<ClipboardCopy size={12} />
							Copy
						</button>
					)}
				</div>

				<div
					ref={chat.scrollRef}
					className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
				>
					{chat.chatMessages.length === 0 && (
						<div className="rounded-xl border bg-background px-4 py-4">
							<div className="flex items-center gap-2 mb-2 text-foreground">
								<MessageSquare size={15} />
								<p className="text-sm font-medium">
									Let&apos;s build your video
								</p>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Tell me about the video you want to create. I&apos;ll ask
								clarifying questions to understand your vision before we start
								building the script.
							</p>
						</div>
					)}

					{chat.chatMessages.map((msg) => (
						<ChatBubble key={msg.id} message={msg} />
					))}

					{(chat.isSending || flow.isGenerating) && (
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

				{chat.quickReplies && !chat.isSending && !flow.isGenerating && (
					<div className="px-5 py-2 flex flex-wrap gap-2 border-t bg-card/50">
						{chat.quickReplies.map((reply) => (
							<button
								key={reply}
								type="button"
								onClick={() => {
									chat.setInput(reply);
									setTimeout(() => chat.textareaRef.current?.focus(), 0);
								}}
								className="px-3 py-1.5 text-xs rounded-full border border-border bg-background hover:border-primary hover:text-primary transition-colors"
							>
								{reply}
							</button>
						))}
					</div>
				)}

				<div className="px-5 py-4 border-t bg-card">
					{chat.error && (
						<div className="flex items-center gap-2 mb-2 text-xs text-destructive">
							<span className="flex-1">{chat.error}</span>
							<button
								type="button"
								onClick={() => chat.setError(null)}
								className="text-destructive/50 hover:text-destructive"
							>
								✕
							</button>
						</div>
					)}
					<div className="flex gap-2">
						<Textarea
							ref={chat.textareaRef}
							value={chat.input}
							onChange={(e) => chat.setInput(e.target.value)}
							onKeyDown={(e) =>
								chat.handleKeyDown(e, () => void handleSend())
							}
							placeholder="Describe your video idea, or ask to generate the next step..."
							rows={2}
							className="resize-none flex-1"
							disabled={chat.isSending || flow.isGenerating}
						/>
						<Button
							size="icon"
							onClick={() => void handleSend()}
							disabled={
								!chat.input.trim() || chat.isSending || flow.isGenerating
							}
							className="shrink-0 self-end"
						>
							<Send size={16} />
						</Button>
					</div>
				</div>
			</div>

			{/* Right panel */}
			<div className="flex-1 min-h-0 bg-muted/20 overflow-hidden flex flex-col">
				<StageIndicator
					currentStage={flow.stage}
					staleStages={flow.staleStages}
					onStageClick={flow.setStage}
				/>
				<div className="flex-1 overflow-y-auto px-8 py-8">
					{flow.stage === "discovery" && (
						<div className="h-full rounded-2xl border border-dashed border-border/70 bg-background/70 flex items-center justify-center">
							<div className="text-center max-w-md px-6">
								{chat.chatMessages.length >= 2 && !chat.isSending && !flow.isGenerating ? (
									<>
										<Sparkles size={24} className="mx-auto mb-3 text-primary" />
										<p className="text-sm font-medium text-foreground mb-2">
											Ready to generate your outline?
										</p>
										<p className="text-sm text-muted-foreground leading-relaxed mb-4">
											Based on your conversation, I&apos;ll create a scene-by-scene
											outline for your video.
										</p>
										<Button
											onClick={() =>
												void handleGenerateWithChat(flow.handleGenerateOutline, "Generating outline")
											}
										>
											<Sparkles size={14} className="mr-2" />
											Generate outline
										</Button>
									</>
								) : flow.isGenerating ? (
									<>
										<Loader2 size={26} className="animate-spin text-muted-foreground mx-auto mb-3" />
										<p className="text-sm text-muted-foreground">
											Generating outline...
										</p>
									</>
								) : (
									<>
										<p className="text-sm font-medium text-foreground mb-2">
											Your script will take shape here
										</p>
										<p className="text-sm text-muted-foreground leading-relaxed">
											Start by describing your video idea in the chat. I&apos;ll ask
											questions to understand your vision, then you can generate an
											outline when ready.
										</p>
									</>
								)}
							</div>
						</div>
					)}

					{flow.stage === "outline" && flow.outline && (
						<OutlinePanel
							outline={flow.outline}
							selectedItemId={flow.selectedItemId}
							onSelectItem={flow.setSelectedItemId}
							isStale={flow.staleStages.includes("outline")}
							onRegenerate={() =>
								void handleGenerateWithChat(flow.handleGenerateOutline, "Generating outline")
							}
							onBreakdownToShots={() =>
								void handleGenerateWithChat(flow.handleGenerateShots, "Breaking down to shots")
							}
							isGenerating={flow.isGenerating}
						/>
					)}

					{flow.stage === "shots" && flow.shots && (
						<ShotsPanel
							shots={flow.shots}
							selectedItemId={flow.selectedItemId}
							onSelectItem={flow.setSelectedItemId}
							isStale={flow.staleStages.includes("shots")}
							onRegenerate={() =>
								void handleGenerateWithChat(flow.handleGenerateShots, "Breaking down to shots")
							}
							onGeneratePrompts={() =>
								void handleGenerateWithChat(flow.handleGenerateImagePrompts, "Generating image prompts")
							}
							isGenerating={flow.isGenerating}
						/>
					)}

					{flow.stage === "prompts" && flow.shots && (
						<PromptsPanel
							shots={flow.shots}
							imagePrompts={flow.imagePrompts ?? []}
							selectedItemId={flow.selectedItemId}
							onSelectItem={flow.setSelectedItemId}
							isStale={flow.staleStages.includes("prompts")}
							onRegenerate={() =>
								void handleGenerateWithChat(flow.handleGenerateImagePrompts, "Generating image prompts")
							}
							onApprove={() => {
							chat.setIsSending(true);
							flow
								.handleApprove()
								.catch((err) => {
									const message =
										err instanceof Error
											? err.message
											: "Failed to approve";
									chat.appendAssistantMessage(
										`Something went wrong: ${message}. You can try again.`,
									);
								})
								.finally(() => chat.setIsSending(false));
						}}
							isApproving={flow.isGenerating}
						/>
					)}

					{flow.stage !== "discovery" &&
						!flow.outline &&
						!flow.shots && (
							<div className="h-full rounded-2xl border border-dashed border-border/70 bg-background/70 flex items-center justify-center">
								<div className="text-center max-w-md px-6">
									<Loader2
										size={26}
										className="animate-spin text-muted-foreground mx-auto mb-3"
									/>
									<p className="text-sm text-muted-foreground">
										Generating...
									</p>
								</div>
							</div>
						)}
				</div>
			</div>
		</div>
	);
}
