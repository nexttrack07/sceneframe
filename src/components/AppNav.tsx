import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { Film } from "lucide-react";

export default function AppNav() {
	return (
		<header className="h-14 border-b bg-card flex items-center px-6 gap-6 shrink-0">
			<Link
				to="/dashboard"
				className="flex items-center gap-2 font-semibold text-foreground"
			>
				<Film size={20} className="text-primary" />
				<span>SceneFrame</span>
			</Link>

			<nav className="flex items-center gap-1 flex-1">
				<Link
					to="/dashboard"
					className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
					activeProps={{
						className:
							"text-sm px-3 py-1.5 rounded-md text-foreground bg-muted font-medium",
					}}
				>
					Projects
				</Link>
			</nav>

			<UserButton />
		</header>
	);
}
