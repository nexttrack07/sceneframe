import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import { uploadBuffer } from "@/lib/r2.server";

export const uploadProjectReferenceInputImage = createServerFn({
	method: "POST",
})
	.inputValidator(
		(data: { projectId: string; fileBase64: string; fileName: string }) => data,
	)
	.handler(async ({ data: { projectId, fileBase64, fileName } }) => {
		await assertProjectOwner(projectId, "error");

		const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(base64Data, "base64");
		const MAX_SIZE_BYTES = 20 * 1024 * 1024;
		if (buffer.length > MAX_SIZE_BYTES) {
			throw new Error("File size exceeds 20MB limit");
		}

		const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
		const contentTypeMap: Record<string, string> = {
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			png: "image/png",
			webp: "image/webp",
			gif: "image/gif",
		};
		const contentType = contentTypeMap[ext] ?? "image/jpeg";
		const storageKey = `projects/${projectId}/reference-inputs/${randomUUID()}.${ext}`;
		const url = await uploadBuffer(buffer, storageKey, contentType);

		return { url, storageKey };
	});
