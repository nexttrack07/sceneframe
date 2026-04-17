import { ImagePlus, Loader2, X } from "lucide-react";
import { useCallback, useRef } from "react";

const MAX_REFERENCES = 4;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_MB = 20;

interface VisualReferencesSectionProps {
	referenceUrls: string[];
	isUploading: boolean;
	onUpload: (file: File) => void;
	onRemove: (url: string) => void;
}

export function VisualReferencesSection({
	referenceUrls,
	isUploading,
	onUpload,
	onRemove,
}: VisualReferencesSectionProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = useCallback(
		(files: FileList | null) => {
			if (!files || files.length === 0) return;

			const file = files[0];

			// Validate type
			if (!ACCEPTED_TYPES.includes(file.type)) {
				alert("Please select a JPEG, PNG, WebP, or GIF image.");
				return;
			}

			// Validate size
			if (file.size > MAX_SIZE_MB * 1024 * 1024) {
				alert(`File size must be under ${MAX_SIZE_MB}MB.`);
				return;
			}

			onUpload(file);

			// Reset input
			if (inputRef.current) {
				inputRef.current.value = "";
			}
		},
		[onUpload],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			handleFileSelect(e.dataTransfer.files);
		},
		[handleFileSelect],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const canAddMore = referenceUrls.length < MAX_REFERENCES && !isUploading;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
					Visual references
				</p>
				<span className="text-[10px] text-muted-foreground">
					{referenceUrls.length}/{MAX_REFERENCES}
				</span>
			</div>

			{/* Upload area */}
			<button
				type="button"
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onKeyDown={(e) => {
					if (!canAddMore) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						inputRef.current?.click();
					}
				}}
				disabled={!canAddMore}
				className={`relative rounded-lg border-2 border-dashed transition-colors ${
					canAddMore
						? "border-border/60 hover:border-border hover:bg-muted/30 cursor-pointer"
						: "border-border/30 bg-muted/10 cursor-not-allowed"
				}`}
			>
				<input
					ref={inputRef}
					type="file"
					accept={ACCEPTED_TYPES.join(",")}
					onChange={(e) => handleFileSelect(e.target.files)}
					disabled={!canAddMore}
					className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
				/>
				<div className="space-y-3 p-3">
					<div className="flex items-center gap-2">
						<div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background">
							{isUploading ? (
								<Loader2 size={16} className="animate-spin text-primary" />
							) : (
								<ImagePlus size={16} className="text-muted-foreground" />
							)}
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-xs font-medium text-foreground">
								{isUploading
									? "Uploading reference image..."
									: canAddMore
										? "Add reference images"
										: "Reference images added"}
							</p>
							<p className="text-[10px] text-muted-foreground">
								{canAddMore
									? `JPEG/PNG/WebP/GIF, ${MAX_SIZE_MB}MB max`
									: "Maximum references reached"}
							</p>
						</div>
					</div>

					{referenceUrls.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{referenceUrls.map((url) => (
								<div key={url} className="relative group/thumb">
									<img
										src={url}
										alt="Reference"
										className="h-11 w-11 rounded-md object-cover ring-1 ring-border/60"
									/>
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onRemove(url);
										}}
										className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive p-1 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
									>
										<X size={12} />
									</button>
								</div>
							))}
						</div>
					) : null}
				</div>
			</button>
		</div>
	);
}
