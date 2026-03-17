import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { encryptUserApiKey } from "@/lib/encryption.server";

const loadOnboarding = createServerFn().handler(async () => {
	const { userId } = await auth();
	if (!userId) throw redirect({ to: "/sign-in" });

	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { onboardingComplete: true },
	});

	return { isReturning: !!user?.onboardingComplete };
});

const saveApiKey = createServerFn({ method: "POST" })
	.inputValidator((data: { apiKey: string; elevenLabsKey?: string }) => data)
	.handler(async ({ data }) => {
		const { userId } = await auth();
		if (!userId) throw redirect({ to: "/sign-in" });

		const { apiKey, elevenLabsKey } = data;
		if (!apiKey?.startsWith("r8_")) {
			throw new Error("Invalid Replicate API key — must start with r8_");
		}

		const { providerKeyEnc, providerKeyDek } = encryptUserApiKey(apiKey);

		const elevenLabsFields = elevenLabsKey?.trim()
			? encryptUserApiKey(elevenLabsKey.trim())
			: null;

		await db
			.insert(users)
			.values({
				id: userId,
				providerKeyEnc,
				providerKeyDek,
				...(elevenLabsFields && {
					elevenlabsKeyEnc: elevenLabsFields.providerKeyEnc,
					elevenlabsKeyDek: elevenLabsFields.providerKeyDek,
				}),
				onboardingComplete: true,
			})
			.onConflictDoUpdate({
				target: users.id,
				set: {
					providerKeyEnc,
					providerKeyDek,
					...(elevenLabsFields && {
						elevenlabsKeyEnc: elevenLabsFields.providerKeyEnc,
						elevenlabsKeyDek: elevenLabsFields.providerKeyDek,
					}),
					onboardingComplete: true,
				},
			});

		return { ok: true };
	});

export const Route = createFileRoute("/_auth/onboarding")({
	loader: () => loadOnboarding(),
	component: OnboardingPage,
});

function OnboardingPage() {
	const { isReturning } = Route.useLoaderData();
	const navigate = useNavigate();
	const apiKeyId = useId();
	const elevenLabsKeyId = useId();
	const [apiKey, setApiKey] = useState("");
	const [elevenLabsKey, setElevenLabsKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setIsPending(true);
		try {
			await saveApiKey({
				data: {
					apiKey,
					elevenLabsKey: elevenLabsKey || undefined,
				},
			});
			navigate({ to: "/dashboard" });
		} catch (err: unknown) {
			if (err instanceof Error) setError(err.message);
		} finally {
			setIsPending(false);
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-muted p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-1">
					<CardTitle className="text-2xl font-bold">
						{isReturning
							? "Update your Replicate API key"
							: "Welcome to SceneFrame"}
					</CardTitle>
					<CardDescription>
						{isReturning
							? "Enter a new key below to replace the one currently stored. Your key is encrypted at rest."
							: "Enter your Replicate API key to start generating cinematic scenes. Your key is encrypted and stored securely — we never see it in plain text."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor={apiKeyId}>Replicate API Key</Label>
							<Input
								id={apiKeyId}
								type="password"
								placeholder="r8_••••••••••••••••••••••••••••••••••••••••"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								required
								autoComplete="off"
							/>
							<p className="text-xs text-muted-foreground">
								Get your key at{" "}
								<a
									href="https://replicate.com/account/api-tokens"
									target="_blank"
									rel="noopener noreferrer"
									className="underline hover:text-foreground"
								>
									replicate.com/account/api-tokens
								</a>
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor={elevenLabsKeyId}>
								ElevenLabs API Key{" "}
								<span className="text-muted-foreground font-normal">
									(optional — for voiceover)
								</span>
							</Label>
							<Input
								id={elevenLabsKeyId}
								type="password"
								placeholder="sk_••••••••••••••••••••••••••••••••"
								value={elevenLabsKey}
								onChange={(e) => setElevenLabsKey(e.target.value)}
								autoComplete="off"
							/>
							<p className="text-xs text-muted-foreground">
								Get your key at{" "}
								<a
									href="https://elevenlabs.io/app/settings/api-keys"
									target="_blank"
									rel="noopener noreferrer"
									className="underline hover:text-foreground"
								>
									elevenlabs.io/app/settings/api-keys
								</a>
							</p>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button type="submit" className="w-full" disabled={isPending}>
							{isPending
								? "Saving…"
								: isReturning
									? "Update key"
									: "Save and continue"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
