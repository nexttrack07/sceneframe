import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import type {
	IntakeAnswers,
	OutlineEntry,
	ProjectSettings,
	ScriptDraft,
	ShotDraftEntry,
	WorkshopStage,
} from "../project-types";
import { projectKeys } from "../query-keys";
import {
	approveWorkshop,
	generateImagePrompts,
	generateOutline,
	generateShots,
	reviewAndFixShots,
	setWorkshopStage,
} from "../workshop-mutations";

interface UseWorkshopFlowArgs {
	projectId: string;
	project: {
		scriptDraft?: ScriptDraft | null;
		settings?: ProjectSettings | null;
	};
}

export function useWorkshopFlow({ projectId, project }: UseWorkshopFlowArgs) {
	const queryClient = useQueryClient();
	const router = useRouter();

	const [isGenerating, setIsGenerating] = useState(false);
	const [generatingStage, setGeneratingStage] = useState<WorkshopStage | null>(null);
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

	const draft = project.scriptDraft ?? null;
	const stage: WorkshopStage = draft?.stage ?? "discovery";
	const outline: OutlineEntry[] | null = draft?.outline ?? null;
	const shots: ShotDraftEntry[] | null = draft?.shots ?? null;
	const imagePrompts: Array<{
		shotIndex: number;
		prompt: string;
	}> | null = draft?.imagePrompts ?? null;
	const staleStages: Array<"outline" | "shots" | "prompts"> =
		draft?.staleStages ?? [];
	const intake: IntakeAnswers | null =
		(project.settings as ProjectSettings | null | undefined)?.intake ?? null;

	const invalidateProject = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: projectKeys.project(projectId),
		});
	}, [projectId, queryClient]);

	const setStage = useCallback(
		async (nextStage: WorkshopStage) => {
			await setWorkshopStage({
				data: { projectId, stage: nextStage },
			});
			await invalidateProject();
		},
		[projectId, invalidateProject],
	);

	const handleGenerateOutline = useCallback(
		async (feedback?: string): Promise<string> => {
			setIsGenerating(true);
			setGeneratingStage("outline");
			try {
				const result = await generateOutline({
					data: { projectId, feedback },
				});
				await invalidateProject();
				return result.content;
			} finally {
				setIsGenerating(false);
				setGeneratingStage(null);
			}
		},
		[projectId, invalidateProject],
	);

	const handleGenerateShots = useCallback(
		async (feedback?: string): Promise<string> => {
			setIsGenerating(true);
			setGeneratingStage("shots");
			try {
				const result = await generateShots({
					data: { projectId, feedback },
				});
				await invalidateProject();
				return result.content;
			} finally {
				setIsGenerating(false);
				setGeneratingStage(null);
			}
		},
		[projectId, invalidateProject],
	);

	const handleReviewShots = useCallback(async (): Promise<string> => {
		setIsGenerating(true);
		try {
			const result = await reviewAndFixShots({
				data: { projectId },
			});
			await invalidateProject();
			return result.content;
		} finally {
			setIsGenerating(false);
		}
	}, [projectId, invalidateProject]);

	const handleGenerateImagePrompts =
		useCallback(async (): Promise<string> => {
			setIsGenerating(true);
			setGeneratingStage("prompts");
			try {
				const result = await generateImagePrompts({
					data: { projectId },
				});
				await invalidateProject();
				return result.content;
			} finally {
				setIsGenerating(false);
				setGeneratingStage(null);
			}
		}, [projectId, invalidateProject]);

	const handleApprove = useCallback(async (): Promise<void> => {
		if (!shots || shots.length === 0) {
			throw new Error("No shots to approve");
		}
		setIsGenerating(true);
		try {
			await approveWorkshop({
				data: {
					projectId,
					shots,
					imagePrompts: imagePrompts ?? undefined,
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			router.navigate({
				to: "/projects/$projectId",
				params: { projectId },
				search: {
					scene: undefined,
					shot: "first",
					from: undefined,
					to: undefined,
					mediaTab: undefined,
				},
			});
		} finally {
			setIsGenerating(false);
		}
	}, [projectId, shots, imagePrompts, queryClient, router]);

	return {
		stage,
		outline,
		shots,
		imagePrompts,
		staleStages,
		intake,
		setStage,
		selectedItemId,
		setSelectedItemId,
		handleGenerateOutline,
		handleGenerateShots,
		handleReviewShots,
		handleGenerateImagePrompts,
		handleApprove,
		isGenerating,
		generatingStage,
	};
}
