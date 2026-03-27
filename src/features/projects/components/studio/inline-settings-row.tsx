import {
	getDefaultModelOptions,
	getImageModelControlDefinitions,
	IMAGE_MODELS,
} from "../../image-models";
import type { ImageDefaults, ImageSettingValue } from "../../project-types";
import { ModelPickerModal } from "../model-picker-modal";

function updateModelOption(
	settings: ImageDefaults,
	key: string,
	value: ImageSettingValue,
) {
	return {
		...settings,
		modelOptions: {
			...settings.modelOptions,
			[key]: value,
		},
	};
}

export function InlineSettingsRow({
	settings,
	onSettingsChange,
}: {
	settings: ImageDefaults;
	onSettingsChange: (settings: ImageDefaults) => void;
}) {
	const inputClass =
		"h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground";
	const controls = getImageModelControlDefinitions(settings.model);

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<span className="block text-[10px] text-muted-foreground">Model</span>
				<ModelPickerModal
					title="Choose An Image Model"
					triggerLabel="Image model"
					selectedId={settings.model}
					options={IMAGE_MODELS.map((model) => ({
						id: model.id,
						label: model.label,
						provider: model.provider,
						description: model.description,
						logoText: model.logoText,
						logoImageUrl: model.logoImageUrl,
						previewImageUrl: model.previewImageUrl,
						accentClassName: model.accentClassName,
					}))}
					onSelect={(modelId) =>
						onSettingsChange({
							...settings,
							model: modelId,
							modelOptions: getDefaultModelOptions(modelId),
						})
					}
				/>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<label className="text-[10px] text-muted-foreground space-y-1">
					<span className="block">Batch</span>
					<input
						type="number"
						min={1}
						max={4}
						value={settings.batchCount}
						onChange={(e) =>
							onSettingsChange({
								...settings,
								batchCount: Math.max(
									1,
									Math.min(4, Number(e.target.value) || 1),
								),
							})
						}
						className={inputClass}
					/>
				</label>
				{controls.map((control) => {
					const value = settings.modelOptions[control.key];

					if (control.type === "boolean") {
						return (
							<label
								key={control.key}
								className="rounded-md border border-border bg-background px-3 py-2 text-[10px] text-muted-foreground space-y-1"
							>
								<span className="block">{control.label}</span>
								<input
									type="checkbox"
									checked={Boolean(value)}
									onChange={(e) =>
										onSettingsChange(
											updateModelOption(
												settings,
												control.key,
												e.target.checked,
											),
										)
									}
									className="h-3.5 w-3.5 rounded border-border"
								/>
							</label>
						);
					}

					if (control.type === "number") {
						return (
							<label
								key={control.key}
								className="text-[10px] text-muted-foreground space-y-1"
							>
								<span className="block">{control.label}</span>
								<input
									type="number"
									min={control.min}
									max={control.max}
									value={typeof value === "number" ? value : ""}
									onChange={(e) =>
										onSettingsChange(
											updateModelOption(
												settings,
												control.key,
												Number(e.target.value) || 0,
											),
										)
									}
									className={inputClass}
								/>
							</label>
						);
					}

					return (
						<label
							key={control.key}
							className="text-[10px] text-muted-foreground space-y-1"
						>
							<span className="block">{control.label}</span>
							<select
								value={String(value ?? "")}
								onChange={(e) =>
									onSettingsChange(
										updateModelOption(settings, control.key, e.target.value),
									)
								}
								className={inputClass}
							>
								{control.options?.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
					);
				})}
			</div>

			<p className="text-[10px] text-muted-foreground/70 leading-relaxed">
				Settings are driven by the selected model schema. Adding a new model now
				only requires a schema file and a registry entry in{" "}
				<code>src/features/projects/image-models</code>.
			</p>
		</div>
	);
}
