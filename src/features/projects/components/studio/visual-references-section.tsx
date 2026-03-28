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
			<div
				onDrop={handleDrop}
				onDragOver={handleDragOver}
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
				<div className="flex items-center gap-3 p-3">
					{/* Thumbnail previews */}
					{referenceUrls.length > 0 && (
						<div className="flex gap-1.5">
							{referenceUrls.map((url) => (
								<div key={url} className="relative group/thumb">
									<img
										src={url}
										alt="Reference"
										className="w-10 h-10 rounded object-cover"
									/>
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onRemove(url);
										}}
										className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
									>
										<X size={10} />
									</button>
								</div>
							))}
						</div>
					)}

					{/* Add button / info */}
					<div className="flex-1 flex items-center gap-2 min-w-0">
						{isUploading ? (
							<>
								<Loader2 size={16} className="animate-spin text-primary" />
								<span className="text-xs text-muted-foreground">
									Uploading...
								</span>
							</>
						) : canAddMore ? (
							<>
								<ImagePlus size={16} className="text-muted-foreground" />
								<div className="min-w-0">
									<p className="text-xs font-medium text-foreground/80">
										Add visual references
									</p>
									<p className="text-[10px] text-muted-foreground truncate">
										JPEG/PNG/WebP/GIF, {MAX_SIZE_MB}MB max
									</p>
								</div>
							</>
						) : (
							<p className="text-xs text-muted-foreground">
								Maximum references reached
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
