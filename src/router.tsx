import * as Sentry from "@sentry/tanstackstart-react";
import type { AnyRouter } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

let clientRouter: AnyRouter | null = null;

// Create a new router instance
export const getRouter = (): AnyRouter => {
	if (typeof window !== "undefined" && clientRouter) {
		return clientRouter;
	}

	const rqContext = TanstackQuery.getContext();

	const router = createRouter({
		routeTree,
		context: {
			...rqContext,
		},

		defaultPreload: "intent",
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	});

	if (!router.isServer) {
		clientRouter = router;
		Sentry.init({
			dsn: import.meta.env.VITE_SENTRY_DSN,
			integrations: [],
			tracesSampleRate: 1.0,
			sendDefaultPii: true,
		});
	}

	return router;
};
