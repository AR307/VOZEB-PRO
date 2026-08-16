import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { APP_EXPORT_ID, collectStorageKeys } from "@/lib/storage-keys";
import { exportFileExtension, safeExportFileName } from "@/lib/export-file";
import { mediaDownloadFileName } from "@/lib/media-file";
import type { CanvasExportAsset, CanvasExportFile } from "../export-types";
import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, isCanvasImageNodeType } from "../types";
import { encodeCanvasPsd } from "./canvas-psd";

export async function exportCanvasProjects(projects: CanvasProject[]) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                Array.from(collectStorageKeys(project, (key) => key.startsWith("permanent/") || key.startsWith("temporary/"))).map(async (storageKey) => {
                    const blob = storageKey.includes("/images/") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                    if (!blob) return;
                    const path = `projects/${project.id}/files/${safeExportFileName(storageKey)}.${exportFileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: APP_EXPORT_ID, version: 3, exportedAt: new Date().toISOString(), projects: exportedProjects };
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, mediaDownloadFileName(projects.map((project) => project.id).join(":"), "application/zip"));
}

export async function exportCanvasProjectAsPsd(project: CanvasProject) {
    const nodes = project.nodes.filter((node) => isCanvasImageNodeType(node.type) && node.metadata?.content && !node.metadata?.isBatchRoot && node.type !== CanvasNodeType.Panorama);
    if (!nodes.length) throw new Error("当前画布没有可导出的图片图层");
    const left = Math.floor(Math.min(...nodes.map((node) => node.position.x)));
    const top = Math.floor(Math.min(...nodes.map((node) => node.position.y)));
    const right = Math.ceil(Math.max(...nodes.map((node) => node.position.x + node.width)));
    const bottom = Math.ceil(Math.max(...nodes.map((node) => node.position.y + node.height)));
    const blob = await encodeCanvasPsd(
        [...nodes].reverse().map((node) => ({
            name: node.metadata?.layerName || node.title || "图片图层",
            dataUrl: node.metadata!.content!,
            x: node.position.x - left,
            y: node.position.y - top,
            width: node.width,
            height: node.height,
            visible: node.metadata?.layerVisible !== false,
        })),
        Math.max(1, right - left),
        Math.max(1, bottom - top),
    );
    saveAs(blob, `${safeExportFileName(project.title || "画布")}.psd`);
}
