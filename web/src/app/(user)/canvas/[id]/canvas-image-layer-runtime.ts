import { isGenerationTaskNeedsReviewError } from "@/services/api/generation-task-state";
import type { UploadedImage } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import { nanoid } from "nanoid";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { findFreeNodePosition } from "../utils/canvas-agent-ops";
import { fitNodeSize } from "../utils/canvas-node-size";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING } from "./canvas-page-elements";
import { pauseCanvasGenerationReview } from "./canvas-generation-review";
import { buildGenerationConfig, buildImageGenerationMetadata, canvasNodeReferenceImage, imageMetadata, isGenerationCanceled, uploadCanvasImage } from "./canvas-page-utils";
import type { CanvasPageState } from "./use-canvas-page-state";
import type { CanvasTaskRuntime } from "./use-canvas-task-runtime";

export async function stableCanvasLayerSource(node: CanvasNodeData, setNodes: CanvasPageState["setNodes"]): Promise<ReferenceImage> {
    let source = canvasNodeReferenceImage(node);
    if (/^(data:|blob:)/i.test(source.dataUrl)) {
        const stored = await uploadCanvasImage(source.dataUrl);
        source = canvasLayerReference(stored, node.id, "source.png");
        setNodes((current) => current.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...imageMetadata(stored) } } : item)));
    }
    return source;
}

export function createLocalCanvasLayerNode(sourceNode: CanvasNodeData, id: string, name: string, image: UploadedImage, occupiedNodes: CanvasNodeData[], imageLayer?: NonNullable<CanvasNodeData["metadata"]>["imageLayer"]): CanvasNodeData {
    const size = fitNodeSize(image.width, image.height, sourceNode.width, sourceNode.height);
    const position = findFreeNodePosition(occupiedNodes, { x: sourceNode.position.x + sourceNode.width + 36, y: sourceNode.position.y }, size.width, size.height);
    return {
        id,
        type: CanvasNodeType.Image,
        title: `${sourceNode.title || "图片"} · ${name}`,
        position,
        ...size,
        metadata: {
            ...imageMetadata(image),
            prompt: sourceNode.metadata?.prompt,
            layerName: name,
            sourceLayerNodeId: sourceNode.id,
            imageLayer,
        },
    };
}

export function canvasLayerReference(image: UploadedImage, id: string, name: string): ReferenceImage {
    const dataUrl = image.serverUrl || image.url;
    return { id, name, type: image.mimeType || "image/png", dataUrl, url: dataUrl, serverUrl: dataUrl, storageKey: image.storageKey, width: image.width, height: image.height };
}

export async function runCanvasBackgroundLayer({
    sourceNode,
    source,
    config,
    mask,
    validationMask,
    prompt,
    occupiedNodes,
    messageKey,
    state,
    tasks,
}: {
    sourceNode: CanvasNodeData;
    source: ReferenceImage;
    config: ReturnType<typeof buildGenerationConfig>;
    mask: UploadedImage;
    validationMask: UploadedImage;
    prompt: string;
    occupiedNodes: CanvasNodeData[];
    messageKey: string;
    state: CanvasPageState;
    tasks: CanvasTaskRuntime;
}) {
    const { message, setConnections, setDialogNodeId, setNodes, setRunningNodeId, setSelectedConnectionId, setSelectedNodeIds } = state;
    const { finishGenerationRequest, startAndCompleteImageTask, startGenerationRequest } = tasks;
    const id = nanoid();
    const position = findFreeNodePosition(occupiedNodes, { x: sourceNode.position.x + sourceNode.width + 36, y: sourceNode.position.y }, sourceNode.width, sourceNode.height);
    const node: CanvasNodeData = {
        id,
        type: CanvasNodeType.Image,
        title: `${sourceNode.title || "图片"} · 背景`,
        position,
        width: sourceNode.width,
        height: sourceNode.height,
        metadata: {
            prompt,
            status: NODE_STATUS_LOADING,
            ...buildImageGenerationMetadata("edit", config, 1, [source]),
            layerName: "背景",
            sourceLayerNodeId: sourceNode.id,
            imageEditMask: uploadMetadata(mask),
            imageEditValidationMask: uploadMetadata(validationMask),
            preserveUnmaskedPixels: true,
        },
    };
    setNodes((current) => [...current, node]);
    setConnections((current) => [...current, { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: id }]);
    setSelectedNodeIds(new Set([id]));
    setSelectedConnectionId(null);
    setDialogNodeId(id);
    setRunningNodeId(id);
    message.loading({ key: messageKey, content: "正在单独补全背景…", duration: 0 });
    const controller = startGenerationRequest(id, sourceNode.id, id);
    try {
        await startAndCompleteImageTask(
            id,
            config,
            prompt,
            [source],
            {
                id: `${id}-mask`,
                name: "mask.png",
                type: mask.mimeType || "image/png",
                dataUrl: mask.serverUrl || mask.url,
                storageKey: mask.storageKey,
                serverUrl: mask.serverUrl || mask.url,
                width: mask.width,
                height: mask.height,
            },
            controller,
        );
        return true;
    } catch (error) {
        if (isGenerationCanceled(error)) {
            setNodes((current) => current.filter((item) => item.id !== id));
            setConnections((current) => current.filter((connection) => connection.toNodeId !== id));
            return false;
        }
        const errorDetails = error instanceof Error ? error.message : "背景补全失败";
        if (isGenerationTaskNeedsReviewError(error)) setNodes((current) => pauseCanvasGenerationReview(current, [id], errorDetails));
        else setNodes((current) => current.map((item) => (item.id === id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, imageTask: undefined, errorDetails } } : item)));
        return false;
    } finally {
        finishGenerationRequest(id, controller);
        setRunningNodeId(null);
    }
}

function uploadMetadata(image: UploadedImage) {
    return { storageKey: image.storageKey, serverUrl: image.serverUrl || image.url, mimeType: image.mimeType, width: image.width, height: image.height };
}
