import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import AppNav from "@/components/AppNav";

const checkAuth = createServerFn().handler(async () => {
	const { userId } = await auth();
	return { userId };
});

export const Route = createFileRoute("/_auth")({
	beforeLoad: async () => {
		const { userId } = await checkAuth();
		if (!userId) {
			throw redirect({ to: "/sign-in" });
		}
	},
	component: AuthLayout,
});

function AuthLayout() {
	return (
		<div className="min-h-screen bg-muted flex flex-col">
			<AppNav />
			<main className="flex-1">
				<Outlet />
			</main>
		</div>
	);
}
