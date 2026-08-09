import type { CreativeRunEvent } from "@/lib/creative-runtime-contract";
import { toSafeGenerationErrorMessage } from "./generation-errors";
import type { AgentRun, AgentRunTask } from "./agent-run-store";

export function publicAgentRun(run: AgentRun) {
    return {
        id: run.id,
        conversationId: run.conversationId,
        inputMessageId: run.inputMessageId,
        assistantMessageId: run.assistantMessageId,
        surface: run.surface,
        projectId: run.projectId,
        status: run.status,
        prompt: run.prompt,
        referencedAssetIds: run.referencedAssetIds || [],
        selectedSkillIds: run.selectedSkillIds,
        requestedModelIds: run.requestedModelIds,
        generationPreferences: run.generationPreferences,
        assetIds: run.assetIds || [],
        tasks: (run.tasks || []).map(publicAgentRunTask),
        cancellation: run.cancellation ? { pendingCount: run.cancellation.pendingChildTaskIds.length } : undefined,
        timings: run.timings,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
    };
}

export function publicAgentRunSnapshot(run: AgentRun) {
    const value = publicAgentRun(run);
    return { id: value.id, status: value.status, tasks: value.tasks, cancellation: value.cancellation, timings: value.timings, updatedAt: value.updatedAt };
}

export function publicAgentRunEvent(event: CreativeRunEvent): CreativeRunEvent {
    if (event.type.startsWith("run.review.")) return { ...event, data: undefined };
    if (event.type === "run.cancel.pending") return { ...event, data: { pendingCount: arrayValue(recordValue(event.data).pendingTaskIds).length } };
    if (event.type === "canvas.ops") {
        const data = recordValue(event.data);
        return { ...event, data: { ...(textValue(data.reply) ? { reply: textValue(data.reply) } : {}), ops: publicCanvasOps(arrayValue(data.ops)) } };
    }
    return event;
}

function publicAgentRunTask(task: AgentRunTask) {
    return {
        id: task.id,
        title: task.title,
        type: task.type,
        model: task.model,
        ratio: task.ratio,
        quality: task.quality,
        seconds: task.seconds,
        voice: task.voice,
        format: task.format,
        generateAudio: task.generateAudio,
        watermark: task.watermark,
        speed: task.speed,
        count: task.count,
        status: task.status,
        error: task.error ? toSafeGenerationErrorMessage(task.error, "生成任务失败") : undefined,
    };
}

function publicCanvasOps(value: unknown[]) {
    const ops = value.map(recordValue);
    const internalNodeIds = new Set(ops.flatMap((op) => (op.type === "add_node" && (op.nodeType === "brief" || op.nodeType === "brand-kit") && typeof op.id === "string" ? [op.id] : [])));
    return ops
        .filter((op) => {
            if (typeof op.id === "string" && internalNodeIds.has(op.id)) return false;
            if (op.type === "connect_nodes" && ((typeof op.fromNodeId === "string" && internalNodeIds.has(op.fromNodeId)) || (typeof op.toNodeId === "string" && internalNodeIds.has(op.toNodeId)))) return false;
            return true;
        })
        .map((op) => {
            const metadata = recordValue(op.metadata);
            if (!Object.keys(metadata).length) return op;
            const { prompt: _prompt, agentBrief: _agentBrief, brandKit: _brandKit, foundation: _foundation, review: _review, resolvedPrompt: _resolvedPrompt, ...publicMetadata } = metadata;
            return { ...op, metadata: publicMetadata };
        });
}

function recordValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function textValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
