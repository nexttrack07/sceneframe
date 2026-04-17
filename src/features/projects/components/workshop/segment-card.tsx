/**
 * SegmentCard Component
 *
 * Displays a single audio segment with script preview/editor,
 * audio player, and generation controls.
 */

import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Edit3,
	Loader2,
	Pause,
	Play,
	RefreshCw,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SegmentWithShots } from "@/features/audio";
import type { Shot } from "@/db/schema";
import type { TriggerRunUiStatus } from "@/features/projects/project-types";

interface SegmentCardProps {
	segment: SegmentWithShots;
	segmentIndex: number;
	totalSegments: number;
	allShots: Shot[];
	isGenerating: boolean;
	runStatus?: TriggerRunUiStatus;
	isEditing: boolean;
	editingScript: string;
	playingSegmentId: string | null;
	isPlaying: boolean;
	currentTimeMs: number;
	totalDurationMs: number;
	onStartEdit: () => void;
	onCancelEdit: () => void;
	onSaveScript: (script: string) => void;
	onSetEditingScript: (script: string) => void;
	onAutoGenerateScript: () => void;
	onGenerateAudio: () => void;
	onUpdateShotRange: (startShotId: string, endShotId: string) => void;
	onDelete: () => void;
	onPlay: (url: string) => void;
	onPause: () => void;
}

