"use client";

import { useCallback, useRef } from "react";

import { requestCanvasImageDecomposition } from "@/services/api/canvas-image-decomposition";
import { isGenerationTaskNeedsReviewError } from "@/services/api/generation-task-state";
import { nanoid } from "nanoid";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { buildCanvasImageDecompositionData, splitSubjectAndBackgroundDataUrl } from "../utils/canvas-image-data";
import { createLocalCanvasLayerNode, runCanvasBackgroundLayer, stableCanvasLayerSource } from "./canvas-image-layer-runtime";
import { NODE_STATUS_LOADING } from "./canvas-page-elements";
import { pauseCanvasGenerationReview } from "./canvas-generation-review";
import { buildGenerationConfig, buildImageGenerationMetadata, imageMetadata, isGenerationCanceled, uploadCanvasImage } from "./canvas-page-utils";
import type { CanvasPageState } from "./use-canvas-page-state";
import type { CanvasTaskRuntime } from "./use-canvas-task-runtime";

export function useCanvasImageLayerActions({ state, tasks }: { state: CanvasPageState; tasks: CanvasTaskRuntime }) {
    const { message, effectiveConfig, isAiConfigReady, nodes, openConfigDialog, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setToolbarNodeId, setDialogNodeId, setRunningNodeId } = state;
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
            const baseConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(baseConfig, baseConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const messageKey = `canvas-layers-${node.id}`;
            operationNodeIds.current.add(node.id);
            message.loading({ key: messageKey, content: "正在识别并本地切割独立元素…", duration: 0 });
            try {
                const source = await stableCanvasLayerSource(node, setNodes);
                const decomposition = await requestCanvasImageDecomposition({ requestId: nanoid(), source: source.serverUrl || source.url || source.dataUrl });
                if (decomposition.strategy === "subject") {
                    const subject = await splitSubjectAndBackgroundDataUrl(node.metadata.content);
                    const [foreground, mask] = await Promise.all([uploadCanvasImage(subject.foregroundBlob), uploadCanvasImage(subject.editMaskBlob)]);
                    const foregroundNode = createLocalCanvasLayerNode(node, nanoid(), "主体", foreground, nodes);
                    setNodes((current) => [...current, foregroundNode]);
                    setConnections((current) => [...current, { id: nanoid(), fromNodeId: node.id, toNodeId: foregroundNode.id }]);
                    setSelectedNodeIds(new Set([foregroundNode.id]));
                    setSelectedConnectionId(null);
                    setToolbarNodeId(foregroundNode.id);
                    const background = await runCanvasBackgroundLayer({
                        sourceNode: node,
                        source,
                        config: { ...baseConfig, size: `${subject.width}x${subject.height}` },
                        mask,
                        validationMask: mask,
                        prompt: "移除主体并自然补全被遮挡的背景，保持原图背景、构图、光线、色彩和尺寸，主体之外不要修改。",
                        occupiedNodes: [...nodes, foregroundNode],
                        messageKey,
                        state,
                        tasks,
                    });
                    if (background) message.success({ key: messageKey, content: "已生成独立主体和背景图层" });
                    return;
                }

                const local = await buildCanvasImageDecompositionData(node.metadata.content, decomposition, ({ completed, total, name }) => {
                    message.loading({ key: messageKey, content: `正在本地切割 ${name}（${completed}/${total}）…`, duration: 0 });
                });
                if (!local.layers.length) throw new Error("没有识别到可独立分层的元素");
                const [mask, validationMask, uploadedLayers] = await Promise.all([
                    uploadCanvasImage(local.editMaskBlob),
                    uploadCanvasImage(local.validationMaskBlob),
                    Promise.all(local.layers.map(async (layer) => ({ ...layer, image: await uploadCanvasImage(layer.blob) }))),
                ]);
                const layerNodes: CanvasNodeData[] = [];
                for (const { candidate, image } of uploadedLayers) {
                    layerNodes.push(
                        createLocalCanvasLayerNode(node, nanoid(), candidate.name, image, [...nodes, ...layerNodes], {
                            kind: candidate.kind,
                            bbox: candidate.bbox,
                            zIndex: candidate.zIndex,
                            groupId: candidate.groupId,
                            sourceWidth: decomposition.width,
                            sourceHeight: decomposition.height,
                        }),
                    );
                }
                setNodes((current) => [...current, ...layerNodes]);
                setConnections((current) => [...current, ...layerNodes.map((layer) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: layer.id }))]);
                setSelectedNodeIds(new Set(layerNodes.map((layer) => layer.id)));
                setSelectedConnectionId(null);
                setToolbarNodeId(layerNodes[0]?.id || null);

                let completed = 0;
                let failed = 0;
                for (const [index, layerNode] of layerNodes.entries()) {
                    const uploaded = uploadedLayers[index];
                    const { bbox } = uploaded.candidate;
                    const config = { ...baseConfig, size: `${local.width}x${local.height}` };
                    const prompt = `从完整主图中精准提取“${uploaded.candidate.name}”为独立透明图层。目标位于原图 ${decomposition.width}x${decomposition.height} 坐标 x=${bbox.x}, y=${bbox.y}, width=${bbox.width}, height=${bbox.height}。只保留该完整元素，移除其余画面并输出真实透明 Alpha PNG；保持原有文字、颜色、结构、比例和清晰边缘，不得新增、重绘、改写或混入其他元素。`;
                    setNodes((current) =>
                        current.map((item) =>
                            item.id === layerNode.id
                                ? {
                                      ...item,
                                      metadata: {
                                          ...item.metadata,
                                          ...buildImageGenerationMetadata("edit", config, 1, [source]),
                                          prompt,
                                          status: NODE_STATUS_LOADING,
                                          imageOutputBackground: "transparent",
                                          errorDetails: undefined,
                                      },
                                  }
                                : item,
                        ),
                    );
                    message.loading({ key: messageKey, content: `正在请求 ${uploaded.candidate.name}（${index + 1}/${layerNodes.length}）…`, duration: 0 });
                    const controller = startGenerationRequest(layerNode.id, node.id, layerNode.id);
                    setRunningNodeId(layerNode.id);
                    try {
                        await startAndCompleteImageTask(layerNode.id, config, prompt, [source], undefined, controller, { outputBackground: "transparent" });
                        completed += 1;
                    } catch (error) {
                        if (isGenerationCanceled(error)) {
                            message.destroy(messageKey);
                            setNodes((current) => current.map((item) => (item.id === layerNode.id ? { ...item, metadata: { ...item.metadata, status: "success", imageTask: undefined, errorDetails: undefined } } : item)));
                            return;
                        }
                        failed += 1;
                        const errorDetails = error instanceof Error ? error.message : `${uploaded.candidate.name}分层失败`;
                        if (isGenerationTaskNeedsReviewError(error)) setNodes((current) => pauseCanvasGenerationReview(current, [layerNode.id], errorDetails));
                        else
                            setNodes((current) =>
                                current.map((item) =>
                                    item.id === layerNode.id
                                        ? {
                                              ...item,
                                              metadata: {
                                                  ...item.metadata,
                                                  status: "success",
                                                  imageTask: undefined,
                                                  errorDetails: `上游精修失败，已保留本地切割：${errorDetails}`,
                                              },
                                          }
                                        : item,
                                ),
                            );
                    } finally {
                        finishGenerationRequest(layerNode.id, controller);
                        setRunningNodeId(null);
                    }
                }

                const preservedVisuals = decomposition.backgroundPreservedVisuals.length ? `必须保留这些背景内嵌视觉：${decomposition.backgroundPreservedVisuals.join("、")}。` : "";
                const backgroundPrompt = `移除蒙版覆盖的全部独立前景元素并自然补全被遮挡的背景，保持原图背景、构图、光线、色彩和尺寸，蒙版外不要修改。${preservedVisuals}${decomposition.backgroundDescription ? `背景应延续：${decomposition.backgroundDescription}` : ""}`;
                const background = await runCanvasBackgroundLayer({
                    sourceNode: node,
                    source,
                    config: { ...baseConfig, size: `${local.width}x${local.height}` },
                    mask,
                    validationMask,
                    prompt: backgroundPrompt,
                    occupiedNodes: [...nodes, ...layerNodes],
                    messageKey,
                    state,
                    tasks,
                });
                if (!background) failed += 1;
                const resultText = `${completed} 个元素已完成${background ? "，背景已补全" : ""}`;
                if (failed) message.warning({ key: messageKey, content: `${resultText}，${failed} 项失败，可保留本地切割结果` });
                else message.success({ key: messageKey, content: resultText });
            } catch (error) {
                const errorDetails = error instanceof Error ? error.message : "分层失败";
                message.error({ key: messageKey, content: errorDetails });
            } finally {
                operationNodeIds.current.delete(node.id);
                setRunningNodeId(null);
            }
        },
        [
            effectiveConfig,
            finishGenerationRequest,
            isAiConfigReady,
            message,
            nodes,
            openConfigDialog,
            setConnections,
            setNodes,
            setRunningNodeId,
            setSelectedConnectionId,
            setSelectedNodeIds,
            setToolbarNodeId,
            startAndCompleteImageTask,
            startGenerationRequest,
            state,
            tasks,
        ],
    );

    return { removeBackgroundImageNode, splitImageLayers };
}
