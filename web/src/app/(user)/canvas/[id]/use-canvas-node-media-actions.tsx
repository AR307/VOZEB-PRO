"use client";

import { saveAs } from "file-saver";
import { useCallback, useMemo, useRef, useState } from "react";

import { getDataUrlByteSize } from "@/lib/image-utils";
import { mediaDownloadFileName } from "@/lib/media-file";
import { originalImageDownloadUrl, originalMediaDownloadUrl } from "@/lib/media-image-url";
import { requestCanvasImageDecomposition } from "@/services/api/canvas-image-decomposition";
import { isGenerationTaskNeedsReviewError } from "@/services/api/generation-task-state";
import { type UploadedImage } from "@/services/image-storage";
import { defaultConfig } from "@/stores/use-config-store";
import { nanoid } from "nanoid";
import { type CanvasImageAngleParams } from "../components/canvas-node-angle-dialog";
import { type CanvasImageCropRect } from "../components/canvas-node-crop-dialog";
import { type CanvasImageMaskEditPayload } from "../components/canvas-node-mask-edit-dialog";
import type { CanvasEmotionPayload } from "../components/canvas-node-emotion-dialog";
import { type CanvasImageSplitParams } from "../components/canvas-node-split-dialog";
import { type CanvasImageUpscaleParams } from "../components/canvas-node-upscale-dialog";
import { NODE_DEFAULT_SIZE } from "../constants";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasNodeData } from "../types";
import { buildCanvasImageDecompositionData, cropDataUrl, splitDataUrl, splitSubjectAndBackgroundDataUrl, upscaleDataUrl } from "../utils/canvas-image-data";
import { downloadCanvasMediaBundle, selectedCanvasMediaNodes } from "../utils/canvas-media-download";
import { fitNodeSize } from "../utils/canvas-node-size";

import { IMAGE_PROMPT_REVERSE_PRESET, NODE_STATUS_ERROR, NODE_STATUS_LOADING, NODE_STATUS_SUCCESS, createCanvasNode } from "./canvas-page-elements";
import { pauseCanvasGenerationReview } from "./canvas-generation-review";
import { applyNodeConfigPatch, buildAngleLabel, buildAnglePrompt, buildGenerationConfig, buildImageGenerationMetadata, canvasNodeReferenceImage, imageMetadata, isGenerationCanceled, uploadCanvasImage } from "./canvas-page-utils";

import type { CanvasInteractions } from "./use-canvas-interactions";
import type { CanvasPageState } from "./use-canvas-page-state";
import type { CanvasTaskRuntime } from "./use-canvas-task-runtime";

