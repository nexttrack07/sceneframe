import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export interface ModelPickerOption {
	id: string;
	label: string;
	provider: string;
	description: string;
	logoText: string;
	logoImageUrl?: string;
	previewImageUrl?: string;
	accentClassName?: string;
}

function PreviewMedia({ option }: { option: ModelPickerOption }) {
	if (option.previewImageUrl?.toLowerCase().endsWith(".mp4")) {
		return (
			<video
				src={option.previewImageUrl}
				autoPlay
				loop
				muted
				playsInline
				className="absolute inset-0 h-full w-full object-cover"
			/>
		);
	}

	if (option.previewImageUrl) {
		return (
			<img
				src={option.previewImageUrl}
				alt={option.label}
				className="absolute inset-0 h-full w-full object-cover"
			/>
		);
	}

	return (
		<div
			className={`absolute inset-0 ${
				option.accentClassName ??
				"bg-gradient-to-br from-foreground via-primary to-sky-300"
			}`}
		/>
	);
}

function ProviderLogo({
	option,
	compact = false,
}: {
	option: ModelPickerOption;
	compact?: boolean;
}) {
	if (option.logoImageUrl) {
		return (
			<img
				src={option.logoImageUrl}
				alt={`${option.provider} logo`}
				className={`rounded-full bg-card object-cover shadow-md ring-1 ring-border/50 ${
					compact ? "h-7 w-7" : "h-9 w-9"
				}`}
			/>
		);
	}

	return (
		<div
			className={`flex items-center justify-center rounded-full bg-card font-semibold text-foreground shadow-md ring-1 ring-border/50 ${
				compact ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]"
			}`}
		>
			{option.logoText}
		</div>
	);
}

function ModelPreview({
	option,
	selected = false,
}: {
	option: ModelPickerOption;
	selected?: boolean;
}) {
	return (
		<div
			className={`relative overflow-hidden rounded-2xl border transition-all ${
				selected
					? "border-primary shadow-[0_0_0_1px_rgba(0,0,0,0.04)]"
					: "border-border/70 hover:border-border"
			}`}
		>
			<div className="relative aspect-[16/10]">
				<PreviewMedia option={option} />
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.35),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(0,0,0,0.18),transparent_38%)]" />
				<div className="absolute top-3 left-3 flex items-center gap-2">
					<ProviderLogo option={option} />
					<div className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/90 backdrop-blur-sm ring-1 ring-border/30">
						{option.provider}
					</div>
				</div>
				{selected && (
					<div className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
						<Check size={15} />
					</div>
				)}
				<div className="absolute inset-x-0 bottom-0 p-4">
					<div className="rounded-xl bg-background/85 p-3 backdrop-blur-sm ring-1 ring-border/30">
						<p className="text-sm font-semibold leading-tight text-foreground">
							{option.label}
						</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							{option.description}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

export function ModelPickerModal({
	title,
	options,
	selectedId,
	onSelect,
	triggerLabel = "Select model",
	buttonClassName = "",
	gridClassName = "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
}: {
	title: string;
	options: readonly ModelPickerOption[];
	selectedId: string;
	onSelect: (id: string) => void;
	triggerLabel?: string;
	buttonClassName?: string;
	gridClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const selectedOption =
		options.find((option) => option.id === selectedId) ?? options[0];
	const filteredOptions = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return options;
		return options.filter((option) =>
			`${option.label} ${option.provider} ${option.description}`
				.toLowerCase()
				.includes(normalizedQuery),
		);
	}, [options, query]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={`w-full rounded-xl border border-border bg-background text-left transition-colors hover:border-border/90 hover:bg-accent/30 ${buttonClassName}`}
			>
				<div className="flex items-center gap-3 p-3">
					<div className="relative h-14 w-20 overflow-hidden rounded-lg">
						<PreviewMedia option={selectedOption} />
						<div className="absolute left-2 top-2">
							<ProviderLogo option={selectedOption} compact />
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
							{triggerLabel}
						</p>
						<p className="truncate text-sm font-semibold text-foreground">
							{selectedOption.label}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{selectedOption.description}
						</p>
					</div>
					<ChevronDown size={16} className="text-muted-foreground" />
				</div>
			</button>

			{open && (
				<div className="fixed inset-0 z-[70]">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismisses on click */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: close button provides keyboard-dismiss control */}
					<div
						className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
						onClick={() => setOpen(false)}
					/>
					<div className="absolute inset-0 flex items-center justify-center p-4">
						<div className="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
							<div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
								<div>
									<h3 className="text-lg font-semibold text-foreground">
										{title}
									</h3>
									<p className="text-sm text-muted-foreground">
										Choose a model from the available registry.
									</p>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									onClick={() => setOpen(false)}
								>
									<X size={16} />
								</Button>
							</div>

							<div className="border-b border-border/70 px-5 py-4">
								<div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
									<Search size={15} className="text-muted-foreground" />
									<input
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										placeholder="Search models"
										className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
									/>
								</div>
							</div>

							<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
								<div className={`grid gap-4 ${gridClassName}`}>
									{filteredOptions.map((option) => (
										<button
											key={option.id}
											type="button"
											onClick={() => {
												onSelect(option.id);
												setOpen(false);
											}}
											className="text-left"
										>
											<ModelPreview
												option={option}
												selected={option.id === selectedId}
											/>
										</button>
									))}
								</div>
								{filteredOptions.length === 0 && (
									<div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
										No models matched your search.
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
