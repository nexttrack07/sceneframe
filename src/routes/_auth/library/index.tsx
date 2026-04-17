import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/library/")({
	loader: () => {
		throw redirect({ to: "/library/characters" });
	},
});
