import { auth } from "@clerk/tanstack-react-start/server";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { users } from "@/db/schema";

const loadLibrary = createServerFn().handler(async () => {
	const { userId } = await auth();
	if (!userId) throw redirect({ to: "/sign-in" });

	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
	});

	if (!user?.onboardingComplete) {
		throw redirect({ to: "/onboarding" });
	}

	return { userId };
});

export const Route = createFileRoute("/_auth/library")({
	loader: () => loadLibrary(),
	component: LibraryLayout,
});

function LibraryLayout() {
	const location = useLocation();
	const currentPath = location.pathname;

	const tabs = [
		{ label: "Characters", href: "/library/characters" },
		{ label: "Locations", href: "/library/locations" },
	];

	return (
		<div className="max-w-5xl mx-auto px-6 py-8">
			<div className="mb-8">
				<h1 className="text-2xl font-bold text-foreground">Library</h1>
				<p className="text-sm text-muted-foreground mt-0.5">
					Reusable characters and locations you can import into any project.
				</p>
			</div>

			<div className="flex items-center gap-1 border-b mb-6">
				{tabs.map((tab) => {
					const isActive = currentPath.startsWith(tab.href);
					return (
						<Link
							key={tab.href}
							to={tab.href}
							className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
								isActive
									? "border-primary text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
							}`}
						>
							{tab.label}
						</Link>
					);
				})}
			</div>

			<Outlet />
		</div>
	);
}
