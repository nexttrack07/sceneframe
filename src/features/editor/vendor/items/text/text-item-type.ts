import type { BaseItem, CanHaveRotation } from "../shared";

export type TextAlign = "left" | "center" | "right";
export type TextDirection = "ltr" | "rtl";
export type TextAnimationPreset = "fade" | "slide-up" | "slide-left" | "pop";

export type FontStyle = {
	variant: string;
	weight: string;
};

export type TextItemBackground = {
	color: string;
	horizontalPadding: number;
	borderRadius: number;
};

export type TextItem = BaseItem &
	CanHaveRotation & {
		type: "text";
		text: string;
		color: string;
		align: TextAlign;
		fontFamily: string;
		fontStyle: FontStyle;
		fontSize: number;
		lineHeight: number;
		letterSpacing: number;
		resizeOnEdit: boolean;
		direction: TextDirection;
		strokeWidth: number;
		strokeColor: string;
		enterAnimation?: TextAnimationPreset;
		enterAnimationDurationInSeconds?: number;
		exitAnimation?: TextAnimationPreset;
		exitAnimationDurationInSeconds?: number;
		fadeInDurationInSeconds: number;
		fadeOutDurationInSeconds: number;
		background: TextItemBackground | null;
	};
