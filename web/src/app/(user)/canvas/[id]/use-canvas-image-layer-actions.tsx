"use client";

import { useCallback, useRef } from "react";

import { isGenerationTaskNeedsReviewError } from "@/services/api/generation-task-state";
import type { UploadedImage } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";
import { nanoid } from "nanoid";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { splitSubjectAndBackgroundDataUrl } from "../utils/canvas-image-data";
import { NODE_STATUS_ERROR, NODE_STATUS_LOADING } from "./canvas-page-elements";
import { pauseCanvasGenerationReview } from "./canvas-generation-review";
import { buildGenerationConfig, canvasNodeReferenceImage, imageMetadata, isGenerationCanceled, uploadCanvasImage } from "./canvas-page-utils";
import type { CanvasPageState } from "./use-canvas-page-state";
import type { CanvasTaskRuntime } from "./use-canvas-task-runtime";

const IMAGE_LAYER_PROMPT =
    "对参考图执行像素级分层。一次任务返回全部独立视觉元素，每个元素分别输出为与源图同宽高、保留原始坐标并带真实透明 Alpha 的 PNG。必须直接保留原图像素、清晰边缘、原始颜色和比例，不得裁片、缩放、重绘、改写或合并元素；背景也作为同宽高独立图层返回，只补全元素遮挡区域，不得改动其他区域或把已分离元素补回背景。";

export function useCanvasImageLayerActions({ state, tasks }: { state: CanvasPageState; tasks: CanvasTaskRuntime }) {
    const { message, effectiveConfig, isAiConfigReady, openConfigDialog, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setToolbarNodeId, setDialogNodeId, setRunningNodeId } = state;
    const { startGenerationRequest, finishGenerationRequest, startAndCompleteImageTask } = tasks;
    const operationNodeIds = useRef(new Set<string>());

    const removeBackgroundImageNode = useCallback(
        async (node: CanvasNodeData) => {
            if (!node.metadata?.content) return;
            if (operationNodeIds.current.has(node.id)) return message.info("正在处理这张图片，请稍候");
            const messageKey = `canvas-subject-${node.id}`;
            operationNodeIds.current.add(node.id);
            message.loading({ key: messageKey, content: "正在识别并提取主体…", duration: 0 });
            try {
                const layers = await splitSubjectAndBackgroundDataUrl(node.metadata.content);
                const image = await uploadCanvasImage(layers.foregroundBlob);
                const childId = nanoid();
                setNodes((current) => [
                    ...current,
                    {
                        id: childId,
                        type: CanvasNodeType.Image,
                        title: "主体（透明背景）",
                        position: { x: node.position.x + node.width + 96, y: node.position.y },
                        width: node.width,
                        height: node.height,
                        metadata: { ...imageMetadata(image), prompt: node.metadata?.prompt, layerName: "主体（透明背景）", sourceLayerNodeId: node.id },
                    },
                ]);
                setConnections((current) => [...current, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
                setSelectedNodeIds(new Set([childId]));
                setSelectedConnectionId(null);
                setToolbarNodeId(childId);
                setDialogNodeId(childId);
                message.success({ key: messageKey, content: "已生成透明主体图层" });
            } catch (error) {
                message.destroy(messageKey);
                throw error;
            } finally {
                operationNodeIds.current.delete(node.id);
            }
        },
        [message, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId],
    );

    const splitImageLayers = useCallback(
        async (node: CanvasNodeData) => {
            if (!node.metadata?.content) return;
            if (operationNodeIds.current.has(node.id)) return message.info("正在处理这张图片，请稍候");
            const config = buildGenerationConfig(effectiveConfig, node, "image");
            if (!isAiConfigReady(config, config.model)) {
                openConfigDialog(true);
                return;
            }

            const messageKey = `canvas-layers-${node.id}`;
            const layerNodeId = nanoid();
            let controller: AbortController | undefined;
            operationNodeIds.current.add(node.id);
            message.loading({ key: messageKey, content: "正在请求上游分层…", duration: 0 });
            try {
                const source = await stableLayerSource(node, setNodes);
                const layerNode = pendingLayerNode(node, layerNodeId, config.model, config.size, config.quality, source);
                setNodes((current) => [...current, layerNode]);
                setConnections((current) => [...current, { id: nanoid(), fromNodeId: node.id, toNodeId: layerNodeId }]);
                setSelectedNodeIds(new Set([layerNodeId]));
                setSelectedConnectionId(null);
                setToolbarNodeId(layerNodeId);
                setDialogNodeId(layerNodeId);
                setRunningNodeId(layerNodeId);

                controller = startGenerationRequest(layerNodeId, node.id, layerNodeId);
                const images = await startAndCompleteImageTask(layerNodeId, config, IMAGE_LAYER_PROMPT, [source], undefined, controller, {
                    outputMode: "layers",
                });
                if (!images.length) throw new Error("上游分层任务没有返回图片");
                message.success({ key: messageKey, content: `上游已返回 ${images.length} 个图层` });
            } catch (error) {
                if (isGenerationCanceled(error)) {
                    message.destroy(messageKey);
                    return;
                }
                const errorDetails = error instanceof Error ? error.message : "分层失败";
                if (isGenerationTaskNeedsReviewError(error)) setNodes((current) => pauseCanvasGenerationReview(current, [layerNodeId], errorDetails));
                else setNodes((current) => current.map((item) => (item.id === layerNodeId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, imageTask: undefined } } : item)));
                message.error({ key: messageKey, content: errorDetails });
            } finally {
                if (controller) finishGenerationRequest(layerNodeId, controller);
                operationNodeIds.current.delete(node.id);
                setRunningNodeId(null);
            }
        },
        [
            effectiveConfig,
            finishGenerationRequest,
            isAiConfigReady,
            message,
            openConfigDialog,
            setConnections,
            setDialogNodeId,
            setNodes,
            setRunningNodeId,
            setSelectedConnectionId,
            setSelectedNodeIds,
            setToolbarNodeId,
            startAndCompleteImageTask,
            startGenerationRequest,
        ],
    );

    return { removeBackgroundImageNode, splitImageLayers };
}

async function stableLayerSource(node: CanvasNodeData, setNodes: CanvasPageState["setNodes"]): Promise<ReferenceImage> {
    let source = canvasNodeReferenceImage(node);
    if (/^(data:|blob:)/i.test(source.dataUrl)) {
        const stored = await uploadCanvasImage(source.dataUrl);
        source = referenceFromUpload(stored, node.id, "source.png");
        setNodes((current) => current.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...imageMetadata(stored) } } : item)));
    }
    return source;
}

function pendingLayerNode(node: CanvasNodeData, id: string, model: string, size: string | undefined, quality: string | undefined, source: ReferenceImage): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: `${node.title || "图片"} · 分层中`,
        position: { x: node.position.x + node.width + 96, y: node.position.y },
        width: node.width,
        height: node.height,
        metadata: {
            prompt: IMAGE_LAYER_PROMPT,
            status: NODE_STATUS_LOADING,
            generationType: "edit",
            model,
            size,
            quality,
            references: [source.serverUrl || source.remoteUrl || source.url || source.dataUrl].filter(Boolean),
            imageOutputMode: "layers",
            layerName: "分层结果",
            sourceLayerNodeId: node.id,
        },
    };
}

function referenceFromUpload(image: UploadedImage, id: string, name: string): ReferenceImage {
    const dataUrl = image.serverUrl || image.url;
    return { id, name, type: image.mimeType || "image/png", dataUrl, url: dataUrl, serverUrl: dataUrl, storageKey: image.storageKey, width: image.width, height: image.height };
}