export function SegmentCard({
	segment,
	segmentIndex,
	totalSegments,
	allShots,
	isGenerating,
	runStatus,
	isEditing,
	editingScript,
	playingSegmentId,
	isPlaying,
	currentTimeMs,
	totalDurationMs,
	onStartEdit,
	onCancelEdit,
	onSaveScript,
	onSetEditingScript,
	onAutoGenerateScript,
	onGenerateAudio,
	onUpdateShotRange,
	onDelete,
	onPlay,
	onPause,
}: SegmentCardProps) {
	const [showShotRange, setShowShotRange] = useState(false);
	const [pendingStartShotId, setPendingStartShotId] = useState(
		segment.startShotId,
	);
	const [pendingEndShotId, setPendingEndShotId] = useState(segment.endShotId);

	const isCurrentlyPlaying = playingSegmentId === segment.id && isPlaying;

	// Find shot indices for display
	const startShotIndex =
		allShots.findIndex((s) => s.id === segment.startShotId) + 1;
	const endShotIndex =
		allShots.findIndex((s) => s.id === segment.endShotId) + 1;

	const formatDuration = (sec: number | null) => {
		if (!sec) return "--:--";
		const mins = Math.floor(sec / 60);
		const secs = sec % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const formatMs = (ms: number) => {
		const seconds = Math.floor(ms / 1000);
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const handleApplyShotRange = () => {
		onUpdateShotRange(pendingStartShotId, pendingEndShotId);
		setShowShotRange(false);
	};

	const getStatusBadge = () => {
		switch (segment.status) {
			case "generating":
				return (
					<span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
						<Loader2 size={10} className="animate-spin" />
						Generating
					</span>
				);
			case "done":
				return (
					<span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-xs">
						Ready
					</span>
				);
			case "error":
				return (
					<span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs">
						<AlertTriangle size={10} />
						Error
					</span>
				);
			default:
				return (
					<span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
						Draft
					</span>
				);
		}
	};

	return (
		<div
			className={`rounded-xl border bg-card overflow-hidden ${
				segment.status === "done"
					? "border-green-500/20"
					: segment.status === "error"
						? "border-destructive/20"
						: ""
			}`}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
				<div className="flex items-center gap-3">
					<span className="text-sm font-semibold text-foreground">
						Segment {segmentIndex + 1}
						<span className="text-muted-foreground font-normal">
							{" "}
							of {totalSegments}
						</span>
					</span>
					{getStatusBadge()}
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>
						Shots {startShotIndex}-{endShotIndex}
					</span>
					<span>~{formatDuration(segment.targetDurationSec)} sec</span>
				</div>
			</div>

			{/* Content */}
			<div className="p-4 space-y-4">
				{/* Audio Player - Show when done */}
				{segment.status === "done" && segment.voiceoverAsset?.url && (
					<div className="flex items-center gap-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
						<button
							type="button"
							onClick={() =>
								isCurrentlyPlaying
									? onPause()
									: onPlay(segment.voiceoverAsset!.url!)
							}
							className="shrink-0 w-12 h-12 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all shadow-md hover:scale-105"
						>
							{isCurrentlyPlaying ? (
								<Pause size={20} className="text-primary-foreground" />
							) : (
								<Play size={20} className="text-primary-foreground ml-0.5" />
							)}
						</button>
						<div className="flex-1">
							<p className="font-display text-lg font-semibold tabular-nums">
								{isCurrentlyPlaying ? (
									<>
										{formatMs(currentTimeMs)}
										<span className="text-muted-foreground mx-1">/</span>
										{formatMs(
											totalDurationMs || segment.voiceoverAsset.durationMs || 0,
										)}
									</>
								) : (
									formatMs(segment.voiceoverAsset.durationMs || 0)
								)}
							</p>
						</div>
					</div>
				)}

				{/* Generating indicator */}
				{segment.status === "generating" && (
					<div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
						<Loader2 size={20} className="animate-spin text-primary" />
						<span className="text-sm text-muted-foreground">
							Creating voiceover...
						</span>
					</div>
				)}

				{/* Error message */}
				{segment.status === "error" && segment.errorMessage && (
					<div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
						<AlertTriangle size={16} className="text-destructive shrink-0" />
						<span className="text-sm text-destructive">
							{segment.errorMessage}
						</span>
					</div>
				)}

				{/* Script Section */}
				{isEditing ? (
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium text-foreground">
								Edit Script
							</span>
							<Button
								size="sm"
								variant="ghost"
								onClick={onAutoGenerateScript}
								disabled={isGenerating}
								className="gap-1 text-xs h-7"
							>
								<RefreshCw size={12} />
								Auto-generate
							</Button>
						</div>
						<Textarea
							value={editingScript}
							onChange={(e) => onSetEditingScript(e.target.value)}
							rows={6}
							className="resize-none text-sm"
							placeholder="Enter voiceover script for this segment..."
						/>
						<div className="flex items-center justify-between">
							<span
								className={`text-xs ${editingScript.length > 5000 ? "text-destructive" : "text-muted-foreground"}`}
							>
								{editingScript.length.toLocaleString()} / 5,000 chars
							</span>
							<div className="flex gap-2">
								<Button size="sm" variant="ghost" onClick={onCancelEdit}>
									Cancel
								</Button>
								<Button
									size="sm"
									onClick={() => onSaveScript(editingScript)}
									disabled={!editingScript.trim()}
								>
									Save
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div className="space-y-2">
						{segment.script ? (
							<p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
								{segment.script}
							</p>
						) : (
							<p className="text-sm text-muted-foreground/50 italic">
								No script yet. Click "Edit Script" to add one, or generate from
								shot descriptions.
							</p>
						)}
					</div>
				)}

				{/* Shot Range Adjustment */}
				{showShotRange && (
					<div className="p-3 rounded-lg border bg-muted/30 space-y-3">
						<p className="text-sm font-medium">Adjust Shot Range</p>
						<div className="flex items-center gap-3">
							<label className="flex-1">
								<span className="text-xs text-muted-foreground">Start</span>
								<select
									value={pendingStartShotId}
									onChange={(e) => setPendingStartShotId(e.target.value)}
									className="w-full mt-1 px-2 py-1.5 rounded border bg-background text-sm"
								>
									{allShots.map((shot, idx) => (
										<option key={shot.id} value={shot.id}>
											Shot {idx + 1}
										</option>
									))}
								</select>
							</label>
							<label className="flex-1">
								<span className="text-xs text-muted-foreground">End</span>
								<select
									value={pendingEndShotId}
									onChange={(e) => setPendingEndShotId(e.target.value)}
									className="w-full mt-1 px-2 py-1.5 rounded border bg-background text-sm"
								>
									{allShots.map((shot, idx) => (
										<option key={shot.id} value={shot.id}>
											Shot {idx + 1}
										</option>
									))}
								</select>
							</label>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setShowShotRange(false)}
							>
								Cancel
							</Button>
							<Button size="sm" onClick={handleApplyShotRange}>
								Apply
							</Button>
						</div>
					</div>
				)}

				{/* Actions */}
				{!isEditing && (
					<div className="flex items-center justify-between pt-2 border-t">
						<div className="flex items-center gap-1">
							<Button
								size="sm"
								variant="ghost"
								onClick={onStartEdit}
								className="gap-1 text-xs h-8"
							>
								<Edit3 size={12} />
								Edit Script
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setPendingStartShotId(segment.startShotId);
									setPendingEndShotId(segment.endShotId);
									setShowShotRange(!showShotRange);
								}}
								className="gap-1 text-xs h-8"
							>
								{showShotRange ? (
									<ChevronUp size={12} />
								) : (
									<ChevronDown size={12} />
								)}
								Shots {startShotIndex}-{endShotIndex}
							</Button>
							{totalSegments > 1 && (
								<Button
									size="sm"
									variant="ghost"
									onClick={onDelete}
									className="gap-1 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
								>
									<Trash2 size={12} />
								</Button>
							)}
						</div>
						<Button
							size="sm"
							variant={segment.status === "done" ? "outline" : "accent"}
							onClick={onGenerateAudio}
							disabled={isGenerating || !segment.script?.trim()}
							className="gap-1"
						>
							{isGenerating ? (
								<Loader2 size={12} className="animate-spin" />
							) : (
								<Sparkles size={12} />
							)}
							{isGenerating
								? runStatus === "queued"
									? "Queued..."
									: "Generating..."
								: segment.status === "done"
									? "Regenerate"
									: "Generate"}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
