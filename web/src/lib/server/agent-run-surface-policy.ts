import type { AuthSettings } from "@/lib/auth/store";
import type { CreativeAsset, CreativeConversationContext, CreativeSurface } from "@/lib/creative-runtime-contract";
import type { AgentRun, AgentRunPlannerContextSummary, AgentRunTask } from "@/lib/server/agent-run-store";
import type { AgentPlan } from "@/lib/server/agent-run-validation";
import { resolveAgentPlanningProfile } from "@/lib/server/agent-run-planning-profile";

export function availableAgentSkills(settings: AuthSettings, surface: CreativeSurface) {
    const workspaces = surface === "canvas" ? new Set(["canvas"]) : surface === "drama" ? new Set(["drama"]) : new Set(["image", "video", "drama"]);
    return settings.agentSkills.filter((skill) => skill.enabled && (skill.workspaces || ["image"]).some((workspace) => workspaces.has(workspace)));
}

export function selectAgentSkills(settings: AuthSettings, surface: CreativeSurface, requestedSkillIds: string[] = []) {
    const available = new Map(availableAgentSkills(settings, surface).map((skill) => [skill.id, skill]));
    return Array.from(new Set(requestedSkillIds.map((id) => id.trim()).filter(Boolean))).flatMap((id) => (available.has(id) ? [available.get(id)!] : []));
}

export function plannerAgentSkills(settings: AuthSettings, run: Pick<AgentRun, "surface" | "selectedSkillIds">) {
    return selectAgentSkills(settings, run.surface, run.selectedSkillIds || []);
}

export function agentPlannerSystemPrompt(surface: CreativeSurface, fallbackExample: string) {
    const identity =
        surface === "canvas"
            ? "你是 VOZEB PRO 画布创作 Agent，也能进行普通对话。"
            : surface === "drama"
              ? "你是 VOZEB PRO 短剧项目创作 Agent，负责围绕当前项目规划文本、图片、视频和音频产物，也能进行普通对话。"
              : "你是 VOZEB PRO 统一创作 Agent，负责通过一个对话入口规划并生成文本、图片、视频和音频产物，也能进行普通对话。";
    const surfaceRules =
        surface === "canvas"
            ? "明确要求创建、修改、删除、移动、连接画布节点，或生成媒体产物时为 generation。用户要求修改已有画布产物时必须填写该节点真实 targetNodeId。选中文本/提示词节点并要求修改、优化或改写时，只规划一个 type=text 的原位编辑任务，targetNodeId 必须是该文本节点；除非用户同时明确要求生成媒体，否则禁止规划图片、视频或音频任务。canvasSnapshot.selectedNodeIds 是用户本轮明确选中并展示在输入框中的附件：非空时，当前编辑任务必须优先且只能从这些节点选择 targetNodeId，禁止被 conversationContext 的上一张、旧主体或其他未选中画布节点覆盖；只有本轮没有选中节点时，才允许结合会话记忆选择旧节点。"
            : "明确要求生成或修改文本、图片、视频、音频产物时为 generation。禁止创建、更新、删除或连接任何 Canvas 节点，targetNodeId 必须省略。";
    const projectRule =
        surface === "drama" ? "短剧项目中的角色、场景、多镜头和依赖生产默认是 complex，并保持项目视觉与叙事一致。" : surface === "canvas" ? "Canvas 的品牌系列、多物料和依赖生产默认是 complex。" : "多物料、系列内容和依赖生产默认是 complex。";
    const handoffRule =
        surface === "chat"
            ? "只有用户原文明确要求创建、建立或整理成画布/短剧项目时才填写 projectHandoff；生成短视频、短片、图片或系列媒体不等于创建项目，必须省略 projectHandoff。只做明确项目交接且无需新产物时允许 deliverables=[]。projectHandoff.assetIds 只能引用 referencedAssets，当前 Run 新生成的资产会由服务端自动合并。"
            : "当前入口不得填写 projectHandoff。";
    return `${identity}先结合 conversationContext 的长期摘要和近期消息理解用户的自然语言、指代和连续创作关系，再判断 intent：问候、闲聊、能力咨询、使用说明和知识问答为 conversation；${surfaceRules}conversation 必须 deliverables=[]、decisions=[]，直接在 reply 回答。generationPreferences.mode 非空时代表用户本轮明确选择的产物类型，必须按该类型执行 generation，deliverables 只能使用该媒体类型；generationPreferences 中该类型的尺寸、画质、时长、音色和格式是用户本轮明确参数，不得改选。视频 generationPreferences.referenceMode、firstFrameAssetId 和 lastFrameAssetId 是用户显式指定的首尾帧角色，必须规划视频任务且不得猜测、交换、删除或改成普通参考图；服务端会强制注入对应资产。generation 必须先形成 foundation：brief 说明目标、受众、使用场景、核心信息、约束和参考素材策略；direction 给出一个明确推荐的风格、构图/镜头、色彩、光线、视觉关键词和避免事项。${projectRule}${handoffRule}requestedSkillIds 非空时必须使用且只使用这些技能；requestedSkillIds 为空时 skillIds 必须为空，不得自动选择任何普通 Skill。没有 Skill 时仍需执行提示词优化、视觉方向、模型选择和参数规划。referenceContext.source=current-turn-explicit 表示 referencedAssets 是本轮用户明确附件，必须优先且排他；source=conversation-memory-candidates 表示它们只是同会话最近成功媒体候选，只有自然语义明确延续、修改、变体或保持上一轮主体/场景时，才把确需使用的资产 ID 写入 deliverable.assetIds，新主题、独立创作或无法确认时不得引用。随后规划整套 deliverables 和依赖顺序，并主动从 availableModels 中为每个产物选择能力匹配的逻辑模型，决定画幅、质量、数量、时长、音色或格式。只能引用 referencedAssets 中存在的资产 ID；需要使用一个或多个资产时，将它们写入对应 deliverable.assetIds。每个 deliverable 的 prompt 必须执行同一 foundation，保持主体、信息、色彩和视觉语言一致。不要盲目照抄默认值，默认值只在没有更明确判断时作为兜底。严格遵守 planningBudget.maxOutputTokens，优先保留可执行参数并压缩解释。reply 用自然中文概括推荐方向；decisions 用 2–6 项说明“选择了什么、为什么”；每个 deliverable 必须填写 model。优先调用 create_agent_plan；若渠道不支持工具调用，必须直接返回与函数参数完全一致的单个 JSON 对象，不要 Markdown 或额外文本，严格仿照这个完整结构：${fallbackExample}。不得暴露隐藏思维链，只输出可验证的决策摘要。`;
}