export function useCanvasNodeMediaActions({ state, tasks, interactions }: { state: CanvasPageState; tasks: CanvasTaskRuntime; interactions: CanvasInteractions }) {
    const {
        message,
        params,
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        addAsset,
        currentProject,
        nodes,
        selectedNodeIds,
        setNodes,
        setConnections,
        size,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setRunningNodeId,
        setDialogNodeId,
        setEditingNodeId,
        setEditRequestNonce,
        setCropNodeId,
        setMaskEditNodeId,
        setSplitNodeId,
        setEmotionNodeId,
        setUpscaleNodeId,
        setAngleNodeId,
        setCollapsingBatchIds,
        setOpeningBatchIds,
        nodesRef,
    } = state;
    const { startGenerationRequest, finishGenerationRequest, startAndCompleteImageTask } = tasks;
    const subjectOperationIdsRef = useRef(new Set<string>());
    const [selectedMediaDownloadPending, setSelectedMediaDownloadPending] = useState(false);
    const selectedMediaNodes = useMemo(() => selectedCanvasMediaNodes(nodes, selectedNodeIds), [nodes, selectedNodeIds]);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                return { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } };
            }),
        );
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                          ...node,
                          width: child.width,
                          height: child.height,
                          metadata: {
                              ...node.metadata,
                              content: child.metadata?.content,
                              primaryImageId: child.id,
                              naturalWidth: child.metadata?.naturalWidth,
                              naturalHeight: child.metadata?.naturalHeight,
                              freeResize: child.metadata?.freeResize,
                          },
                      }
                    : node,
            ),
        );
    }, []);

    const openTextEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(node.id);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((!isCanvasImageNodeType(node.type) && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        const image = isCanvasImageNodeType(node.type);
        const url = image ? originalImageDownloadUrl(node.metadata.content) : originalMediaDownloadUrl(node.metadata.content);
        saveAs(url, mediaDownloadFileName(node.id, node.metadata.mimeType, node.metadata.storageKey || node.metadata.serverUrl || node.metadata.content));
    }, []);

    const downloadSelectedMedia = useCallback(async () => {
        if (selectedMediaDownloadPending || selectedMediaNodes.length < 2) return;
        setSelectedMediaDownloadPending(true);
        try {
            const result = await downloadCanvasMediaBundle(selectedMediaNodes, currentProject?.title || "画布");
            if (result.failed) message.warning(`已下载 ${result.downloaded} 项，${result.failed} 项读取失败`);
            else message.success(`已打包下载 ${result.downloaded} 项`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量下载失败");
        } finally {
            setSelectedMediaDownloadPending(false);
        }
    }, [currentProject?.title, message, selectedMediaDownloadPending, selectedMediaNodes]);

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error("没有可保存的文本");
                await addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || "画布文本", coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success("已加入我的素材");
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error("没有可保存的视频");
                await addAsset({
                    kind: "video",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布视频",
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: {
                        url: node.metadata.content,
                        storageKey: node.metadata.storageKey,
                        remoteUrl: node.metadata.remoteUrl,
                        serverUrl: node.metadata.serverUrl,
                        width: node.metadata.naturalWidth || node.width,
                        height: node.metadata.naturalHeight || node.height,
                        bytes: node.metadata.bytes || 0,
                        mimeType: node.metadata.mimeType || "video/mp4",
                    },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的素材");
                return;
            }
            if (node.type === CanvasNodeType.Audio) {
                if (!node.metadata?.content) return message.error("没有可保存的音频");
                await addAsset({
                    kind: "audio",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布音频",
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: {
                        url: node.metadata.content,
                        storageKey: node.metadata.storageKey,
                        remoteUrl: node.metadata.remoteUrl,
                        serverUrl: node.metadata.serverUrl,
                        durationMs: node.metadata.durationMs,
                        bytes: node.metadata.bytes || 0,
                        mimeType: node.metadata.mimeType || "audio/mpeg",
                    },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的素材");
                return;
            }
            if (!node.metadata?.content) return message.error("没有可保存的图片");
            const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
            await addAsset({
                kind: "image",
                title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
                coverUrl: node.metadata.content,
                tags: [],
                source: "Canvas",
                data: {
                    dataUrl,
                    storageKey: node.metadata.storageKey,
                    remoteUrl: node.metadata.remoteUrl,
                    serverUrl: node.metadata.serverUrl,
                    width: node.metadata.naturalWidth || node.width,
                    height: node.metadata.naturalHeight || node.height,
                    bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                    mimeType: node.metadata.mimeType || "image/png",
                },
                metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
            });
            message.success("已加入我的素材");
        },
        [addAsset, message],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (!isCanvasImageNodeType(node.type) || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(CanvasNodeType.Text, { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY }, { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 }),
                title: "反推提示词",
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                    },
                ),
                title: "反推提示词配置",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id }, { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id }]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message],
    );

    const appendDerivedImageNode = useCallback((sourceNode: CanvasNodeData, image: UploadedImage, title: string, size: { width: number; height: number }, metadataPatch: Partial<NonNullable<CanvasNodeData["metadata"]>> = {}) => {
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title,
            position: { x: sourceNode.position.x + sourceNode.width + 96, y: sourceNode.position.y },
            ...size,
            metadata: { ...imageMetadata(image), prompt: sourceNode.metadata?.prompt, ...metadataPatch },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
    }, []);

    const removeBackgroundImageNode = useCallback(
        async (node: CanvasNodeData) => {
            if (!node.metadata?.content) return;
            if (subjectOperationIdsRef.current.has(node.id)) return message.info("正在处理这张图片，请稍候");
            const messageKey = `canvas-subject-${node.id}`;
            subjectOperationIdsRef.current.add(node.id);
            message.loading({ key: messageKey, content: "正在识别并提取主体…", duration: 0 });
            try {
                const layers = await splitSubjectAndBackgroundDataUrl(node.metadata.content);
                const image = await uploadCanvasImage(layers.foregroundBlob);
                appendDerivedImageNode(node, image, "主体（透明背景）", { width: node.width, height: node.height }, { layerName: "主体（透明背景）", sourceLayerNodeId: node.id });
                message.success({ key: messageKey, content: "已生成透明主体图层" });
            } catch (error) {
                message.destroy(messageKey);
                throw error;
            } finally {
                subjectOperationIdsRef.current.delete(node.id);
            }
        },
        [appendDerivedImageNode, message],
    );

    const splitImageLayers = useCallback(
        async (node: CanvasNodeData) => {
            if (!node.metadata?.content) return;
            if (subjectOperationIdsRef.current.has(node.id)) return message.info("正在处理这张图片，请稍候");
            const baseConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(baseConfig, baseConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const messageKey = `canvas-layers-${node.id}`;
            subjectOperationIdsRef.current.add(node.id);
            message.loading({ key: messageKey, content: "正在识别商品、文字和装饰元素…", duration: 0 });
            try {
                const decomposition = await requestCanvasImageDecomposition({ requestId: nanoid(), source: node.metadata.content });
                const layers = await buildCanvasImageDecompositionData(node.metadata.content, decomposition);
                message.loading({ key: messageKey, content: `已识别 ${layers.layers.length} 个元素，正在生成独立图层…`, duration: 0 });
                const [maskImage, uploadedLayers] = await Promise.all([
                    uploadCanvasImage(layers.editMaskBlob),
                    Promise.all(
                        layers.layers.map(async (layer) => ({
                            ...layer,
                            image: await uploadCanvasImage(layer.blob),
                        })),
                    ),
                ]);
                const generationConfig = { ...baseConfig, size: `${layers.width}x${layers.height}` };
                const source = canvasNodeReferenceImage(node);
                const prompt = `移除蒙版覆盖的全部前景元素并自然补全被遮挡的背景，保持原图背景、构图、光线、色彩和尺寸，蒙版外不要修改。${decomposition.backgroundDescription ? `背景应延续：${decomposition.backgroundDescription}` : ""}`;
                const backgroundId = nanoid();
                const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
                const outputX = node.position.x + node.width + 96;
                let outputY = node.position.y + node.height + 28;
                const layerNodes = uploadedLayers.map(({ candidate, image, width, height }) => {
                    const id = nanoid();
                    const displaySize = fitNodeSize(width, height, node.width, node.height);
                    const layerNode = {
                        id,
                        type: CanvasNodeType.Image,
                        title: `${node.title || "图片"} · ${candidate.name}`,
                        position: { x: outputX, y: outputY },
                        ...displaySize,
                        metadata: {
                            ...imageMetadata(image),
                            prompt: node.metadata?.prompt,
                            layerName: candidate.name,
                            sourceLayerNodeId: node.id,
                            imageLayer: { kind: candidate.kind, bbox: candidate.bbox, zIndex: candidate.zIndex, sourceWidth: decomposition.width, sourceHeight: decomposition.height },
                        },
                    } satisfies CanvasNodeData;
                    outputY += displaySize.height + 28;
                    return layerNode;
                });
                const backgroundNode: CanvasNodeData = {
                    id: backgroundId,
                    type: CanvasNodeType.Image,
                    title: `${node.title || "图片"} · 背景图层`,
                    position: { x: outputX, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: {
                        prompt,
                        status: NODE_STATUS_LOADING,
                        ...generationMetadata,
                        layerName: "背景",
                        sourceLayerNodeId: node.id,
                        imageEditMask: { storageKey: maskImage.storageKey, serverUrl: maskImage.serverUrl || maskImage.url, mimeType: maskImage.mimeType, width: maskImage.width, height: maskImage.height },
                    },
                };
                const children: CanvasNodeData[] = [backgroundNode, ...layerNodes];
                setNodes((prev) => [...prev, ...children]);
                setConnections((prev) => [...prev, ...children.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
                setSelectedNodeIds(new Set(children.map((child) => child.id)));
                setSelectedConnectionId(null);
                setDialogNodeId(backgroundId);
                setRunningNodeId(backgroundId);
                message.loading({ key: messageKey, content: `${layerNodes.length} 个元素图层已完成，正在补全背景…`, duration: 0 });
                const controller = startGenerationRequest(backgroundId, node.id, backgroundId);
                try {
                    await startAndCompleteImageTask(
                        backgroundId,
                        generationConfig,
                        prompt,
                        [source],
                        {
                            id: `${backgroundId}-mask`,
                            name: "mask.png",
                            type: maskImage.mimeType || "image/png",
                            dataUrl: maskImage.url,
                            storageKey: maskImage.storageKey,
                            serverUrl: maskImage.serverUrl || maskImage.url,
                            width: maskImage.width,
                            height: maskImage.height,
                        },
                        controller,
                    );
                    message.success({ key: messageKey, content: `已生成 ${layerNodes.length} 个元素图层和补全背景` });
                } catch (error) {
                    if (isGenerationCanceled(error)) {
                        message.destroy(messageKey);
                        return;
                    }
                    const errorDetails = error instanceof Error ? error.message : "背景补全失败";
                    const needsReview = isGenerationTaskNeedsReviewError(error);
                    if (needsReview) {
                        message.destroy(messageKey);
                        setNodes((prev) => pauseCanvasGenerationReview(prev, [backgroundId], errorDetails));
                        return;
                    }
                    message.error({ key: messageKey, content: errorDetails });
                    setNodes((prev) => prev.map((item) => (item.id === backgroundId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, imageTask: undefined } } : item)));
                } finally {
                    finishGenerationRequest(backgroundId, controller);
                    setRunningNodeId(null);
                }
            } catch (error) {
                message.destroy(messageKey);
                throw error;
            } finally {
                subjectOperationIdsRef.current.delete(node.id);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startAndCompleteImageTask, startGenerationRequest],
    );

    const cropImageNode = useCallback(
        async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
            if (!node.metadata?.content) return;
            const cropped = await cropDataUrl(node.metadata.content, crop);
            const image = await uploadCanvasImage(cropped);
            const width = Math.min(node.width, Math.max(220, image.width));
            appendDerivedImageNode(node, image, "Cropped Image", { width, height: width * (image.height / image.width) });
            setCropNodeId(null);
        },
        [appendDerivedImageNode],
    );

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            const pieces = await splitDataUrl(node.metadata.content, params);
            const gap = 16;
            const cellWidth = node.width / params.columns;
            const cellHeight = node.height / params.rows;
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const uploads = await Promise.allSettled(
                pieces.map(async (piece) => {
                    const image = await uploadCanvasImage(piece.dataUrl);
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        width: cellWidth,
                        height: cellHeight,
                        metadata: {
                            ...imageMetadata(image),
                            prompt: node.metadata?.prompt,
                        },
                    } satisfies CanvasNodeData;
                }),
            );
            const childNodes = uploads.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
            const failedCount = uploads.length - childNodes.length;
            if (!childNodes.length) throw uploads.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason || new Error("图片切分结果保存失败");
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            setSplitNodeId(null);
            if (failedCount) message.warning(`已保留 ${childNodes.length} 个切分结果，${failedCount} 个保存失败`);
            else message.success(`已切分为 ${childNodes.length} 个子节点`);
        },
        [message],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = `只修改蒙版透明区域，其他区域保持不变。${userPrompt}`;
            const childId = nanoid();
            const source = canvasNodeReferenceImage(node);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
            setMaskEditNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: userPrompt.slice(0, 32) || "局部编辑结果",
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                await startAndCompleteImageTask(childId, generationConfig, prompt, [source], { id: `${node.id}-mask`, name: "mask.png", type: "image/png", dataUrl: payload.maskDataUrl }, controller);
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                const needsReview = isGenerationTaskNeedsReviewError(error);
                if (needsReview) {
                    setNodes((prev) => pauseCanvasGenerationReview(prev, [childId], errorDetails));
                    return;
                }
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === childId
                            ? {
                                  ...item,
                                  metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, imageTask: undefined },
                              }
                            : item,
                    ),
                );
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startAndCompleteImageTask, startGenerationRequest],
    );

    const emotionEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasEmotionPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const source = canvasNodeReferenceImage(node);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
            setEmotionNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: "表情参考结果",
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: { prompt: payload.prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                await startAndCompleteImageTask(childId, generationConfig, payload.prompt, [source], undefined, controller);
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "表情参考生成失败";
                const needsReview = isGenerationTaskNeedsReviewError(error);
                if (needsReview) {
                    setNodes((prev) => pauseCanvasGenerationReview(prev, [childId], errorDetails));
                    return;
                }
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, imageTask: undefined } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startAndCompleteImageTask, startGenerationRequest],
    );

    const upscaleImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
            if (!node.metadata?.content) return;
            const upscaled = await upscaleDataUrl(node.metadata.content, params);
            const image = await uploadCanvasImage(upscaled);
            const size = fitNodeSize(image.width, image.height);
            appendDerivedImageNode(node, image, "Upscaled Image", size);
            setUpscaleNodeId(null);
        },
        [appendDerivedImageNode],
    );

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [canvasNodeReferenceImage(node)]);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                await startAndCompleteImageTask(childId, generationConfig, prompt, [canvasNodeReferenceImage(node)], undefined, controller);
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                const needsReview = isGenerationTaskNeedsReviewError(error);
                if (needsReview) {
                    setNodes((prev) => pauseCanvasGenerationReview(prev, [childId], errorDetails));
                    return;
                }
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === childId
                            ? {
                                  ...item,
                                  metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, imageTask: undefined },
                              }
                            : item,
                    ),
                );
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startAndCompleteImageTask, startGenerationRequest],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);
    return {
        toggleNodeFreeResize,
        handleNodeContentChange,
        toggleBatchExpanded,
        setBatchPrimary,
        openTextEditor,
        handleNodePromptChange,
        handleConfigNodeChange,
        downloadNodeImage,
        downloadSelectedMedia,
        selectedMediaCount: selectedMediaNodes.length,
        selectedMediaDownloadPending,
        saveNodeAsset,
        createImageReversePromptNodes,
        appendDerivedImageNode,
        cropImageNode,
        splitImageNode,
        splitImageLayers,
        removeBackgroundImageNode,
        maskEditImageNode,
        emotionEditImageNode,
        upscaleImageNode,
        generateAngleNode,
        handleFontSizeChange,
    };
}

export type CanvasNodeMediaActions = ReturnType<typeof useCanvasNodeMediaActions>;
