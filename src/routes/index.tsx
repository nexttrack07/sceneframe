import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CheckCircle2,
	Clapperboard,
	Images,
	MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: App });

function App() {
	return (
		<div className="min-h-screen bg-background">
			<header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
				<div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
					<Link to="/" className="text-sm font-semibold text-foreground">
						SceneFrame.ai
					</Link>

					<nav className="hidden md:flex items-center gap-6 text-sm">
						<a
							href="#how-it-works"
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							How it works
						</a>
						<a
							href="#features"
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							Features
						</a>
						<a
							href="#pricing"
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							Pricing
						</a>
					</nav>

					<div className="flex items-center gap-2">
						<Button asChild variant="ghost" size="sm">
							<Link to="/sign-in">Sign in</Link>
						</Button>
						<Button
							asChild
							size="sm"
							className="bg-primary hover:bg-primary/90"
						>
							<Link to="/sign-in">Get started</Link>
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-6 py-16 md:py-20 space-y-16">
				<section className="text-center space-y-6">
					<p className="text-sm text-primary font-medium">SceneFrame.ai</p>
					<h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
						Plan scenes and collect production-ready assets faster.
					</h1>
					<p className="text-lg text-muted-foreground max-w-3xl mx-auto">
						Replace scattered docs, endless prompt rewrites, and unclear scene
						direction with a focused workflow: creative brief, script chat, and
						scene-by-scene asset planning.
					</p>
					<div className="flex items-center justify-center gap-3">
						<Button asChild className="bg-primary hover:bg-primary/90">
							<Link to="/sign-in">Start building your next video</Link>
						</Button>
						<Button asChild variant="outline">
							<Link to="/sign-in">View the workflow</Link>
						</Button>
					</div>
					<ImagePlaceholder label="Hero product preview placeholder" />
				</section>

				<section className="space-y-6">
					<h2 className="text-2xl font-bold text-foreground text-center">
						The old workflow breaks creative momentum
					</h2>
					<div className="grid gap-4 md:grid-cols-3">
						<InfoCard
							title="Prompt guesswork"
							description="Users shoulder too much responsibility to describe everything perfectly on the first try."
						/>
						<InfoCard
							title="Scene ambiguity"
							description="Without structured intake, generated scenes miss the intended style, tone, or pacing."
						/>
						<InfoCard
							title="Asset chaos"
							description="Accepted and rejected visuals become hard to track when scene details are not centralized."
						/>
					</div>
				</section>

				{/* biome-ignore lint/correctness/useUniqueElementIds: page-level navigation anchors — this component renders once per route */}
				<section id="how-it-works" className="space-y-6">
					<h2 className="text-2xl font-bold text-foreground text-center">
						How it works
					</h2>
					<div className="grid gap-4 md:grid-cols-2">
						<StepCard
							icon={<MessageSquareText size={18} className="text-primary" />}
							step="01"
							title="Structured intake"
							description="Collect purpose, length, style, mood, setting, and concept through a guided Typeform-style flow."
						/>
						<StepCard
							icon={<CheckCircle2 size={18} className="text-primary" />}
							step="02"
							title="Brief confirmation"
							description="The assistant summarizes the creative brief first so the user confirms direction before scene proposals."
						/>
						<StepCard
							icon={<Clapperboard size={18} className="text-primary" />}
							step="03"
							title="Script chat"
							description="Refine and approve scene breakdowns collaboratively with targeted feedback loops."
						/>
						<StepCard
							icon={<Images size={18} className="text-primary" />}
							step="04"
							title="Storyboard + assets"
							description="Manage each scene as a workspace for generating, iterating, accepting, and replacing visual assets."
						/>
					</div>
					<ImagePlaceholder label="Workflow screenshot placeholder" />
				</section>

				{/* biome-ignore lint/correctness/useUniqueElementIds: page-level navigation anchor */}
				<section id="features" className="space-y-10">
					<FeatureRow
						title="Guide creators without forcing technical prompts"
						description="Intake captures the essentials up front so users do less prompt engineering and get better first-pass scene proposals."
						imageLabel="Intake UI placeholder"
					/>
					<FeatureRow
						reverse
						title="Keep every scene editable after approval"
						description="Storyboard view gives each scene a durable home where descriptions and assets can be refined without restarting projects."
						imageLabel="Storyboard UI placeholder"
					/>
				</section>

				{/* biome-ignore lint/correctness/useUniqueElementIds: page-level navigation anchor */}
				<section id="pricing" className="space-y-6">
					<h2 className="text-2xl font-bold text-foreground text-center">
						Simple BYOK pricing
					</h2>
					<div className="max-w-md mx-auto rounded-xl border bg-card p-6 shadow-sm space-y-4">
						<p className="text-sm text-primary font-medium">Current plan</p>
						<p className="text-3xl font-bold text-foreground">$29/mo</p>
						<p className="text-sm text-muted-foreground">
							Bring your own AI keys and run a complete scene planning workflow
							without token markup.
						</p>
						<ul className="space-y-2 text-sm text-foreground">
							<li>Structured brief intake + script chat</li>
							<li>Scene approvals and storyboard management</li>
							<li>Asset organization per scene</li>
						</ul>
						<Button asChild className="w-full bg-primary hover:bg-primary/90">
							<Link to="/sign-in">Get started</Link>
						</Button>
					</div>
				</section>

				<section className="text-center rounded-xl border bg-card p-8 md:p-10 space-y-4">
					<h2 className="text-3xl font-bold text-foreground">
						Stop guessing prompts. Start directing scenes.
					</h2>
					<p className="text-muted-foreground max-w-2xl mx-auto">
						SceneFrame helps creators move from rough idea to production-ready
						scene assets with a workflow that stays clear at every step.
					</p>
					<Button asChild size="lg" className="bg-primary hover:bg-primary/90">
						<Link to="/sign-in">Create your first project</Link>
					</Button>
				</section>
			</main>
		</div>
	);
}

function InfoCard({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-xl border bg-card p-5 shadow-sm transition-all duration-100 hover:bg-muted">
			<h3 className="text-lg font-semibold text-foreground">{title}</h3>
			<p className="text-sm text-muted-foreground mt-2">{description}</p>
		</div>
	);
}

function StepCard({
	icon,
	step,
	title,
	description,
}: {
	icon: React.ReactNode;
	step: string;
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
			<div className="flex items-center justify-between">
				<div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
					{icon}
				</div>
				<p className="text-xs text-muted-foreground font-medium">{step}</p>
			</div>
			<h3 className="text-lg font-semibold text-foreground">{title}</h3>
			<p className="text-sm text-muted-foreground">{description}</p>
		</div>
	);
}

function FeatureRow({
	title,
	description,
	imageLabel,
	reverse = false,
}: {
	title: string;
	description: string;
	imageLabel: string;
	reverse?: boolean;
}) {
	return (
		<div
			className={`grid gap-6 md:grid-cols-2 items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}
		>
			<div className="space-y-3">
				<h3 className="text-2xl font-bold text-foreground">{title}</h3>
				<p className="text-muted-foreground">{description}</p>
			</div>
			<ImagePlaceholder label={imageLabel} />
		</div>
	);
}

function ImagePlaceholder({ label }: { label: string }) {
	return (
		<div className="aspect-video rounded-xl border border-dashed bg-muted/50 flex items-center justify-center text-sm text-muted-foreground">
			{label}
		</div>
	);
}
