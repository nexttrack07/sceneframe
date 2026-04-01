import { useContext, useMemo } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
	TextItemEditingContext,
	TextItemHoverPreviewContext,
} from "../../context-provider";
import { FEATURE_TEXT_BACKGROUND_CONTROL } from "../../flags";
import { turnFontStyleIntoCss } from "../../inspector/controls/font-style-controls/font-style-controls";
import { FontInfoContext } from "../../utils/text/font-info";
import { useLoadFontFromTextItem } from "../../utils/text/load-font-from-text-item";
import {
	calculateFadeInOpacity,
	calculateFadeOutOpacity,
} from "../video/calculate-fade";
import { overrideTextItemWithHoverPreview } from "./override-text-item-with-hover-preview";
import { RoundedTextBox } from "./rounded-text-box";
import { CanvasTextEditor } from "./text-editor";
import type { TextAnimationPreset, TextItem } from "./text-item-type";

const DEFAULT_ENTER_ANIMATION_DURATION_IN_SECONDS = 0.4;
const DEFAULT_EXIT_ANIMATION_DURATION_IN_SECONDS = 0.4;

const getAnimationStyles = ({
	currentFrame,
	fps,
	animation,
	animationDurationInSeconds,
	direction,
}: {
	currentFrame: number;
	fps: number;
	animation: TextAnimationPreset;
	animationDurationInSeconds: number;
	direction: "enter" | "exit";
}) => {
	const durationInFrames = Math.max(1, animationDurationInSeconds * fps);
	const normalizedProgress = interpolate(
		currentFrame,
		[0, durationInFrames],
		[0, 1],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
	);
	const motionProgress =
		direction === "enter" ? normalizedProgress : 1 - normalizedProgress;

	switch (animation) {
		case "slide-up":
			return {
				translateX: 0,
				translateY: interpolate(motionProgress, [0, 1], [28, 0]),
				scale: 1,
				opacityMultiplier:
					direction === "enter" ? normalizedProgress : 1 - normalizedProgress,
			};
		case "slide-left":
			return {
				translateX: interpolate(motionProgress, [0, 1], [-36, 0]),
				translateY: 0,
				scale: 1,
				opacityMultiplier:
					direction === "enter" ? normalizedProgress : 1 - normalizedProgress,
			};
		case "pop": {
			const springProgress = spring({
				fps,
				frame: Math.min(currentFrame, durationInFrames),
				config: {
					damping: 14,
					stiffness: 180,
					mass: 0.7,
				},
				durationInFrames,
			});
			const scaleProgress =
				direction === "enter" ? springProgress : 1 - springProgress;
			return {
				translateX: 0,
				translateY: interpolate(motionProgress, [0, 1], [12, 0]),
				scale: interpolate(scaleProgress, [0, 1], [0.88, 1]),
				opacityMultiplier:
					direction === "enter" ? normalizedProgress : 1 - normalizedProgress,
			};
		}
		default:
			return {
				translateX: 0,
				translateY: 0,
				scale: 1,
				opacityMultiplier:
					direction === "enter" ? normalizedProgress : 1 - normalizedProgress,
			};
	}
};

