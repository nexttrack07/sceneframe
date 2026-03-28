import { Film, Image } from "lucide-react";

export type ShotMediaTab = "images" | "video";

export function ShotMediaTabs({
	activeTab,
	onTabChange,
}: {
	activeTab: ShotMediaTab;
	onTabChange: (tab: ShotMediaTab) => void;
}) {
	return (
		<div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
			<button
				type="button"
				onClick={() => onTabChange("images")}
				className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
					activeTab === "images"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground hover:bg-background/50"
				}`}
			>
				<Image size={14} />
				Images
			</button>
			<button
				type="button"
				onClick={() => onTabChange("video")}
				className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
					activeTab === "video"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground hover:bg-background/50"
				}`}
			>
				<Film size={14} />
				Video
			</button>
		</div>
	);
}
