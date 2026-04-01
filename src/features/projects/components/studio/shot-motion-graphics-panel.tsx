import { Loader2, PanelsTopLeft, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
	MotionGraphicPreset,
	MotionGraphicSummary,
} from "../../project-types";

function MotionGraphicPreview({
	graphic,
	backgroundUrl,
}: {
	graphic: MotionGraphicSummary;
	backgroundUrl?: string | null;
}) {
	return (
		<div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-zinc-950">
			{backgroundUrl ? (
				<img
					src={backgroundUrl}
					alt=""
					className="absolute inset-0 h-full w-full object-cover opacity-45"
				/>
			) : (
				<div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
			)}
			<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
			{graphic.spec.items.map((item) => (
				<div
					key={item.id}
					className="absolute"
					style={{
						left: `${(item.left / 1920) * 100}%`,
						top: `${(item.top / 1080) * 100}%`,
						width: `${(item.width / 1920) * 100}%`,
						color: item.color,
						fontSize: `${Math.max(10, item.fontSize / 4)}px`,
						textAlign: item.align,
						fontWeight: item.role === "headline" ? 700 : 400,
						lineHeight: 1.1,
						textShadow: "0 2px 14px rgba(0,0,0,0.7)",
					}}
				>
					{item.text}
				</div>
			))}
		</div>
	);
}

export function ShotMotionGraphicsPanel({
	graphics,
	previewImageUrl,
	onGenerate,
	onImport,
	onDelete,
	isGeneratingPreset,
	importingGraphicId,
	deletingGraphicId,
}: {
	graphics: MotionGraphicSummary[];
	previewImageUrl?: string | null;
	onGenerate: (preset: MotionGraphicPreset) => void;
	onImport: (motionGraphicId: string) => void;
	onDelete: (motionGraphicId: string) => void;
	isGeneratingPreset: MotionGraphicPreset | null;
	importingGraphicId: string | null;
	deletingGraphicId: string | null;
}) {
	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<PanelsTopLeft size={14} className="text-muted-foreground" />
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Motion graphics
						</p>
					</div>
					<p className="text-xs text-muted-foreground">
						Generate ready-made overlay graphics for this shot, then send them
						into the editor as editable text layers.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						className="justify-start gap-2 h-auto py-3"
						onClick={() => onGenerate("lower_third")}
						disabled={isGeneratingPreset !== null}
					>
						{isGeneratingPreset === "lower_third" ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Plus size={14} />
						)}
						<div className="text-left">
							<div className="text-xs font-medium">Lower third</div>
							<div className="text-[10px] text-muted-foreground">
								Nameplate style overlay
							</div>
						</div>
					</Button>
					<Button
						type="button"
						variant="outline"
						className="justify-start gap-2 h-auto py-3"
						onClick={() => onGenerate("callout")}
						disabled={isGeneratingPreset !== null}
					>
						{isGeneratingPreset === "callout" ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Sparkles size={14} />
						)}
						<div className="text-left">
							<div className="text-xs font-medium">Callout</div>
							<div className="text-[10px] text-muted-foreground">
								Headline plus supporting copy
							</div>
						</div>
					</Button>
				</div>

				<div className="space-y-3">
					{graphics.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
							No motion graphics yet. Generate one from this shot to create a
							ready-made overlay pack.
						</div>
					) : (
						graphics.map((graphic) => (
							<div
								key={graphic.id}
								className="rounded-xl border bg-card/60 p-3 space-y-3"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<h4 className="text-sm font-medium truncate">
												{graphic.title}
											</h4>
											<Badge variant="outline" className="shrink-0 text-[10px]">
												{graphic.preset === "lower_third"
													? "Lower third"
													: "Callout"}
											</Badge>
										</div>
										<p className="mt-1 text-xs text-muted-foreground line-clamp-2">
											{graphic.sourceText}
										</p>
									</div>
								</div>

								<MotionGraphicPreview
									graphic={graphic}
									backgroundUrl={previewImageUrl}
								/>

								<div className="flex items-center gap-2">
									<Button
										type="button"
										size="sm"
										className="gap-2"
										onClick={() => onImport(graphic.id)}
										disabled={importingGraphicId === graphic.id}
									>
										{importingGraphicId === graphic.id ? (
											<Loader2 size={14} className="animate-spin" />
										) : (
											<PanelsTopLeft size={14} />
										)}
										Add to editor
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="gap-2"
										onClick={() => onDelete(graphic.id)}
										disabled={deletingGraphicId === graphic.id}
									>
										{deletingGraphicId === graphic.id ? (
											<Loader2 size={14} className="animate-spin" />
										) : (
											<Trash2 size={14} />
										)}
										Delete
									</Button>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
