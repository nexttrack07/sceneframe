import type React from "react";
import { memo, useCallback } from "react";
import type { TextAnimationPreset } from "../../items/text/text-item-type";
import { Slider } from "../../slider";
import { changeItem } from "../../state/actions/change-item";
import { useWriteContext } from "../../utils/use-context";
import { InspectorSubLabel } from "../components/inspector-label";

const ANIMATION_OPTIONS: Array<{
	label: string;
	value: TextAnimationPreset;
}> = [
	{ label: "Fade", value: "fade" },
	{ label: "Slide Up", value: "slide-up" },
	{ label: "Slide Left", value: "slide-left" },
	{ label: "Pop", value: "pop" },
];

const TextAnimationControlsUnmemoized: React.FC<{
	itemId: string;
	enterAnimation: TextAnimationPreset;
	enterAnimationDurationInSeconds: number;
	exitAnimation: TextAnimationPreset;
	exitAnimationDurationInSeconds: number;
}> = ({
	itemId,
	enterAnimation,
	enterAnimationDurationInSeconds,
	exitAnimation,
	exitAnimationDurationInSeconds,
}) => {
	const { setState } = useWriteContext();

	const setEnterAnimation = useCallback(
		(newAnimation: TextAnimationPreset) => {
			setState({
				update: (state) =>
					changeItem(state, itemId, (item) => {
						if (item.type !== "text") {
							throw new Error(
								"Text animation can only be changed for text items",
							);
						}

						if (item.enterAnimation === newAnimation) {
							return item;
						}

						return {
							...item,
							enterAnimation: newAnimation,
						};
					}),
				commitToUndoStack: true,
			});
		},
		[itemId, setState],
	);

	const setExitAnimation = useCallback(
		(newAnimation: TextAnimationPreset) => {
			setState({
				update: (state) =>
					changeItem(state, itemId, (item) => {
						if (item.type !== "text") {
							throw new Error(
								"Text animation can only be changed for text items",
							);
						}

						if (item.exitAnimation === newAnimation) {
							return item;
						}

						return {
							...item,
							exitAnimation: newAnimation,
						};
					}),
				commitToUndoStack: true,
			});
		},
		[itemId, setState],
	);

	const setEnterAnimationDuration = useCallback(
		(newDuration: number, commitToUndoStack: boolean) => {
			setState({
				update: (state) =>
					changeItem(state, itemId, (item) => {
						if (item.type !== "text") {
							throw new Error(
								"Text animation can only be changed for text items",
							);
						}

						if (item.enterAnimationDurationInSeconds === newDuration) {
							return item;
						}

						return {
							...item,
							enterAnimationDurationInSeconds: newDuration,
						};
					}),
				commitToUndoStack,
			});
		},
		[itemId, setState],
	);

	const setExitAnimationDuration = useCallback(
		(newDuration: number, commitToUndoStack: boolean) => {
			setState({
				update: (state) =>
					changeItem(state, itemId, (item) => {
						if (item.type !== "text") {
							throw new Error(
								"Text animation can only be changed for text items",
							);
						}

						if (item.exitAnimationDurationInSeconds === newDuration) {
							return item;
						}

						return {
							...item,
							exitAnimationDurationInSeconds: newDuration,
						};
					}),
				commitToUndoStack,
			});
		},
		[itemId, setState],
	);

	return (
		<div className="space-y-4">
			<div>
				<InspectorSubLabel>Enter Animation</InspectorSubLabel>
				<div className="editor-starter-field">
					<select
						value={enterAnimation}
						onChange={(event) =>
							setEnterAnimation(event.target.value as TextAnimationPreset)
						}
						className="editor-starter-focus-ring h-8 w-full bg-transparent px-2 text-sm text-white outline-none"
						aria-label="Text enter animation"
					>
						{ANIMATION_OPTIONS.map((option) => (
							<option
								key={option.value}
								value={option.value}
								className="bg-neutral-950 text-white"
							>
								{option.label}
							</option>
						))}
					</select>
				</div>
			</div>
			<div>
				<InspectorSubLabel>Enter Duration</InspectorSubLabel>
				<div className="flex w-full items-center gap-3">
					<Slider
						value={enterAnimationDurationInSeconds}
						onValueChange={setEnterAnimationDuration}
						min={0}
						max={2}
						step={0.05}
						className="flex-1"
						title={`Enter duration: ${enterAnimationDurationInSeconds.toFixed(2)}s`}
					/>
					<div className="min-w-[50px] text-right text-xs text-white/75">
						{enterAnimationDurationInSeconds.toFixed(2)}s
					</div>
				</div>
			</div>
			<div>
				<InspectorSubLabel>Exit Animation</InspectorSubLabel>
				<div className="editor-starter-field">
					<select
						value={exitAnimation}
						onChange={(event) =>
							setExitAnimation(event.target.value as TextAnimationPreset)
						}
						className="editor-starter-focus-ring h-8 w-full bg-transparent px-2 text-sm text-white outline-none"
						aria-label="Text exit animation"
					>
						{ANIMATION_OPTIONS.map((option) => (
							<option
								key={option.value}
								value={option.value}
								className="bg-neutral-950 text-white"
							>
								{option.label}
							</option>
						))}
					</select>
				</div>
			</div>
			<div>
				<InspectorSubLabel>Exit Duration</InspectorSubLabel>
				<div className="flex w-full items-center gap-3">
					<Slider
						value={exitAnimationDurationInSeconds}
						onValueChange={setExitAnimationDuration}
						min={0}
						max={2}
						step={0.05}
						className="flex-1"
						title={`Exit duration: ${exitAnimationDurationInSeconds.toFixed(2)}s`}
					/>
					<div className="min-w-[50px] text-right text-xs text-white/75">
						{exitAnimationDurationInSeconds.toFixed(2)}s
					</div>
				</div>
			</div>
		</div>
	);
};

export const TextAnimationControls = memo(TextAnimationControlsUnmemoized);
