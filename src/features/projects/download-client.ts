function inferExtension(url: string, fallback: string) {
	try {
		const pathname = new URL(url).pathname;
		const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
		return match ? match[1] : fallback;
	} catch {
		return fallback;
	}
}

export async function downloadRemoteAsset({
	url,
	filenameBase,
	fallbackExtension,
}: {
	url: string;
	filenameBase: string;
	fallbackExtension: string;
}) {
	const extension = inferExtension(url, fallbackExtension);
	const filename = `${filenameBase}.${extension}`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Download failed with status ${response.status}`);
		}

		const blob = await response.blob();
		const blobUrl = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = blobUrl;
		anchor.download = filename;
		anchor.click();
		URL.revokeObjectURL(blobUrl);
		return;
	} catch {
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		anchor.target = "_blank";
		anchor.rel = "noreferrer";
		anchor.click();
	}
}
