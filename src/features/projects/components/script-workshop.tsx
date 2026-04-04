import { useRouter } from "@tanstack/react-router";
import {
	Film,
	Loader2,
	MessageSquare,
	Pencil,
	Send,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AlertDialog,
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
import type { Message, Scene, Shot } from "@/db/schema";
import {
	parseOpeningHook,
	parseQuickReplies,
	parseSceneProposal,
} from "../lib/script-helpers";
import {
	applyScriptEditDraft,
	approveScenes,
	generateOpeningHook,
	generateScenePlan,
	proposeScriptEdit,
	resetWorkshop,
	saveIntake,
	sendMessage,
} from "../project-mutations";
import type {
	IntakeAnswers,
	OpeningHookDraft,
	ProjectSettings,
	ScenePlanEntry,
	ScriptEditDraft,
	ScriptEditSelection,
} from "../project-types";
import { ChatBubble } from "./chat-bubble";
import { IntakeForm } from "./intake-form";

export function ScriptWorkshop({
	projectId,
	existingMessages,
	projectSettings,
	fallbackProposal,
	mode = "hook",
	rightPanel,
	editSelection,
	draft,
	onDraftChange,
	onDraftApproved,
	onDraftApplyStateChange,
	scenes = [],
	shots = [],
}: {
	projectId: string;
	existingMessages: Message[];
	projectSettings: ProjectSettings | null;
	fallbackProposal?: ScenePlanEntry[] | null;
	mode?: "hook" | "copilot";
	rightPanel?: React.ReactNode;
	editSelection?: ScriptEditSelection | null;
	draft?: ScriptEditDraft | null;
	onDraftChange?: (draft: ScriptEditDraft | null) => void;
	onDraftApproved?: (approved: {
		sceneIds: string[];
		shotIds: string[];
		draft: ScriptEditDraft;
	}) => void;
	onDraftApplyStateChange?: (
		pending: { sceneIds: string[]; shotIds: string[] } | null,
	) => void;
	scenes?: Pick<Scene, "id" | "title" | "order">[];
	shots?: Pick<Shot, "id" | "sceneId" | "order">[];
}) {
	const router = useRouter();
	const [chatMessages, setChatMessages] = useState<Message[]>(existingMessages);
	const [input, setInput] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [isApprovingProposal, setIsApprovingProposal] = useState(false);
	const [workshopStage, setWorkshopStage] = useState<"hook" | "scene-plan">(
		fallbackProposal?.length ? "scene-plan" : "hook",
	);
	const [selectedProposalScenes, setSelectedProposalScenes] = useState<
		number[]
	>(() =>
		(fallbackProposal ?? [])
			.map((scene, index) => scene.sceneNumber ?? index + 1)
			.filter((value) => Number.isFinite(value)),
	);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [openingHook, setOpeningHook] = useState<OpeningHookDraft | null>(
		projectSettings?.workshop?.openingHook ?? null,
	);

	const intake = projectSettings?.intake ?? null;
	const intakeComplete = Boolean(intake?.concept);
	const [showIntake, setShowIntake] = useState(!intakeComplete);

	useEffect(() => {
		setChatMessages(existingMessages);
	}, [existingMessages]);

	useEffect(() => {
		setOpeningHook(projectSettings?.workshop?.openingHook ?? null);
	}, [projectSettings]);

	useEffect(() => {
		if (chatMessages.length > 0) {
			scrollRef.current?.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [chatMessages.length]);

	const fallbackOpeningHook = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			if (chatMessages[i].role === "assistant") {
				const parsed = parseOpeningHook(chatMessages[i].content);
				if (parsed) return parsed;
			}
		}
		return null;
	}, [chatMessages]);
	const effectiveOpeningHook = openingHook ?? fallbackOpeningHook;

	const lastProposal = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			if (chatMessages[i].role === "assistant") {
				const parsed = parseSceneProposal(chatMessages[i].content);
				if (parsed && parsed.length >= 1) return parsed;
			}
		}
		return null;
	}, [chatMessages]);
	const effectiveProposal = lastProposal ?? fallbackProposal ?? null;

	useEffect(() => {
		if (effectiveProposal) {
			setWorkshopStage("scene-plan");
			setSelectedProposalScenes((current) => {
				const nextSceneNumbers = effectiveProposal
					.map((scene, index) => scene.sceneNumber ?? index + 1)
					.filter((value) => Number.isFinite(value));
				const nextSet = new Set(nextSceneNumbers);
				const retained = current.filter((sceneNumber) =>
					nextSet.has(sceneNumber),
				);
				return retained.length > 0 ? retained : nextSceneNumbers;
			});
		}
	}, [effectiveProposal]);

	const shouldExpandToScenePlan = useCallback(
		(content: string) => {
			if (!effectiveOpeningHook || effectiveProposal) return false;
			const normalized = content.toLowerCase();
			return [
				"looks good",
				"good",
				"next scene",
				"rest of the script",
				"expand",
				"continue",
				"go from there",
				"scene plan",
				"scene breakdown",
			].some((phrase) => normalized.includes(phrase));
		},
		[effectiveOpeningHook, effectiveProposal],
	);

	const quickReplies = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			if (chatMessages[i].role === "assistant") {
				return parseQuickReplies(chatMessages[i].content);
			}
		}
		return null;
	}, [chatMessages]);

	const hasEditSelection = Boolean(
		editSelection?.project ||
			editSelection?.sceneIds.length ||
			editSelection?.shotIds.length,
	);
	const editSelectionLabel = editSelection?.project
		? "Entire project"
		: hasEditSelection
			? [
					editSelection?.sceneIds.length
						? `${editSelection.sceneIds.length} scene${editSelection.sceneIds.length === 1 ? "" : "s"}`
						: null,
					editSelection?.shotIds.length
						? `${editSelection.shotIds.length} shot${editSelection.shotIds.length === 1 ? "" : "s"}`
						: null,
				]
					.filter(Boolean)
					.join(" + ")
			: null;
	const sceneById = useMemo(
		() => new Map(scenes.map((scene) => [scene.id, scene])),
		[scenes],
	);
	const shotById = useMemo(
		() => new Map(shots.map((shot) => [shot.id, shot])),
		[shots],
	);

	const runChatMessage = useCallback(
		async (content: string) => {
			const trimmed = content.trim();
			const tempId = crypto.randomUUID();
			const userMsg: Message = {
				id: tempId,
				projectId,
				role: "user",
				content: trimmed,
				createdAt: new Date(),
			};
			setChatMessages((prev) => [...prev, userMsg]);
			setIsSending(true);
			setError(null);

			try {
				const result = await sendMessage({
					data: { projectId, content: trimmed },
				});
				setChatMessages((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						projectId,
						role: "assistant",
						content: result.content,
						createdAt: new Date(),
					},
				]);
			} catch (err) {
				setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
				setError(err instanceof Error ? err.message : "Failed to send message");
			} finally {
				setIsSending(false);
			}
		},
		[projectId],
	);

	const runHookGeneration = useCallback(
		async (feedback?: string) => {
			const trimmed = feedback?.trim();
			const tempId = crypto.randomUUID();

			if (trimmed) {
				const userMsg: Message = {
					id: tempId,
					projectId,
					role: "user",
					content: trimmed,
					createdAt: new Date(),
				};
				setChatMessages((prev) => [...prev, userMsg]);
			}

			setIsSending(true);
			setError(null);

			try {
				const result = await generateOpeningHook({
					data: { projectId, feedback: trimmed },
				});
				setOpeningHook(result.openingHook);
				setChatMessages((prev) => [
					...(trimmed ? prev : prev.filter((msg) => msg.role !== "assistant")),
					{
						id: crypto.randomUUID(),
						projectId,
						role: "assistant",
						content: result.assistantContent,
						createdAt: new Date(),
					},
				]);
			} catch (err) {
				if (trimmed) {
					setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
				}
				setError(
					err instanceof Error
						? err.message
						: "Failed to generate the opening hook",
				);
			} finally {
				setIsSending(false);
			}
		},
		[projectId],
	);

	const runScenePlanGeneration = useCallback(
		async (feedback?: string) => {
			const trimmed = feedback?.trim();
			const selectedSceneContext =
				effectiveProposal && selectedProposalScenes.length > 0
					? `Selected scenes to revise: ${selectedProposalScenes
							.slice()
							.sort((a, b) => a - b)
							.map((sceneNumber) => `Scene ${sceneNumber}`)
							.join(", ")}.\n\n`
					: "";
			const scopedFeedback = trimmed
				? `${selectedSceneContext}${trimmed}`.trim()
				: selectedSceneContext.trim() || undefined;
			const tempId = crypto.randomUUID();

			if (effectiveProposal && selectedProposalScenes.length === 0) {
				setError("Select at least one scene to revise.");
				return;
			}

			if (trimmed) {
				const userMsg: Message = {
					id: tempId,
					projectId,
					role: "user",
					content: trimmed,
					createdAt: new Date(),
				};
				setChatMessages((prev) => [...prev, userMsg]);
			}

			setWorkshopStage("scene-plan");
			setIsSending(true);
			setError(null);

			try {
				const result = await generateScenePlan({
					data: { projectId, feedback: scopedFeedback },
				});
				setChatMessages((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						projectId,
						role: "assistant",
						content: result.content,
						createdAt: new Date(),
					},
				]);
			} catch (err) {
				if (trimmed) {
					setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
				}
				setError(
					err instanceof Error
						? err.message
						: "Failed to generate the scene plan",
				);
				if (!effectiveProposal) {
					setWorkshopStage("hook");
				}
			} finally {
				setIsSending(false);
			}
		},
		[effectiveProposal, projectId, selectedProposalScenes],
	);

	async function handleSend() {
		if (!input.trim() || isSending) return;
		const content = input.trim();
		setInput("");
		if (mode === "copilot") {
			if (!hasEditSelection || !editSelection) return;
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
				const result = await proposeScriptEdit({
					data: { projectId, scope: editSelection, instructions: content },
				});
				onDraftChange?.(result);
				setChatMessages((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						projectId,
						role: "assistant",
						content: `Prepared a draft edit for ${editSelectionLabel?.toLowerCase() ?? "the selected scope"}. Review the preview below, then approve it when you're ready.`,
						createdAt: new Date(),
					},
				]);
			} catch (err) {
				setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
				setError(
					err instanceof Error ? err.message : "Failed to prepare edit draft",
				);
			} finally {
				setIsSending(false);
			}
			return;
		}
		if (
			workshopStage === "scene-plan" ||
			effectiveProposal ||
			shouldExpandToScenePlan(content)
		) {
			await runScenePlanGeneration(content);
			return;
		}
		await runHookGeneration(content);
	}

	const handleIntakeComplete = useCallback(
		async (nextIntake: IntakeAnswers) => {
			setError(null);
			try {
				await saveIntake({ data: { projectId, intake: nextIntake } });
				setShowIntake(false);
				if (mode === "copilot") {
					await runChatMessage(
						"Creative brief saved. Help me refine the script for this project.",
					);
				} else {
					await runHookGeneration();
				}
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to generate opening hook",
				);
			}
		},
		[mode, projectId, runChatMessage, runHookGeneration],
	);

	async function handleEditBrief() {
		setError(null);
		try {
			await resetWorkshop({ data: projectId });
			setChatMessages([]);
			setOpeningHook(null);
			setWorkshopStage("hook");
			setSelectedProposalScenes([]);
			setShowIntake(true);
			await router.invalidate();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to restart the workshop",
			);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
	}

	async function handleApproveDraft() {
		if (!draft || isSending) return;
		setIsSending(true);
		setError(null);
		try {
			onDraftApplyStateChange?.({
				sceneIds: draft.sceneUpdates.map((update) => update.sceneId),
				shotIds: draft.shotUpdates.map((update) => update.shotId),
			});
			await applyScriptEditDraft({ data: { projectId, draft } });
			onDraftApproved?.({
				sceneIds: draft.sceneUpdates.map((update) => update.sceneId),
				shotIds: draft.shotUpdates.map((update) => update.shotId),
				draft,
			});
			onDraftChange?.(null);
			setChatMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					projectId,
					role: "assistant",
					content:
						"Approved. The selected edits are now applied to the project.",
					createdAt: new Date(),
				},
			]);
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to apply draft");
		} finally {
			onDraftApplyStateChange?.(null);
			setIsSending(false);
		}
	}

	async function handleApproveProposal() {
		if (!effectiveProposal || isSending || isApprovingProposal) return;
		setIsApprovingProposal(true);
		setError(null);
		try {
			await approveScenes({
				data: {
					projectId,
					parsedScenes: effectiveProposal,
					targetDurationSec: intake?.targetDurationSec,
				},
			});
			await router.invalidate();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to approve scene plan",
			);
		} finally {
			setIsApprovingProposal(false);
		}
	}

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			<div className="w-[34%] min-w-[360px] max-w-[480px] border-r bg-card flex flex-col min-h-0 overflow-hidden">
				{intakeComplete && (
					<div className="px-5 py-3 border-b bg-card flex items-center justify-between">
						<div className="flex items-center gap-2 flex-wrap">
							<p className="text-xs text-muted-foreground">
								{mode === "copilot" ? "Project Copilot" : "Script Workshop"}
							</p>
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
									Edit brief
								</button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Re-do Creative Brief?</AlertDialogTitle>
									<AlertDialogDescription>
										This clears the workshop state so you can start fresh with a
										new brief.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<Button
										onClick={handleEditBrief}
										className="bg-destructive hover:bg-destructive/90"
									>
										Reset &amp; re-do
									</Button>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				)}

				{showIntake ? (
					<div className="flex-1 overflow-y-auto">
						<IntakeForm
							onComplete={handleIntakeComplete}
							error={error}
							onDismissError={() => setError(null)}
						/>
					</div>
				) : (
					<>
						<div
							ref={scrollRef}
							className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
						>
							{chatMessages.length === 0 && (
								<div className="rounded-xl border bg-background px-4 py-4">
									<div className="flex items-center gap-2 mb-2 text-foreground">
										<MessageSquare size={15} />
										<p className="text-sm font-medium">
											{mode === "copilot"
												? "Use chat while you edit"
												: "Refine the opening hook"}
										</p>
									</div>
									<p className="text-sm text-muted-foreground leading-relaxed">
										{mode === "copilot"
											? "Keep the storyboard open on the right and use this chat to ask for script revisions, scene changes, or shot adjustments."
											: "The opening hook is generated on the right. Use this chat to push it in a better direction before we expand into the rest of the script."}
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

						{quickReplies && !isSending && (
							<div className="px-5 py-2 flex flex-wrap gap-2 border-t bg-card/50">
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

						<div className="px-5 py-4 border-t bg-card">
							{mode === "copilot" && (
								<div className="mb-3 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
									{hasEditSelection ? (
										<div>
											<span>
												Editing scope:{" "}
												<strong className="text-foreground">
													{editSelectionLabel}
												</strong>
											</span>
											{draft && (
												<p className="mt-1 text-[11px] text-muted-foreground">
													A draft preview is ready below.
												</p>
											)}
										</div>
									) : (
										<div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
											<p className="font-medium text-foreground mb-1">
												Select something to edit
											</p>
											<p>
												Choose the project, one or more scenes, or specific
												shots on the right. Then this chat will unlock for
												editing.
											</p>
										</div>
									)}
								</div>
							)}
							{mode === "copilot" && draft && (
								<div className="mb-3 rounded-xl border bg-background p-3 space-y-3">
									<div className="flex items-center justify-between gap-3">
										<div>
											<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												Edit Preview
											</p>
											<p className="text-sm text-foreground">{draft.summary}</p>
										</div>
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												variant="outline"
												className="h-8 px-3 text-xs"
												onClick={() => onDraftChange?.(null)}
											>
												Reject
											</Button>
											<Button
												size="sm"
												className="h-8 px-3 text-xs"
												onClick={() => void handleApproveDraft()}
												disabled={isSending}
											>
												Approve
											</Button>
										</div>
									</div>
									<div className="space-y-2 max-h-64 overflow-y-auto pr-1">
										{draft.sceneUpdates.map((update) => {
											const scene = sceneById.get(update.sceneId);
											return (
												<div
													key={update.sceneId}
													className="rounded-lg border border-border bg-muted/30 p-3"
												>
													<p className="text-xs font-medium text-muted-foreground mb-1">
														{scene
															? `Scene ${scene.order}${scene.title ? `: ${scene.title}` : ""}`
															: "Scene"}
													</p>
													<p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
														{update.description}
													</p>
												</div>
											);
										})}
										{draft.shotUpdates.map((update) => {
											const shot = shotById.get(update.shotId);
											const scene = shot ? sceneById.get(shot.sceneId) : null;
											return (
												<div
													key={update.shotId}
													className="rounded-lg border border-border bg-muted/30 p-3"
												>
													<p className="text-xs font-medium text-muted-foreground mb-1">
														{shot
															? `Shot ${shot.order}${scene ? ` · Scene ${scene.order}` : ""}`
															: "Shot"}
													</p>
													<p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
														{update.description}
													</p>
												</div>
											);
										})}
									</div>
								</div>
							)}
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
									placeholder={
										mode === "copilot"
											? "Ask to edit the script, scenes, or shots..."
											: effectiveOpeningHook && !effectiveProposal
												? "Refine the hook, or ask to expand into the full scene plan..."
												: "Tell me how to refine the opening hook..."
									}
									rows={2}
									className="resize-none flex-1"
									disabled={
										isSending || (mode === "copilot" && !hasEditSelection)
									}
								/>
								<Button
									size="icon"
									onClick={() => void handleSend()}
									disabled={
										!input.trim() ||
										isSending ||
										(mode === "copilot" && !hasEditSelection)
									}
									className="shrink-0 self-end"
								>
									<Send size={16} />
								</Button>
							</div>
						</div>
					</>
				)}
			</div>

			<div className="flex-1 min-h-0 bg-muted/20 overflow-hidden">
				{rightPanel ? (
					<div className="h-full min-h-0 overflow-hidden">{rightPanel}</div>
				) : (
					<div className="h-full overflow-y-auto px-8 py-8">
						{showIntake ? (
							<div className="h-full rounded-2xl border border-dashed border-border/70 bg-background/70" />
						) : isSending && !effectiveOpeningHook ? (
							<div className="h-full rounded-2xl border bg-background flex items-center justify-center">
								<div className="text-center space-y-3">
									<Loader2
										size={26}
										className="animate-spin text-muted-foreground mx-auto"
									/>
									<p className="text-sm text-muted-foreground">
										Drafting the opening hook...
									</p>
								</div>
							</div>
						) : effectiveProposal ? (
							<div className="max-w-4xl space-y-5">
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Film size={15} />
									<span>Scene Plan</span>
								</div>
								<div className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-5 py-4 shadow-sm">
									<div>
										<p className="text-sm font-medium text-foreground">
											Review the generated scenes
										</p>
										<p className="text-sm text-muted-foreground">
											Approve when this breakdown is ready to become your
											storyboard.
										</p>
									</div>
									<Button
										onClick={() => void handleApproveProposal()}
										disabled={isApprovingProposal}
									>
										{isApprovingProposal ? (
											<Loader2 size={14} className="mr-2 animate-spin" />
										) : null}
										Approve scene plan
									</Button>
								</div>
								{effectiveProposal.map((scene, i) => (
									<label
										key={`${scene.title}-${scene.description.slice(0, 30)}`}
										className="flex gap-3 bg-background border rounded-xl p-4 cursor-pointer"
									>
										<input
											type="checkbox"
											checked={selectedProposalScenes.includes(
												scene.sceneNumber ?? i + 1,
											)}
											onChange={() => {
												const sceneNumber = scene.sceneNumber ?? i + 1;
												setSelectedProposalScenes((current) =>
													current.includes(sceneNumber)
														? current.filter((value) => value !== sceneNumber)
														: [...current, sceneNumber],
												);
											}}
											className="mt-1 h-4 w-4 shrink-0 accent-primary"
										/>
										<div className="min-w-0">
											<p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
												Scene {scene.sceneNumber ?? i + 1}
												{scene.title ? `: ${scene.title}` : ""}
											</p>
											<p className="text-sm text-foreground leading-relaxed">
												{scene.description}
											</p>
										</div>
									</label>
								))}
							</div>
						) : effectiveOpeningHook ? (
							<div className="max-w-4xl space-y-5">
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Sparkles size={15} />
									<span>Opening Hook</span>
								</div>
								<div className="rounded-2xl border bg-background shadow-sm">
									<div className="px-6 py-5 border-b">
										<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
											Internal label
										</p>
										<h2 className="text-2xl font-semibold text-foreground">
											{effectiveOpeningHook.headline}
										</h2>
									</div>
									<div className="grid md:grid-cols-2">
										<div className="px-6 py-5 border-b md:border-b-0 md:border-r">
											<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
												Narration / on-screen hook
											</p>
											<p className="text-base leading-7 text-foreground whitespace-pre-wrap">
												{effectiveOpeningHook.narration}
											</p>
										</div>
										<div className="px-6 py-5">
											<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
												Visual direction
											</p>
											<p className="text-base leading-7 text-foreground whitespace-pre-wrap">
												{effectiveOpeningHook.visualDirection}
											</p>
										</div>
									</div>
								</div>
								<div className="rounded-2xl border bg-background px-5 py-4 shadow-sm flex items-center justify-between gap-4">
									<p className="text-sm text-muted-foreground leading-relaxed">
										If this hook is working, generate the rest of the scene plan
										next.
									</p>
									<Button
										type="button"
										variant="outline"
										onClick={() =>
											void runScenePlanGeneration(
												"The opening hook looks good. Please expand it into a full scene-by-scene breakdown now.",
											)
										}
										disabled={isSending}
									>
										Generate scene plan
									</Button>
								</div>
							</div>
						) : (
							<div className="h-full rounded-2xl border border-dashed border-border/70 bg-background/70 flex items-center justify-center">
								<div className="text-center max-w-md px-6">
									<p className="text-sm font-medium text-foreground mb-2">
										Your script workspace will appear here
									</p>
									<p className="text-sm text-muted-foreground leading-relaxed">
										The workshop starts by drafting the opening hook here
										instead of inside the chat. From there we can keep refining
										it.
									</p>
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