export function agentPlannerInput(
    run: AgentRun,
    conversationContext: CreativeConversationContext,
    referencedAssets: CreativeAsset[],
    referenceSource: "current-turn-explicit" | "conversation-memory-candidates" | "none",
    availableSkills: AuthSettings["agentSkills"],
    availableModels: Array<{ id: string; name: string; capability: string }>,
    settings: AuthSettings,
) {
    return buildAgentPlannerInput(run, conversationContext, referencedAssets, referenceSource, availableSkills, availableModels, settings).input;
}

export function buildAgentPlannerInput(
    run: AgentRun,
    conversationContext: CreativeConversationContext,
    referencedAssets: CreativeAsset[],
    referenceSource: "current-turn-explicit" | "conversation-memory-candidates" | "none",
    availableSkills: AuthSettings["agentSkills"],
    availableModels: Array<{ id: string; name: string; capability: string }>,
    settings: AuthSettings,
): { input: Record<string, unknown>; summary: AgentRunPlannerContextSummary } {
    const planningProfile = resolveAgentPlanningProfile(run);
    const selectedNodeIds = run.surface === "canvas" ? selectedCanvasNodeIds(run.snapshot) : [];
    const prioritizedModels = prioritizeAgentPlannerModels(availableModels, run, settings);
    const payload = {
        requirement: run.prompt,
        conversationContext: {
            summary: conversationContext.summary,
            recentMessages: conversationContext.recentMessages.map((item) => ({ role: item.role, content: item.content, sequence: item.sequence })),
        },
        surface: run.surface,
        ...(run.projectId ? { projectId: run.projectId } : {}),
        ...(run.surface === "canvas" ? { canvasSnapshot: compactCanvasSnapshot(run.snapshot) } : run.surface === "drama" ? { projectSnapshot: compactProjectSnapshot(run.snapshot) } : {}),
        ...(selectedNodeIds.length ? { currentTurnSelection: { selectedNodeIds, rule: "这些节点是本轮明确附件；编辑任务不得改用历史节点" } } : {}),
        referenceContext: { source: referenceSource },
        referencedAssets: referencedAssets.map(plannerAssetSummary),
        requestedSkillIds: run.selectedSkillIds || [],
        ...(run.generationPreferences ? { generationPreferences: run.generationPreferences } : {}),
        availableSkills: availableSkills.map(plannerSkillSummary),
        availableModels: prioritizedModels,
        defaultModels: settings.defaultModels,
        generationDefaults: settings.generationDefaults,
        planningBudget: { complexity: planningProfile.complexity, maxOutputTokens: planningProfile.maxOutputTokens },
    };
    return fitPlannerInput(payload, planningProfile.maxInputChars, {
        referenceSource,
        protectedModelIds: protectedPlannerModelIds(run, settings, planningProfile.capabilities),
    });
}