export const TextLayer = ({
	item: itemWithoutHoverPreview,
}: {
	item: TextItem;
}) => {
	if (itemWithoutHoverPreview.type !== "text") {
		throw new Error("Item is not a text");
	}

	const frame = useCurrentFrame();
	const { fps, durationInFrames } = useVideoConfig();

	const textItemHoverPreview = useContext(TextItemHoverPreviewContext);
	const item = useMemo(
		() =>
			overrideTextItemWithHoverPreview({
				textItem: itemWithoutHoverPreview,
				hoverPreview: textItemHoverPreview,
			}),
		[itemWithoutHoverPreview, textItemHoverPreview],
	);

	const opacity = useMemo(() => {
		const inOpacity = calculateFadeInOpacity({
			currentFrame: frame,
			fadeInDurationInSeconds: item.fadeInDurationInSeconds,
			framesPerSecond: fps,
		});
		const outOpacity = calculateFadeOutOpacity({
			currentFrame: frame,
			fadeOutDurationInSeconds: item.fadeOutDurationInSeconds,
			framesPerSecond: fps,
			totalDurationInFrames: durationInFrames,
		});
		return inOpacity * outOpacity * item.opacity;
	}, [
		item.fadeInDurationInSeconds,
		fps,
		frame,
		item.opacity,
		durationInFrames,
		item.fadeOutDurationInSeconds,
	]);

	const enterAnimation = item.enterAnimation ?? "fade";
	const enterAnimationDurationInSeconds =
		item.enterAnimationDurationInSeconds ??
		DEFAULT_ENTER_ANIMATION_DURATION_IN_SECONDS;
	const enterAnimationStyles = useMemo(
		() =>
			getAnimationStyles({
				currentFrame: frame,
				fps,
				animation: enterAnimation,
				animationDurationInSeconds: enterAnimationDurationInSeconds,
				direction: "enter",
			}),
		[enterAnimation, enterAnimationDurationInSeconds, fps, frame],
	);
	const exitAnimation = item.exitAnimation ?? "fade";
	const exitAnimationDurationInSeconds =
		item.exitAnimationDurationInSeconds ??
		DEFAULT_EXIT_ANIMATION_DURATION_IN_SECONDS;
	const exitAnimationStartFrame = Math.max(
		0,
		item.durationInFrames - exitAnimationDurationInSeconds * fps,
	);
	const exitAnimationStyles = useMemo(
		() =>
			getAnimationStyles({
				currentFrame: Math.max(0, frame - exitAnimationStartFrame),
				fps,
				animation: exitAnimation,
				animationDurationInSeconds: exitAnimationDurationInSeconds,
				direction: "exit",
			}),
		[
			exitAnimation,
			exitAnimationDurationInSeconds,
			exitAnimationStartFrame,
			fps,
			frame,
		],
	);

	const context = useContext(FontInfoContext);
	const textItemEditing = useContext(TextItemEditingContext);

	const loaded = useLoadFontFromTextItem({
		fontFamily: item.fontFamily,
		fontVariant: item.fontStyle.variant,
		fontWeight: item.fontStyle.weight,
		fontInfosDuringRendering: context[item.fontFamily] ?? null,
	});

	const shouldShowBackground =
		item.background && item.background.color !== "transparent";

	return (
		<>
			{shouldShowBackground && FEATURE_TEXT_BACKGROUND_CONTROL && loaded ? (
				<RoundedTextBox textItem={item} opacity={opacity} />
			) : null}
			{item.id === textItemEditing ? (
				<CanvasTextEditor item={item} />
			) : (
				<div
					dir={item.direction}
					style={{
						fontSize: item.fontSize,
						color: item.color,
						lineHeight: String(item.lineHeight),
						letterSpacing: `${item.letterSpacing}px`,
						left: item.left,
						top: item.top,
						width: item.width,
						height: item.height,
						position: "absolute",
						whiteSpace: "pre-wrap",
						display: "block",
						fontFamily: item.fontFamily,
						...turnFontStyleIntoCss(item.fontStyle),
						overflow: "visible",
						wordWrap: "break-word",
						boxSizing: "border-box",
						userSelect: "none",
						textAlign: item.align,
						opacity:
							opacity *
							enterAnimationStyles.opacityMultiplier *
							exitAnimationStyles.opacityMultiplier,
						transform: `translate(${enterAnimationStyles.translateX + exitAnimationStyles.translateX}px, ${enterAnimationStyles.translateY + exitAnimationStyles.translateY}px) scale(${enterAnimationStyles.scale * exitAnimationStyles.scale}) rotate(${item.rotation}deg)`,
						WebkitTextStroke: item.strokeWidth
							? `${item.strokeWidth}px ${item.strokeColor}`
							: "0",
						paintOrder: "stroke",
					}}
				>
					{item.text}
				</div>
			)}
		</>
	);
};
