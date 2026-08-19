"use client";

import { saveAs } from "file-saver";

import { safeExportFileName } from "@/lib/export-file";
import { mediaDownloadFileName } from "@/lib/media-file";
import { originalImageDownloadUrl, originalMediaDownloadUrl } from "@/lib/media-image-url";
import { createZip, type ZipFile } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasNodeData } from "../types";

export function selectedCanvasMediaNodes(nodes: CanvasNodeData[], selectedNodeIds: ReadonlySet<string>) {
    return nodes.filter((node) => selectedNodeIds.has(node.id) && Boolean(node.metadata?.content) && (isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Video));
}

export async function downloadCanvasMediaBundle(nodes: CanvasNodeData[], projectTitle: string) {
    let failed = 0;
    let downloaded = 0;
    const indexWidth = String(nodes.length).length;

    async function* files(): AsyncGenerator<ZipFile> {
        for (const [index, node] of nodes.entries()) {
            const content = node.metadata?.content;
            if (!content) continue;
            const image = isCanvasImageNodeType(node.type);
            const sourceUrl = image ? originalImageDownloadUrl(content) : originalMediaDownloadUrl(content);
            const blob = image ? await getImageBlob(node.metadata?.storageKey || "", sourceUrl) : await getMediaBlob(node.metadata?.storageKey || "", sourceUrl);
            if (!blob?.size) {
                failed += 1;
                continue;
            }
            const mimeType = blob.type || node.metadata?.mimeType || (image ? "image/png" : "video/mp4");
            const fileName = mediaDownloadFileName(node.id, mimeType, node.metadata?.storageKey || node.metadata?.serverUrl || sourceUrl);
            downloaded += 1;
            yield { name: `${String(index + 1).padStart(indexWidth, "0")}-${fileName}`, data: blob };
        }
    }

    const zip = await createZip(files());
    if (!downloaded) throw new Error("选中的图片或视频暂时无法读取");
    saveAs(zip, `${safeExportFileName(projectTitle || "画布")}-选中媒体.zip`);
    return { downloaded, failed };
}

export async function downloadCanvasImageLayers(node: CanvasNodeData, projectTitle: string) {
    const layers = node.metadata?.imageLayers || [];
    if (!layers.length) throw new Error("当前节点没有可下载的图层");
    let failed = 0;
    let downloaded = 0;
    const indexWidth = String(layers.length).length;
    async function* files(): AsyncGenerator<ZipFile> {
        for (const [index, layer] of layers.entries()) {
            const blob = await getImageBlob(layer.storageKey || "", originalImageDownloadUrl(layer.content));
            if (!blob?.size) {
                failed += 1;
                continue;
            }
            const mimeType = blob.type || layer.mimeType || "image/png";
            const fileName = mediaDownloadFileName(layer.id, mimeType, layer.storageKey || layer.serverUrl || layer.content);
            downloaded += 1;
            yield { name: `${String(index + 1).padStart(indexWidth, "0")}-${fileName}`, data: blob };
        }
    }
    const zip = await createZip(files());
    if (!downloaded) throw new Error("分层图片暂时无法读取");
    saveAs(zip, `${safeExportFileName(projectTitle || node.title || "画布")}-分层结果.zip`);
    return { downloaded, failed };
}