export function prioritizeAgentPlannerModels<T extends { id: string; capability: string }>(models: T[], run: Pick<AgentRun, "requestedModelIds" | "surface" | "prompt" | "snapshot" | "generationPreferences">, settings: AuthSettings) {
    const profile = resolveAgentPlanningProfile(run);
    const requestedOrder = new Map((run.requestedModelIds || []).map((id, index) => [id, index]));
    const defaultOrder = new Map(defaultPlannerModelIds(settings, profile.capabilities).map((id, index) => [id, index]));
    return models
        .map((model, index) => ({ model, index }))
        .sort((left, right) => modelPriority(left.model.id, requestedOrder, defaultOrder) - modelPriority(right.model.id, requestedOrder, defaultOrder) || left.index - right.index)
        .map(({ model }) => model);
}

function plannerSkillSummary(skill: AuthSettings["agentSkills"][number]) {
    return {
        id: skill.id,
        name: skill.name,
        plannerSummary: (skill.plannerSummary || skill.description || skill.instructions).slice(0, 240),
        workspaces: skill.workspaces || ["image"],
    };
}

export function compactCanvasSnapshot(snapshot: unknown) {
    const source = record(snapshot);
    const selectedNodeIds = selectedCanvasNodeIds(snapshot);
    const selected = new Set(selectedNodeIds);
    const connections = records(source.connections).filter((connection) => {
        const from = text(connection.fromNodeId);
        const to = text(connection.toNodeId);
        return selected.has(from) || selected.has(to);
    });
    for (const connection of connections) {
        selected.add(text(connection.fromNodeId));
        selected.add(text(connection.toNodeId));
    }
    const nodes = records(source.nodes)
        .filter((node) => selected.has(text(node.id)) || node.type === "config")
        .slice(0, 20)
        .map(compactCanvasNode);
    return {
        projectId: text(source.projectId),
        title: text(source.title).slice(0, 160),
        imageSize: text(source.imageSize).slice(0, 40),
        selectedNodeIds,
        nodes,
        connections: connections.slice(0, 30).map((connection) => ({ id: text(connection.id), fromNodeId: text(connection.fromNodeId), toNodeId: text(connection.toNodeId) })),
    };
}

function compactCanvasNode(node: Record<string, unknown>) {
    const metadata = record(node.metadata);
    return {
        id: text(node.id),
        type: text(node.type),
        title: text(node.title).slice(0, 160),
        width: number(node.width),
        height: number(node.height),
        metadata: {
            size: text(metadata.size).slice(0, 40),
            content: text(metadata.content || metadata.prompt).slice(0, 600),
            url: text(metadata.serverUrl || metadata.remoteUrl || metadata.url).slice(0, 1000),
            naturalWidth: number(metadata.naturalWidth),
            naturalHeight: number(metadata.naturalHeight),
        },
    };
}

function compactProjectSnapshot(snapshot: unknown) {
    const source = record(snapshot);
    return Object.fromEntries(
        Object.entries(source)
            .slice(0, 30)
            .map(([key, value]) => [key, compactValue(value, 0)]),
    );
}

function compactValue(value: unknown, depth: number): unknown {
    if (typeof value === "string") return value.slice(0, 800);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (depth >= 3) return undefined;
    if (Array.isArray(value)) return value.slice(0, 12).map((item) => compactValue(item, depth + 1));
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 24)
                .map(([key, item]) => [key, compactValue(item, depth + 1)]),
        );
    return undefined;
}

