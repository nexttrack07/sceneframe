/**
 * Extract and parse a JSON block from an LLM response string.
 * Handles fenced code blocks, raw JSON, and embedded JSON objects
 * with balanced-brace extraction for robustness.
 */
export function extractJsonBlock<T>(response: string): T | null {
	const parseCandidate = (candidate: string): T | null => {
		try {
			return JSON.parse(candidate.trim()) as T;
		} catch {
			return null;
		}
	};

	const extractBalancedJson = (
		text: string,
		open: string,
		close: string,
	): string | null => {
		const start = text.indexOf(open);
		if (start === -1) return null;

		let depth = 0;
		let inString = false;
		let isEscaped = false;

		for (let index = start; index < text.length; index += 1) {
			const char = text[index];

			if (inString) {
				if (isEscaped) {
					isEscaped = false;
					continue;
				}
				if (char === "\\") {
					isEscaped = true;
					continue;
				}
				if (char === '"') {
					inString = false;
				}
				continue;
			}

			if (char === '"') {
				inString = true;
				continue;
			}

			if (char === open) {
				depth += 1;
				continue;
			}

			if (char === close) {
				depth -= 1;
				if (depth === 0) {
					return text.slice(start, index + 1);
				}
			}
		}

		return null;
	};

	try {
		const fenceMatch = response.match(/```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```/);
		const fencedBlock = fenceMatch?.[1];
		if (fencedBlock) {
			const parsed = parseCandidate(fencedBlock);
			if (parsed) return parsed;
		}

		const parsedRaw = parseCandidate(response);
		if (parsedRaw) return parsedRaw;

		const source = fencedBlock ? fencedBlock : response;
		const embeddedJson =
			extractBalancedJson(source, "{", "}") ??
			extractBalancedJson(source, "[", "]");
		if (!embeddedJson) return null;

		return parseCandidate(embeddedJson);
	} catch {
		return null;
	}
}
