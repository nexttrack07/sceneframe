export function getPracticalityWarnings(text: string): string[] {
	const lower = text.toLowerCase();
	const warnings: string[] = [];
	if (lower.includes("crowd") || lower.includes("thousands")) {
		warnings.push(
			"Large crowd setup may be expensive or hard to generate consistently.",
		);
	}
	if (lower.includes("explosion") || lower.includes("helicopter")) {
		warnings.push(
			"High-complexity cinematic elements may require simplification.",
		);
	}
	if (!lower.includes("lighting") && !lower.includes("camera")) {
		warnings.push(
			"Add lighting/camera direction for stronger and more consistent outputs.",
		);
	}
	if (
		lower.includes("multiple locations") ||
		lower.includes("many locations")
	) {
		warnings.push(
			"Many locations can fragment pacing; consider narrowing locations per scene.",
		);
	}
	return warnings;
}