function fitPlannerInput(payload: Record<string, unknown>, maxChars: number, options: { referenceSource: "current-turn-explicit" | "conversation-memory-candidates" | "none"; protectedModelIds: Set<string> }) {
    const input = structuredClone(payload);
    const original = plannerContextIds(input);
    const context = record(input.conversationContext);
    const messages = records(context.recentMessages);
    context.recentMessages = messages;
    input.conversationContext = context;

    const latestMessage = messages.at(-1);
    while (serializedLength(input) > maxChars && messages.length && messages[0] !== latestMessage) messages.shift();
    shrinkRecordTextToFit(input, context, "summary", maxChars);
    compactRecordsToFit(input, messages, ["content"], maxChars);

    const assets = records(input.referencedAssets);
    input.referencedAssets = assets;
    if (options.referenceSource === "conversation-memory-candidates") while (serializedLength(input) > maxChars && assets.length) assets.pop();
    else compactRecordsToFit(input, assets, ["textContent", "title", "mimeType", "url"], maxChars);

    const canvasSnapshot = record(input.canvasSnapshot);
    if (Object.keys(canvasSnapshot).length) {
        const connections = records(canvasSnapshot.connections);
        canvasSnapshot.connections = connections;
        while (serializedLength(input) > maxChars && connections.length) connections.pop();
        const selected = new Set(strings(canvasSnapshot.selectedNodeIds));
        const nodes = records(canvasSnapshot.nodes);
        canvasSnapshot.nodes = nodes;
        removeUnprotectedRecordsToFit(input, nodes, (node) => selected.has(text(node.id)) || text(node.type) === "config", maxChars);
        compactRecordsToFit(
            input,
            nodes.map((node) => record(node.metadata)),
            ["content", "url"],
            maxChars,
        );
    }

    const projectSnapshot = record(input.projectSnapshot);
    const projectKeys = Object.keys(projectSnapshot);
    while (serializedLength(input) > maxChars && projectKeys.length) delete projectSnapshot[projectKeys.pop()!];

    const skills = records(input.availableSkills);
    input.availableSkills = skills;
    compactRecordsToFit(input, skills, ["plannerSummary", "name", "workspaces"], maxChars);

    const models = records(input.availableModels);
    input.availableModels = models;
    compactRecordsToFit(input, models, ["name"], maxChars);
    removeUnprotectedRecordsToFit(input, models, (model) => options.protectedModelIds.has(text(model.id)), maxChars);

    shrinkRecordTextToFit(input, input, "requirement", maxChars);
    while (serializedLength(input) > maxChars && skills.length) skills.pop();
    while (serializedLength(input) > maxChars && assets.length && options.referenceSource !== "current-turn-explicit") assets.pop();

    const final = plannerContextIds(input);
    const summary: AgentRunPlannerContextSummary = {
        maxInputChars: maxChars,
        serializedChars: serializedLength(input),
        kept: final,
        omitted: {
            modelIds: difference(original.modelIds, final.modelIds),
            skillIds: difference(original.skillIds, final.skillIds),
            assetIds: difference(original.assetIds, final.assetIds),
            recentMessageSequences: differenceNumbers(original.recentMessageSequences, final.recentMessageSequences),
        },
    };
    return { input, summary };
}

function protectedPlannerModelIds(run: Pick<AgentRun, "requestedModelIds">, settings: AuthSettings, capabilities: Set<string>) {
    return new Set([...(run.requestedModelIds || []), ...defaultPlannerModelIds(settings, capabilities)].map((id) => id.trim()).filter(Boolean));
}

function defaultPlannerModelIds(settings: AuthSettings, capabilities: Set<string>) {
    return [
        ["text", settings.defaultModels.textModel],
        ["image", settings.defaultModels.imageModel],
        ["video", settings.defaultModels.videoModel],
        ["audio", settings.defaultModels.audioModel],
    ].flatMap(([capability, id]) => (capabilities.has(capability) && id ? [id] : []));
}

function modelPriority(id: string, requested: Map<string, number>, defaults: Map<string, number>) {
    if (requested.has(id)) return requested.get(id)!;
    if (defaults.has(id)) return requested.size + defaults.get(id)!;
    return requested.size + defaults.size;
}

function shrinkRecordTextToFit(root: Record<string, unknown>, target: Record<string, unknown>, key: string, maxChars: number) {
    let value = text(target[key]);
    while (serializedLength(root) > maxChars && value) {
        const overflow = serializedLength(root) - maxChars;
        value = value.slice(0, Math.max(0, value.length - Math.max(1, overflow)));
        target[key] = value;
    }
}

function compactRecordsToFit(root: Record<string, unknown>, values: Array<Record<string, unknown>>, keys: string[], maxChars: number) {
    for (const key of keys) {
        for (let index = values.length - 1; index >= 0 && serializedLength(root) > maxChars; index -= 1) delete values[index][key];
    }
}

function removeUnprotectedRecordsToFit(root: Record<string, unknown>, values: Array<Record<string, unknown>>, protectedRecord: (value: Record<string, unknown>) => boolean, maxChars: number) {
    for (let index = values.length - 1; index >= 0 && serializedLength(root) > maxChars; index -= 1) {
        if (!protectedRecord(values[index])) values.splice(index, 1);
    }
}

