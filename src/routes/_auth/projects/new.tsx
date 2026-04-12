import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/index";
import { projects } from "@/db/schema";
import type {
	IntakeAnswers,
	ProjectSettings,
} from "@/features/projects/project-types";

interface CreateProjectInput {
	name: string;
	targetDurationSec?: number;
	style?: string[];
	mood?: string[];
	setting?: string[];
}

const DURATION_PRESETS: { label: string; value: number }[] = [
	{ label: "15s", value: 15 },
	{ label: "30s", value: 30 },
	{ label: "1min", value: 60 },
	{ label: "2min", value: 120 },
	{ label: "5min", value: 300 },
	{ label: "10min", value: 600 },
	{ label: "15min", value: 900 },
	{ label: "20min", value: 1200 },
	{ label: "30min", value: 1800 },
];

const STYLE_OPTIONS: string[] = [
	"Photorealistic cinematic",
	"Documentary naturalism",
	"Studio Ghibli-inspired animation",
	"Anime",
	"Painterly 2D cartoon",
	"Stylized 3D animation",
	"Clean motion graphics",
	"Graphic novel illustration",
	"Retro film / VHS",
];

const MOOD_OPTIONS: string[] = [
	"Mysterious",
	"Energetic",
	"Contemplative",
	"Dramatic",
	"Playful",
	"Dark",
	"Uplifting",
	"Nostalgic",
	"Tense",
	"Serene",
	"Epic",
	"Whimsical",
	"Melancholic",
	"Gritty",
	"Dreamy",
];

const SETTING_OPTIONS: string[] = [
	"Urban cityscape",
	"Underwater world",
	"Outer space",
	"Dense forest",
	"Desert landscape",
	"Snowy mountains",
	"Futuristic city",
	"Medieval village",
	"Tropical island",
	"Underground cavern",
	"Suburban neighborhood",
	"Industrial warehouse",
	"Abstract void",
	"Countryside fields",
	"Neon-lit streets",
	"Ancient ruins",
	"Floating islands",
	"Cozy interior",
];

const createProject = createServerFn({ method: "POST" })
	.inputValidator((data: CreateProjectInput) => data)
	.handler(async ({ data }) => {
		const { userId } = await auth();
		if (!userId) throw new Error("Unauthenticated");

		const { name, targetDurationSec, style, mood, setting } = data;
		if (!name.trim()) throw new Error("Project name is required");

		const intake: Partial<IntakeAnswers> = {};
		if (targetDurationSec) intake.targetDurationSec = targetDurationSec;
		if (style?.length) intake.style = style;
		if (mood?.length) intake.mood = mood;
		if (setting?.length) intake.setting = setting;

		const settings: ProjectSettings | null =
			Object.keys(intake).length > 0 ? { intake } : null;

		const [project] = await db
			.insert(projects)
			.values({
				userId,
				name: name.trim(),
				directorPrompt: "",
				scriptStatus: "idle",
				settings,
			})
			.returning({ id: projects.id });

		if (!project) throw new Error("Failed to create project");

		return { projectId: project.id };
	});

export const Route = createFileRoute("/_auth/projects/new")({
	component: NewProjectPage,
});

function ChipButton({
	label,
	isActive,
	onClick,
}: {
	label: string;
	isActive: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`border-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
				isActive
					? "border-primary bg-primary/10 text-primary"
					: "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
			}`}
		>
			{label}
		</button>
	);
}

function NewProjectPage() {
	const navigate = useNavigate();
	const nameId = useId();

	const [name, setName] = useState("");
	const [targetDurationSec, setTargetDurationSec] = useState<number | null>(
		null,
	);
	const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
	const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
	const [selectedSettings, setSelectedSettings] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	function toggleChip(
		value: string,
		setter: React.Dispatch<React.SetStateAction<string[]>>,
	) {
		setter((prev) =>
			prev.includes(value)
				? prev.filter((v) => v !== value)
				: [...prev, value],
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setIsPending(true);
		try {
			const { projectId } = await createProject({
				data: {
					name,
					...(targetDurationSec !== null && { targetDurationSec }),
					...(selectedStyles.length > 0 && { style: selectedStyles }),
					...(selectedMoods.length > 0 && { mood: selectedMoods }),
					...(selectedSettings.length > 0 && { setting: selectedSettings }),
				},
			});
			navigate({
				to: "/projects/$projectId",
				params: { projectId },
				search: {
					scene: undefined,
					shot: undefined,
					from: undefined,
					to: undefined,
					mediaTab: undefined,
				},
			});
		} catch (err: unknown) {
			if (err instanceof Error) setError(err.message);
		} finally {
			setIsPending(false);
		}
	}

	return (
		<div className="max-w-2xl mx-auto px-6 py-8">
			<Link
				to="/dashboard"
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
			>
				<ArrowLeft size={15} />
				Back to projects
			</Link>

			<div className="mb-8">
				<h1 className="text-2xl font-bold text-foreground">New Project</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Give your project a name and optional creative direction. You'll
					refine the concept in Script Chat.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-8">
				<div className="space-y-2">
					<Label htmlFor={nameId}>
						Project name <span className="text-destructive">*</span>
					</Label>
					<Input
						id={nameId}
						placeholder="e.g. Tokyo Night Drive"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						autoFocus
					/>
				</div>

				<div className="space-y-3">
					<Label>Duration</Label>
					<div className="flex flex-wrap gap-2">
						{DURATION_PRESETS.map((preset) => (
							<ChipButton
								key={preset.value}
								label={preset.label}
								isActive={targetDurationSec === preset.value}
								onClick={() =>
									setTargetDurationSec((prev) =>
										prev === preset.value ? null : preset.value,
									)
								}
							/>
						))}
					</div>
				</div>

				<div className="space-y-3">
					<Label>Visual style</Label>
					<div className="flex flex-wrap gap-2">
						{STYLE_OPTIONS.map((style) => (
							<ChipButton
								key={style}
								label={style}
								isActive={selectedStyles.includes(style)}
								onClick={() => toggleChip(style, setSelectedStyles)}
							/>
						))}
					</div>
				</div>

				<div className="space-y-3">
					<Label>Mood / tone</Label>
					<div className="flex flex-wrap gap-2">
						{MOOD_OPTIONS.map((mood) => (
							<ChipButton
								key={mood}
								label={mood}
								isActive={selectedMoods.includes(mood)}
								onClick={() => toggleChip(mood, setSelectedMoods)}
							/>
						))}
					</div>
				</div>

				<div className="space-y-3">
					<Label>Setting</Label>
					<div className="flex flex-wrap gap-2">
						{SETTING_OPTIONS.map((setting) => (
							<ChipButton
								key={setting}
								label={setting}
								isActive={selectedSettings.includes(setting)}
								onClick={() => toggleChip(setting, setSelectedSettings)}
							/>
						))}
					</div>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<div className="flex items-center gap-3 pt-2">
					<Button type="submit" disabled={isPending}>
						{isPending ? "Creating…" : "Create project"}
					</Button>
					<Button type="button" variant="ghost" asChild>
						<Link to="/dashboard">Cancel</Link>
					</Button>
				</div>
			</form>
		</div>
	);
}
