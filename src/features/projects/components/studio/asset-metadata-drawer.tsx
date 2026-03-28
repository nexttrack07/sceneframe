import { Clock, Image as ImageIcon, Settings, Sparkles } from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { IMAGE_MODELS } from "@/features/projects/image-models";
import type { SceneAssetSummary } from "@/features/projects/project-types";

interface AssetMetadataDrawerProps {
	asset: SceneAssetSummary | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
}

function getModelLabel(modelId: string | null): string {
	if (!modelId) return "Unknown";
	const model = IMAGE_MODELS.find((m) => m.id === modelId);
	return model?.label ?? modelId.split("/").pop() ?? modelId;
}

function formatSettingValue(value: unknown): string {
	if (value === null || value === undefined) return "-";
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "number") return value.toString();
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.join(", ");
	return JSON.stringify(value);
}

function formatSettingKey(key: string): string {
	return key
		.replace(/([A-Z])/g, " $1")
		.replace(/_/g, " ")
		.replace(/^./, (s) => s.toUpperCase())
		.trim();
}

export function AssetMetadataDrawer({
	asset,
	open,
	onOpenChange,
}: AssetMetadataDrawerProps) {
	if (!asset) return null;

	const modelSettings = asset.modelSettings ?? {};
	const referenceImageUrls = (modelSettings.referenceImageUrls ??
		[]) as string[];

	// Filter out internal settings we don't want to display
	const displaySettings = Object.entries(modelSettings).filter(
		([key]) =>
			!["referenceImageUrls", "batchCount", "generationLane"].includes(key),
	);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
				<SheetHeader>
					<SheetTitle>Image Details</SheetTitle>
					<SheetDescription>Generation metadata and settings</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-6">
					{/* Preview */}
					{asset.url && (
						<div className="rounded-lg overflow-hidden border border-border">
							<img
								src={asset.url}
								alt="Generated asset preview"
								className="w-full h-auto"
							/>
						</div>
					)}

					{/* Model Info */}
					<div className="space-y-3">
						<h3 className="text-sm font-medium flex items-center gap-2">
							<Sparkles size={14} className="text-muted-foreground" />
							Model
						</h3>
						<div className="bg-muted/50 rounded-lg p-3">
							<p className="font-medium">{getModelLabel(asset.model)}</p>
							{asset.model && (
								<p className="text-xs text-muted-foreground mt-1">
									{asset.model}
								</p>
							)}
						</div>
					</div>

					{/* Generation Time */}
					{asset.generationDurationMs && (
						<div className="space-y-3">
							<h3 className="text-sm font-medium flex items-center gap-2">
								<Clock size={14} className="text-muted-foreground" />
								Generation Time
							</h3>
							<div className="bg-muted/50 rounded-lg p-3">
								<p className="font-medium">
									{formatDuration(asset.generationDurationMs)}
								</p>
							</div>
						</div>
					)}

					{/* Prompt */}
					{asset.prompt && (
						<div className="space-y-3">
							<h3 className="text-sm font-medium">Prompt</h3>
							<div className="bg-muted/50 rounded-lg p-3">
								<p className="text-sm whitespace-pre-wrap">{asset.prompt}</p>
							</div>
						</div>
					)}

					{/* Reference Images */}
					{referenceImageUrls.length > 0 && (
						<div className="space-y-3">
							<h3 className="text-sm font-medium flex items-center gap-2">
								<ImageIcon size={14} className="text-muted-foreground" />
								Reference Images ({referenceImageUrls.length})
							</h3>
							<div className="grid grid-cols-3 gap-2">
								{referenceImageUrls.map((url) => (
									<div
										key={url}
										className="aspect-square rounded-lg overflow-hidden border border-border"
									>
										<img
											src={url}
											alt="Reference"
											className="w-full h-full object-cover"
										/>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Model Settings */}
					{displaySettings.length > 0 && (
						<div className="space-y-3">
							<h3 className="text-sm font-medium flex items-center gap-2">
								<Settings size={14} className="text-muted-foreground" />
								Settings
							</h3>
							<div className="bg-muted/50 rounded-lg p-3 space-y-2">
								{displaySettings.map(([key, value]) => (
									<div
										key={key}
										className="flex items-start justify-between gap-4"
									>
										<span className="text-sm text-muted-foreground">
											{formatSettingKey(key)}
										</span>
										<span className="text-sm font-medium text-right">
											{formatSettingValue(value)}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Metadata */}
					<div className="space-y-3">
						<h3 className="text-sm font-medium text-muted-foreground">
							Metadata
						</h3>
						<div className="text-xs text-muted-foreground space-y-1">
							<p>ID: {asset.id}</p>
							<p>Created: {new Date(asset.createdAt).toLocaleString()}</p>
							{asset.batchId && <p>Batch: {asset.batchId}</p>}
						</div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
