import {
	Check,
	ClipboardCopy,
	FileText,
	Film,
	Image as ImageIcon,
	MessageSquare,
	Send,
	Sparkles,
	Undo2,
	X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GeneratingIndicator } from "@/components/ui/generating-indicator";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/db/schema";
import {
	beginGenerationToast,
	resolveGenerationToast,
	updateGenerationToast,
} from "../../generation-toast";
import { applyWorkshopEdit } from "../../workshop-mutations";
import { useReviewMode } from "../../hooks/use-review-mode";
import { useWorkshopAudio } from "../../hooks/use-workshop-audio";
import { useWorkshopChat } from "../../hooks/use-workshop-chat";
import { useWorkshopFlow } from "../../hooks/use-workshop-flow";
import { useWorkshopUndo } from "../../hooks/use-workshop-undo";
import { getSelectionLabel } from "../../lib/script-helpers";
import type { ProjectSettings, WorkshopState } from "../../project-types";
import { ChatBubble } from "../chat-bubble";
import { AudioPanel } from "./audio-panel";
import { OutlinePanel } from "./outline-panel";
import { PromptsPanel } from "./prompts-panel";
import { QuickActionChips } from "./quick-action-chips";
import { ShotsPanel } from "./shots-panel";
import { StageIndicator } from "./stage-indicator";
import { UndoToast } from "./undo-toast";
import { WorkshopBadges } from "./workshop-badges";
import {
	OutlinePanelSkeleton,
	PromptsPanelSkeleton,
	ShotsPanelSkeleton,
} from "./workshop-skeletons";
import { WorkshopEditSuggestion } from "./workshop-edit-suggestion";

interface ChatWorkshopProps {
	projectId: string;
	existingMessages: Message[];
	project: {
		workshop?: WorkshopState | null;
		settings?: ProjectSettings | null;
	};
	selectedItemIds: string[];
	onSelectedItemIdsChange: (ids: string[]) => void;
}

