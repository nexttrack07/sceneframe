import { ArrowLeft, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { IntakeAnswers } from "../project-types";

const DURATION_PRESETS = [
	{ label: "15s", seconds: 15 },
	{ label: "30s", seconds: 30 },
	{ label: "1 min", seconds: 60 },
	{ label: "2 min", seconds: 120 },
	{ label: "5 min", seconds: 300 },
	{ label: "10 min", seconds: 600 },
	{ label: "15 min", seconds: 900 },
	{ label: "20 min", seconds: 1200 },
	{ label: "30 min", seconds: 1800 },
] as const;

const VISUAL_STYLE_OPTIONS = [
	"Photorealistic cinematic",
	"Documentary naturalism",
	"Studio Ghibli-inspired animation",
	"Anime",
	"Painterly 2D cartoon",
	"Stylized 3D animation",
	"Clean motion graphics",
	"Graphic novel illustration",
	"Retro film / VHS",
] as const;

const AUDIO_MODE_OPTIONS = [
	"Narration + background music",
	"Narration only",
	"Background music only",
	"No narration or music",
] as const;

function deriveLengthLabel(seconds: number): string {
	if (seconds <= 20) return "15 seconds";
	if (seconds <= 45) return "30 seconds";
	if (seconds < 90) return "1 minute";
	if (seconds < 180) return "2 minutes";
	if (seconds < 420) return "5 minutes";
	if (seconds < 660) return "8 minutes";
	if (seconds < 900) return "10 minutes";
	if (seconds < 1200) return "15 minutes";
	if (seconds < 1800) return "20 minutes";
	return "30+ minutes";
}

const PRESET_DEFAULTS: Record<
	string,
	{ targetDurationSec: number; style: string[]; mood: string[] }
> = {
	Shorts: {
		targetDurationSec: 30,
		style: ["Social / UGC-style"],
		mood: ["Energetic"],
	},
	"Long-form": {
		targetDurationSec: 600,
		style: ["Documentary"],
		mood: ["Calm / meditative"],
	},
	"Talking-head": {
		targetDurationSec: 180,
		style: ["Commercial / polished"],
		mood: ["Uplifting"],
	},
	Faceless: {
		targetDurationSec: 60,
		style: ["Animation / motion graphics"],
		mood: ["Mysterious"],
	},
	Tutorial: {
		targetDurationSec: 300,
		style: ["Documentary"],
		mood: ["Inspirational"],
	},
};

const STEPS = [
	{
		key: "channelPreset" as const,
		question: "What type of channel/video format is this?",
		subtitle: "Choose a preset to speed up the rest of the brief.",
		type: "single" as const,
		options: ["Shorts", "Long-form", "Talking-head", "Faceless", "Tutorial"],
	},
	{
		key: "targetDurationSec" as const,
		question: "How long should the video be?",
		subtitle:
			"Pick a preset or enter a custom duration. This determines how many shots will be planned.",
		type: "duration" as const,
		options: [],
	},
	{
		key: "style" as const,
		question: "What visual style should this video use?",
		subtitle:
			"This choice will be carried into every scene, image prompt, and video prompt.",
		type: "single" as const,
		options: VISUAL_STYLE_OPTIONS,
	},
	{
		key: "audioMode" as const,
		question: "What audio format should this video have?",
		subtitle:
			"This will guide whether scenes include narration, music cues, both, or stay silent.",
		type: "single" as const,
		options: AUDIO_MODE_OPTIONS,
	},
	{
		key: "concept" as const,
		question: "Describe your video idea",
		subtitle: "The more detail the better — we'll refine it together.",
		type: "text" as const,
		options: [],
	},
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const TOTAL_STEPS = STEPS.length;

interface IntakeFormProps {
	onComplete: (intake: IntakeAnswers) => Promise<void>;
	error: string | null;
	onDismissError: () => void;
}

export function IntakeForm({
	onComplete,
	error,
	onDismissError,
}: IntakeFormProps) {
	const [currentStep, setCurrentStep] = useState(0);
	const [answers, setAnswers] = useState<Partial<IntakeAnswers>>({
		channelPreset: "",
		purpose: "",
		targetDurationSec: 300,
		style: [],
		mood: [],
		setting: [],
		audioMode: "",
		audience: "",
		viewerAction: "",
		workingTitle: "",
		thumbnailPromise: "",
		concept: "",
		length: "",
	});
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const step = STEPS[currentStep];
	const progress = ((currentStep + 1) / TOTAL_STEPS) * 100;

	const advanceStep = useCallback(() => {
		if (currentStep >= TOTAL_STEPS - 1) return;
		setIsTransitioning(true);
		setTimeout(() => {
			setCurrentStep((s) => s + 1);
			setIsTransitioning(false);
		}, 200);
	}, [currentStep]);

	function handleSingleSelect(value: string) {
		setAnswers((prev) => {
			if (step.key === "channelPreset") {
				const preset = PRESET_DEFAULTS[value];
				return {
					...prev,
					channelPreset: value,
					targetDurationSec:
						preset?.targetDurationSec ?? prev.targetDurationSec ?? 300,
					style: preset?.style ?? prev.style ?? [],
					mood: preset?.mood ?? prev.mood ?? [],
				};
			}
			if (step.key === "style") {
				return { ...prev, style: [value] };
			}
			return { ...prev, [step.key]: value };
		});
		setTimeout(advanceStep, 300);
	}

	function handleTextChange(value: string) {
		setAnswers((prev) => ({ ...prev, [step.key]: value }));
	}

	async function handleContinue() {
		if (isSubmitting) return;
		if (currentStep < TOTAL_STEPS - 1) {
			advanceStep();
		} else {
			setIsSubmitting(true);
			try {
				const durationSec = answers.targetDurationSec ?? 300;
				await onComplete({
					channelPreset: answers.channelPreset ?? "",
					purpose: answers.purpose ?? "",
					length: deriveLengthLabel(durationSec),
					targetDurationSec: durationSec,
					style: answers.style ?? [],
					mood: answers.mood ?? [],
					setting: answers.setting ?? [],
					audioMode: answers.audioMode ?? "",
					audience: answers.audience ?? "",
					viewerAction: answers.viewerAction ?? "",
					workingTitle: answers.workingTitle ?? "",
					thumbnailPromise: answers.thumbnailPromise ?? "",
					concept: answers.concept ?? "",
				});
			} finally {
				setIsSubmitting(false);
			}
		}
	}

	function handleBack() {
		if (currentStep <= 0) return;
		setIsTransitioning(true);
		setTimeout(() => {
			setCurrentStep((s) => s - 1);
			setIsTransitioning(false);
		}, 200);
	}

	const canContinue = isStepValid(step.key, answers);

	return (
		<div className="flex-1 flex flex-col min-h-0">
			{/* Progress bar */}
			<div className="h-1 bg-muted shrink-0">
				<div
					className="h-full bg-primary transition-all duration-500 ease-out"
					style={{ width: `${progress}%` }}
				/>
			</div>

			{/* Question area */}
			<div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto">
				<div
					className={`w-full max-w-lg transition-all duration-200 ${
						isTransitioning
							? "opacity-0 translate-y-4"
							: "opacity-100 translate-y-0"
					}`}
				>
					{error && (
						<div className="flex items-center gap-2 mb-4 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
							<span className="flex-1">{error}</span>
							<button
								type="button"
								onClick={onDismissError}
								className="text-destructive/50 hover:text-destructive"
							>
								✕
							</button>
						</div>
					)}

					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
						Step {currentStep + 1} of {TOTAL_STEPS}
					</p>
					<h2 className="text-2xl font-bold text-foreground mb-1">
						{step.question}
					</h2>
					<p className="text-sm text-muted-foreground mb-8">{step.subtitle}</p>

					{step.type === "single" && (
						<SingleSelect
							options={step.options}
							selected={
								step.key === "style"
									? (answers.style?.[0] ?? "")
									: ((answers[step.key] as string) ?? "")
							}
							onSelect={handleSingleSelect}
						/>
					)}

					{step.type === "text" && (
						<div className="space-y-2">
							<Textarea
								value={(answers[step.key] as string) ?? ""}
								onChange={(e) => handleTextChange(e.target.value)}
								placeholder="A cinematic tour of Tokyo's neon-lit streets at night..."
								rows={4}
								className={`resize-none text-base ${
									(answers.concept?.length ?? 0) > 0 && (answers.concept?.length ?? 0) < 10
										? "border-warning focus-visible:ring-warning"
										: ""
								}`}
								autoFocus
							/>
							<div className="flex items-center justify-between text-xs">
								<span className={`${
									(answers.concept?.length ?? 0) > 0 && (answers.concept?.length ?? 0) < 10
										? "text-warning"
										: "text-muted-foreground"
								}`}>
									{(answers.concept?.length ?? 0) < 10
										? `${10 - (answers.concept?.length ?? 0)} more characters needed`
										: "Looking good!"}
								</span>
								<span className="text-muted-foreground font-mono">
									{answers.concept?.length ?? 0}
								</span>
							</div>
						</div>
					)}

					{step.type === "duration" && (
						<DurationInput
							value={answers.targetDurationSec ?? 300}
							onChange={(val) =>
								setAnswers((prev) => ({ ...prev, targetDurationSec: val }))
							}
						/>
					)}

					{/* Continue button for multi-select and text steps */}
					{step.type !== "single" && (
						<Button
							onClick={handleContinue}
							disabled={!canContinue || isSubmitting}
							className="mt-6 w-full bg-primary hover:bg-primary/90"
						>
							{isSubmitting ? (
								<>
									<Loader2 size={14} className="animate-spin mr-1.5" />
									Starting workshop…
								</>
							) : currentStep === TOTAL_STEPS - 1 ? (
								"Start workshop"
							) : (
								"Continue"
							)}
						</Button>
					)}

					{/* Back nav */}
					{currentStep > 0 && !isSubmitting && (
						<button
							type="button"
							onClick={handleBack}
							className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
						>
							<ArrowLeft size={14} />
							Back
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function isStepValid(key: StepKey, answers: Partial<IntakeAnswers>): boolean {
	if (key === "targetDurationSec") {
		const val = answers.targetDurationSec;
		return typeof val === "number" && val >= 15 && val <= 3600;
	}
	if (key === "concept") {
		const val = answers.concept;
		return typeof val === "string" && val.trim().length >= 10;
	}
	if (key === "channelPreset") {
		const val = answers.channelPreset;
		return typeof val === "string" && val.length > 0;
	}
	if (key === "style") {
		return Array.isArray(answers.style) && answers.style.length > 0;
	}
	if (key === "audioMode") {
		const val = answers.audioMode;
		return typeof val === "string" && val.length > 0;
	}
	return false;
}

function DurationInput({
	value,
	onChange,
}: {
	value: number;
	onChange: (val: number) => void;
}) {
	const shotCount = Math.ceil(value / 5);
	const displayMinutes = +(value / 60).toFixed(2);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-3 gap-2">
				{DURATION_PRESETS.map((preset) => (
					<button
						key={preset.seconds}
						type="button"
						onClick={() => onChange(preset.seconds)}
						className={`text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
							value === preset.seconds
								? "border-primary bg-primary/10 text-primary"
								: "border-border bg-card text-foreground hover:border-primary/40"
						}`}
					>
						{preset.label}
					</button>
				))}
			</div>
			<div className="space-y-2">
				<p className="text-xs text-muted-foreground">Custom duration</p>
				<div className="flex items-center gap-3">
					<Input
						type="number"
						min={0.25}
						max={60}
						step={0.5}
						value={displayMinutes}
						onChange={(e) => {
							const mins = parseFloat(e.target.value);
							if (!Number.isNaN(mins) && mins > 0) {
								onChange(Math.round(Math.min(3600, Math.max(15, mins * 60))));
							}
						}}
						className="text-base"
					/>
					<span className="text-sm text-muted-foreground whitespace-nowrap">
						minutes
					</span>
				</div>
			</div>
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					~{shotCount} shot{shotCount !== 1 ? "s" : ""} at 5s each
				</p>
				{(value < 15 || value > 3600) && (
					<p className="text-xs text-warning">
						{value < 15 ? "Minimum 15 seconds" : "Maximum 60 minutes"}
					</p>
				)}
			</div>
		</div>
	);
}

function SingleSelect({
	options,
	selected,
	onSelect,
}: {
	options: readonly string[];
	selected: string;
	onSelect: (value: string) => void;
}) {
	return (
		<div className="grid gap-2">
			{options.map((opt) => (
				<button
					key={opt}
					type="button"
					onClick={() => onSelect(opt)}
					className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
						selected === opt
							? "border-primary bg-primary/10 text-primary"
							: "border-border bg-card text-foreground hover:border-primary/40"
					}`}
				>
					{opt}
				</button>
			))}
		</div>
	);
}
