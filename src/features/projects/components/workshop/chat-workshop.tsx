import {
	Check,
	ClipboardCopy,
	FileText,
	Film,
	Image as ImageIcon,
	Loader2,
	MessageSquare,
	Send,
	Sparkles,
	X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/db/schema";
import {
	beginGenerationToast,
	resolveGenerationToast,
	updateGenerationToast,
} from "../../generation-toast";
import { useWorkshopChat } from "../../hooks/use-workshop-chat";
import { useWorkshopFlow } from "../../hooks/use-workshop-flow";
import { getSelectionLabel } from "../../lib/script-helpers";
import type { ProjectSettings, ScriptDraft } from "../../project-types";
import { ChatBubble } from "../chat-bubble";
import { OutlinePanel } from "./outline-panel";
import { PromptsPanel } from "./prompts-panel";
import { ShotsPanel } from "./shots-panel";
import { StageIndicator } from "./stage-indicator";
import {
	OutlinePanelSkeleton,
	PromptsPanelSkeleton,
	ShotsPanelSkeleton,
} from "./workshop-skeletons";

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

	const selectionLabel = useMemo(
		() => getSelectionLabel(flow.selectedItemId, project.scriptDraft ?? null),
		[flow.selectedItemId, project.scriptDraft],
	);

	const handleSend = useCallback(async () => {
		if (!chat.input.trim() || chat.isSending || flow.isGenerating) return;
		const content = chat.input.trim();
		chat.clearInput();
		await chat.runChatMessage(content, flow.selectedItemId);
	}, [chat, flow.isGenerating, flow.selectedItemId]);

	const handleSelectItem = useCallback(
		(id: string | null) => {
			flow.setSelectedItemId(id);
			if (id !== null) {
				requestAnimationFrame(() => chat.textareaRef.current?.focus());
			}
		},
		[chat.textareaRef, flow],
	);

	const [transcriptCopied, setTranscriptCopied] = useState(false);
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

	const handleGenerateShotsWithReview = useCallback(async () => {
		const toastId = `workshop-${++toastIdRef.current}`;
		chat.setIsSending(true);
		chat.setError(null);

		beginGenerationToast({
			id: toastId,
			title: "Breaking down to shots",
			location: "Script Workshop",
			medium: "workshop",
			status: "Generating shots...",
		});

		try {
			await flow.handleGenerateShots();

			updateGenerationToast(toastId, {
				status: "Reviewing shots...",
			});

			await flow.handleReviewShots();

			resolveGenerationToast(toastId, {
				status: "Complete",
				message: "Shot breakdown finished",
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
	}, [chat, flow]);

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
								setTranscriptCopied(true);
								setTimeout(() => setTranscriptCopied(false), 1500);
							}}
							className={`flex items-center gap-1 text-xs transition-colors ${
								transcriptCopied
									? "text-emerald-500"
									: "text-muted-foreground hover:text-foreground"
							}`}
							title={transcriptCopied ? "Copied!" : "Copy chat transcript"}
						>
							{transcriptCopied ? <Check size={12} /> : <ClipboardCopy size={12} />}
							{transcriptCopied ? "Copied" : "Copy"}
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
					{selectionLabel && (
						<div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs">
							<span className="shrink-0 text-primary">
								{selectionLabel.kind === "outline" ? (
									<FileText size={12} />
								) : selectionLabel.kind === "shot" ? (
									<Film size={12} />
								) : (
									<ImageIcon size={12} />
								)}
							</span>
							<span className="shrink-0 font-medium text-primary">
								Editing {selectionLabel.kind === "outline"
									? `beat ${selectionLabel.index + 1}`
									: selectionLabel.kind === "shot"
										? `shot ${selectionLabel.index + 1}`
										: `prompt ${selectionLabel.index + 1}`}
								:
							</span>
							<span className="flex-1 truncate text-muted-foreground">
								{selectionLabel.label}
							</span>
							<button
								type="button"
								onClick={() => flow.setSelectedItemId(null)}
								className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-primary/10 hover:text-foreground"
								title="Clear selection"
								aria-label="Clear selection"
							>
								<X size={12} />
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
					{flow.stage === "outline" && !flow.outline && flow.generatingStage !== "outline" && (
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
											variant="accent"
											onClick={() =>
												void handleGenerateWithChat(flow.handleGenerateOutline, "Generating outline")
											}
										>
											<Sparkles size={14} className="mr-2" />
											Generate outline
										</Button>
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

					{flow.stage === "outline" && flow.generatingStage === "outline" && !flow.outline && (
						<OutlinePanelSkeleton />
					)}

					{flow.stage === "outline" && flow.outline && (
						<div className="animate-fade-in-up">
							<OutlinePanel
								outline={flow.outline}
								selectedItemId={flow.selectedItemId}
								onSelectItem={handleSelectItem}
								isStale={flow.staleStages.includes("outline")}
								onRegenerate={() =>
									void handleGenerateWithChat(flow.handleGenerateOutline, "Generating outline")
								}
								onBreakdownToShots={() => void handleGenerateShotsWithReview()}
								isGenerating={flow.isGenerating}
							/>
						</div>
					)}

					{flow.stage === "shots" && flow.generatingStage === "shots" && !flow.shots && (
						<ShotsPanelSkeleton />
					)}

					{flow.stage === "shots" && flow.shots && (
						<div className="animate-fade-in-up">
							<ShotsPanel
								shots={flow.shots}
								selectedItemId={flow.selectedItemId}
								onSelectItem={handleSelectItem}
								isStale={flow.staleStages.includes("shots")}
								onRegenerate={() => void handleGenerateShotsWithReview()}
								onGeneratePrompts={() =>
									void handleGenerateWithChat(flow.handleGenerateImagePrompts, "Generating image prompts")
								}
								isGenerating={flow.isGenerating}
							/>
						</div>
					)}

					{flow.stage === "prompts" && flow.generatingStage === "prompts" && !flow.imagePrompts && (
						<PromptsPanelSkeleton />
					)}

					{flow.stage === "prompts" && flow.shots && (
						<div className="animate-fade-in-up">
							<PromptsPanel
								projectId={projectId}
								shots={flow.shots}
								imagePrompts={flow.imagePrompts ?? []}
								selectedItemId={flow.selectedItemId}
								onSelectItem={handleSelectItem}
								isStale={flow.staleStages.includes("prompts")}
								onRegenerate={() =>
									void handleGenerateWithChat(flow.handleGenerateImagePrompts, "Generating image prompts")
								}
							/>
						</div>
					)}

				</div>
			</div>
		</div>
	);
}