function plannerContextIds(input: Record<string, unknown>) {
    return {
        modelIds: records(input.availableModels)
            .map((item) => text(item.id))
            .filter(Boolean),
        skillIds: records(input.availableSkills)
            .map((item) => text(item.id))
            .filter(Boolean),
        assetIds: records(input.referencedAssets)
            .map((item) => text(item.id))
            .filter(Boolean),
        recentMessageSequences: records(record(input.conversationContext).recentMessages)
            .map((item) => Number(item.sequence))
            .filter((value) => Number.isFinite(value)),
    };
}

function serializedLength(value: unknown) {
    return JSON.stringify(value).length;
}

function difference(values: string[], kept: string[]) {
    const keep = new Set(kept);
    return values.filter((value) => !keep.has(value));
}

function differenceNumbers(values: number[], kept: number[]) {
    const keep = new Set(kept);
    return values.filter((value) => !keep.has(value));
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function records(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown) {
    return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function number(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function selectedCanvasNodeIds(snapshot: unknown) {
    if (!snapshot || typeof snapshot !== "object") return [];
    const ids = (snapshot as { selectedNodeIds?: unknown }).selectedNodeIds;
    return Array.isArray(ids) ? Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))).slice(0, 20) : [];
}

export function taskPlanSummary(task: AgentRunTask) {
    return { id: task.id, title: task.title, type: task.type, model: task.model, dependencies: task.dependencies, referenceAssetIds: task.references?.map((item) => item.assetId).filter(Boolean) || [] };
}

export function conversationFallbackReply(surface: CreativeSurface) {
    if (surface === "canvas") return "在的，你可以直接告诉我想了解什么，或让我操作当前画布。";
    if (surface === "drama") return "在的，你可以直接询问当前项目，也可以让我继续创作角色、场景、分镜或媒体产物。";
    return "在的，你可以直接告诉我想了解什么，或描述你想创作的内容。";
}

export function resolveTaskReference(requestedIds: string[] | undefined, assets: Map<string, CreativeAsset>, taskType: AgentRunTask["type"]) {
    return resolveTaskReferences(requestedIds, assets, taskType)[0];
}

export function resolveTaskReferences(requestedIds: string[] | undefined, assets: Map<string, CreativeAsset>, taskType: AgentRunTask["type"]) {
    const requested = Array.from(new Set((requestedIds || []).map((id) => id.trim()).filter(Boolean)))
        .map((id) => assets.get(id))
        .filter((asset): asset is CreativeAsset => Boolean(asset));
    return requested.filter((asset) => {
        if (taskType === "image") return asset.type === "image" && Boolean(assetAccessUrl(asset));
        if (taskType === "video") return asset.type !== "text" && Boolean(assetAccessUrl(asset));
        if (taskType === "audio") return asset.type === "audio" || asset.type === "text";
        return true;
    });
}

export function assetAccessUrl(asset?: CreativeAsset) {
    if (!asset) return undefined;
    return [asset.remoteUrl, asset.serverUrl].find((value) => typeof value === "string" && value.trim() && !value.startsWith("data:"))?.trim();
}

export function creativeAssetContext(asset: CreativeAsset) {
    const content = asset.textContent?.trim();
    const url = assetAccessUrl(asset);
    return [`资产 ID：${asset.id}`, `类型：${asset.type}`, `标题：${asset.title}`, content ? `文本：${content.slice(0, 2000)}` : "", url ? `媒体地址：${url}` : ""].filter(Boolean).join("；");
}

export function agentPlanReply(_plan: AgentPlan, tasks: AgentRunTask[], surface: CreativeSurface) {
    const hasReferences = tasks.some((task) => task.targetNodeId || task.references?.length);
    if (surface === "canvas" && tasks.length === 1 && tasks[0]?.type === "text" && tasks[0].targetNodeId) return "已收到，我会直接修改当前提示词节点，不会自动生成图片。";
    if (surface === "canvas") return hasReferences ? "已收到，我会基于当前参考素材完成这次画布创作。" : "已收到，我会按你的要求完成这次画布创作。";
    if (surface === "drama") return hasReferences ? "已收到，我会基于当前项目素材继续创作。" : "已收到，我会按你的要求继续完成项目创作。";
    return hasReferences ? "已收到，我会基于当前参考素材完成这次创作。" : "已收到，我会按你的要求完成这次创作。";
}

function plannerAssetSummary(asset: CreativeAsset) {
    return {
        id: asset.id,
        type: asset.type,
        title: asset.title,
        ...(asset.textContent ? { textContent: asset.textContent.slice(0, 600) } : {}),
        ...(assetAccessUrl(asset) ? { url: assetAccessUrl(asset) } : {}),
        ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
    };
}