export function ChatWorkshop({
	projectId,
	existingMessages,
	project,
	selectedItemIds,
	onSelectedItemIdsChange,
}: ChatWorkshopProps) {
	// For backward compat with single-select code paths, use first selected
	const selectedItemId = selectedItemIds[0] ?? null;
	const flow = useWorkshopFlow({ projectId, project });
	const undo = useWorkshopUndo({
		projectId,
		onUndoComplete: () => {
			flow.refetch();
		},
	});
	const chat = useWorkshopChat({
		projectId,
		existingMessages,
		stage: flow.stage,
		selectedItemId,
		onEditApplied: (preState, editLabel) => {
			// Push to undo stack and refresh the flow data
			undo.pushSnapshot(preState, editLabel);
			flow.refetch();
		},
	});
	const review = useReviewMode({
		projectId,
		onFindingApplied: () => {
			// Refresh flow data after applying a finding
			flow.refetch();
		},
	});
	const audio = useWorkshopAudio({ projectId });

	// Handler for when user clicks a shot chip in review mode
	const handleReviewShotClick = useCallback(
		(shotId: string) => {
			// Find the shot index from the map and select it
			const idx = review.shotIndexById.get(shotId);
			if (idx !== undefined) {
				review.exitReview();
				onSelectedItemIdsChange([`shot-${idx}`]);
			}
		},
		[review, onSelectedItemIdsChange],
	);

	// Handler for applying a review finding
	const handleApplyFinding = useCallback(
		async (finding: import("../../lib/review-finding-types").ReviewFinding) => {
			const action = finding.suggestedAction;
			review.setApplyingFindingId(finding.id);

			try {
				if (action.type === "delete") {
					const idx = review.shotIndexById.get(action.shotId);
					if (idx === undefined) {
						throw new Error("Shot not found");
					}
					const result = await applyWorkshopEdit({
						data: {
							projectId,
							action: "delete_shot",
							index: idx,
							data: {},
							selectedItemId: `shot-${idx}`,
						},
					});
					undo.pushSnapshot(result.preState, `Shot ${idx + 1} deleted`);
					flow.refetch();
				} else if (action.type === "update") {
					const idx = review.shotIndexById.get(action.shotId);
					if (idx === undefined) {
						throw new Error("Shot not found");
					}
					if (action.suggestedDescription) {
						const result = await applyWorkshopEdit({
							data: {
								projectId,
								action: "manual_edit",
								index: idx,
								data: { description: action.suggestedDescription },
								selectedItemId: `shot-${idx}`,
							},
						});
						undo.pushSnapshot(result.preState, `Shot ${idx + 1} updated`);
						flow.refetch();
					}
				} else if (action.type === "merge") {
					// For merge, update the first shot with the merged description and delete the second
					const idxA = review.shotIndexById.get(action.shotIdA);
					const idxB = review.shotIndexById.get(action.shotIdB);
					if (idxA === undefined || idxB === undefined) {
						throw new Error("Shots not found");
					}
					// Update the first shot with the merged description
					if (action.suggestedDescription) {
						await applyWorkshopEdit({
							data: {
								projectId,
								action: "manual_edit",
								index: idxA,
								data: { description: action.suggestedDescription },
								selectedItemId: `shot-${idxA}`,
							},
						});
					}
					// Delete the second shot (note: index may have shifted if idxB > idxA)
					const adjustedIdxB = idxB > idxA ? idxB - 1 : idxB;
					const result = await applyWorkshopEdit({
						data: {
							projectId,
							action: "delete_shot",
							index: adjustedIdxB,
							data: {},
							selectedItemId: `shot-${adjustedIdxB}`,
						},
					});
					undo.pushSnapshot(result.preState, `Shots ${idxA + 1} & ${idxB + 1} merged`);
					flow.refetch();
				}

				review.markFindingApplied(finding.id);
			} catch (err) {
				console.error("Failed to apply finding:", err);
				chat.setError(err instanceof Error ? err.message : "Failed to apply finding");
			} finally {
				review.setApplyingFindingId(null);
			}
		},
		[projectId, review, undo, flow, chat],
	);

	const selectionLabel = useMemo(
		() => getSelectionLabel(selectedItemId, project.workshop ?? null),
		[selectedItemId, project.workshop],
	);

	const handleSend = useCallback(async () => {
		if (!chat.input.trim() || chat.isSending || flow.isGenerating) return;
		const userText = chat.input.trim();
		chat.clearInput();

		// Prepend a visible focus marker so both the user and the LLM see exactly
		// which item this message is about. Without this, the model tends to
		// drift back to whatever was being discussed earlier in a long session.
		const focusPrefix = selectionLabel
			? `[Editing ${
					selectionLabel.kind === "outline"
						? `beat ${selectionLabel.index + 1}`
						: selectionLabel.kind === "shot"
							? `shot ${selectionLabel.index + 1}`
							: `prompt for shot ${selectionLabel.index + 1}`
				}]`
			: null;
		const content = focusPrefix ? `${focusPrefix}\n\n${userText}` : userText;

		await chat.runChatMessage(content, selectedItemId);
	}, [chat, flow.isGenerating, selectedItemId, selectionLabel]);

	const handleSelectItem = useCallback(
		(id: string | null, event?: React.MouseEvent) => {
			if (id === null) {
				// Clear selection
				onSelectedItemIdsChange([]);
				return;
			}

			// Multi-select with cmd/ctrl key
			if (event && (event.metaKey || event.ctrlKey)) {
				if (selectedItemIds.includes(id)) {
					// Remove from selection
					onSelectedItemIdsChange(selectedItemIds.filter((i) => i !== id));
				} else {
					// Add to selection (only if same kind)
					const existingKind = selectedItemIds[0]?.match(/^(outline|shot|prompt)/)?.[1];
					const newKind = id.match(/^(outline|shot|prompt)/)?.[1];
					if (existingKind && existingKind !== newKind) {
						// Different kind - replace selection
						onSelectedItemIdsChange([id]);
					} else {
						onSelectedItemIdsChange([...selectedItemIds, id]);
					}
				}
			} else {
				// Single select (toggle)
				onSelectedItemIdsChange(
					selectedItemIds.length === 1 && selectedItemIds[0] === id ? [] : [id],
				);
			}

			requestAnimationFrame(() => chat.textareaRef.current?.focus());
		},
		[chat.textareaRef, onSelectedItemIdsChange, selectedItemIds],
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

	const handleInlineShotEdit = useCallback(
		async (shotIndex: number, newDescription: string) => {
			try {
				const result = await applyWorkshopEdit({
					data: {
						projectId,
						action: "manual_edit",
						index: shotIndex,
						data: { description: newDescription },
						selectedItemId,
					},
				});
				undo.pushSnapshot(result.preState, `Shot ${shotIndex + 1}`);
				flow.refetch();
			} catch (err) {
				console.error("Failed to save inline edit:", err);
				throw err; // Re-throw so the InlineEditField can handle it
			}
		},
		[projectId, selectedItemId, undo, flow],
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
							<GeneratingIndicator
								variant="inline"
								size="sm"
								showPhases={flow.isGenerating}
							/>
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

				{chat.pendingEdit && (
					<div className="px-5 py-3 border-t bg-card/50">
						<WorkshopEditSuggestion
							edit={chat.pendingEdit}
							workshop={project.workshop ?? null}
							onApply={() => void chat.handleApplyEdit()}
							onDismiss={chat.handleDismissEdit}
							isApplying={chat.isApplyingEdit}
						/>
					</div>
				)}

				<div className="px-5 py-4 border-t bg-card">
					{/* Undo toast - appears briefly after each edit */}
					<div className="mb-2">
						<UndoToast
							show={undo.showToast}
							isUndoing={undo.isUndoing}
							label={undo.lastEditLabel}
							onUndo={() => void undo.undo()}
							onDismiss={undo.dismissToast}
						/>
					</div>

					{/* Persistent undo button when stack is non-empty but toast is hidden */}
					{undo.canUndo && !undo.showToast && (
						<div className="mb-2">
							<Button
								size="xs"
								variant="ghost"
								onClick={() => void undo.undo()}
								disabled={undo.isUndoing}
								className="gap-1.5 text-muted-foreground hover:text-foreground"
							>
								<Undo2 size={14} />
								{undo.isUndoing ? "Undoing..." : `Undo${undo.undoDepth > 1 ? ` (${undo.undoDepth})` : ""}`}
							</Button>
						</div>
					)}

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
								onClick={() => onSelectedItemIdsChange([])}
								className="shrink-0 rounded p-1.5 text-muted-foreground/70 hover:bg-primary/10 hover:text-foreground"
								title="Clear selection"
								aria-label="Clear selection"
							>
								<X size={14} />
							</button>
						</div>
					)}
					{/* Quick action chips for the selected item */}
					<QuickActionChips
						selectionKind={selectionLabel?.kind ?? null}
						onSelectAction={(prompt) => {
							chat.setInput(prompt);
							// Auto-send after a short delay so user sees what was selected
							setTimeout(() => void handleSend(), 100);
						}}
						disabled={chat.isSending || flow.isGenerating}
					/>
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
				<WorkshopBadges
					settings={project.settings ?? null}
					shots={flow.shots}
				/>
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
								selectedItemIds={selectedItemIds}
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
								selectedItemIds={selectedItemIds}
								onSelectItem={handleSelectItem}
								isStale={flow.staleStages.includes("shots")}
								onRegenerate={() => void handleGenerateShotsWithReview()}
								onGeneratePrompts={() =>
									void handleGenerateWithChat(flow.handleGenerateImagePrompts, "Generating image prompts")
								}
								isGenerating={flow.isGenerating}
								onInlineEdit={handleInlineShotEdit}
								isReviewMode={review.isReviewMode}
								isReviewLoading={review.isLoading}
								reviewFindings={review.findings}
								reviewSummary={review.summary}
								shotIndexById={review.shotIndexById}
								onStartReview={review.startReview}
								onExitReview={review.exitReview}
								onReviewShotClick={handleReviewShotClick}
								onApplyFinding={(finding) => void handleApplyFinding(finding)}
								onDismissFinding={review.dismissFinding}
								applyingFindingId={review.applyingFindingId}
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
								selectedItemIds={selectedItemIds}
								onSelectItem={handleSelectItem}
								isStale={flow.staleStages.includes("prompts")}
								onRegenerate={() =>
									void handleGenerateWithChat(flow.handleGenerateImagePrompts, "Generating image prompts")
								}
							/>
						</div>
					)}

					{flow.stage === "audio" && (
						<div className="animate-fade-in-up">
							<AudioPanel
								shots={flow.shots}
								voices={audio.voices}
								isLoadingVoices={audio.isLoadingVoices}
								voicesError={audio.voicesError}
								selectedVoiceId={audio.selectedVoiceId}
								onSelectVoice={audio.setSelectedVoiceId}
								voiceovers={audio.voiceovers}
								isLoadingVoiceovers={audio.isLoadingVoiceovers}
								usage={audio.usage}
								isGenerating={audio.isGenerating}
								generationError={audio.generationError}
								onClearError={audio.clearGenerationError}
								onGenerateVoiceover={audio.handleGenerateVoiceover}
								playingAssetId={audio.playingAssetId}
								isPlaying={audio.isPlaying}
								onPlay={audio.handlePlay}
								onPause={audio.handlePause}
								onStop={audio.handleStop}
							/>
						</div>
					)}

				</div>
			</div>
		</div>
	);
}
