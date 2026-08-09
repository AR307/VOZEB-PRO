"use client";

import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isCreativeProjectHandoff, type CreativeAsset, type CreativeConversation, type CreativeGenerationPreferences, type CreativeMessage, type CreativeProjectHandoff } from "@/lib/creative-runtime-contract";
import {
    deleteCreativeConversations,
    controlCreativeAgentRun,
    createCreativeAgentRun,
    createCreativeConversation,
    getCreativeConversation,
    getCreativeAgentRun,
    listCreativeAgentRuns,
    listCreativeAssets,
    listCreativeConversationPage,
    listCreativeMessages,
    retryCreativeAgentTask,
    updateCreativeConversation,
    uploadCreativeAsset,
    watchCreativeAgentRun,
    type CreativeAgentRun,
} from "@/services/api/creative";
import { getMaterializedCreativeProject, materializeCreativeProjectHandoff, type MaterializedCreativeProject } from "@/services/creative-project-handoff";
import { agentRequirementAcknowledgement } from "@/lib/agent-requirement-acknowledgement";

import { createConversationIdFromSearch, latestResumableAgentRun } from "./create-conversation-navigation";
import { getCreateDraftAttachment, useCreateDraftAttachmentsStore } from "./use-create-draft-attachments-store";

type PendingCreateSubmission = {
    clientRequestId: string;
    generation: number;
    conversationId?: string;
    content: string;
    assetIds: string[];
    skillIds: string[];
    modelIds: string[];
    preferences?: CreativeGenerationPreferences;
    temporaryUserId: string;
    temporaryAssistantId: string;
};

type CreateSubmitOptions = {
    assetIds?: string[];
    skillIds?: string[];
    modelIds?: string[];
    preferences?: CreativeGenerationPreferences;
};

const MESSAGE_PAGE_SIZE = 50;

export function useCreateAgent() {
    const streamRef = useRef<(() => void) | null>(null);
    const conversationGenerationRef = useRef(0);
    const activeConversationRef = useRef<string | undefined>(undefined);
    const submittingRef = useRef(false);
    const failedSubmissionsRef = useRef(new Map<string, PendingCreateSubmission>());
    const refreshRequestRef = useRef(0);
    const [conversations, setConversations] = useState<CreativeConversation[]>([]);
    const [messages, setMessages] = useState<CreativeMessage[]>([]);
    const [assets, setAssets] = useState<CreativeAsset[]>([]);
    const [conversationId, setConversationId] = useState<string>();
    const [activeRunId, setActiveRunId] = useState<string>();
    const [activeRunStatus, setActiveRunStatus] = useState<CreativeAgentRun["status"]>();
    const [runDetails, setRunDetails] = useState<Record<string, CreativeAgentRun>>({});
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
    const [historyHasMore, setHistoryHasMore] = useState(false);
    const [conversationLoading, setConversationLoading] = useState(false);
    const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [projectLinks, setProjectLinks] = useState<Record<string, MaterializedCreativeProject>>({});
    const [projectErrors, setProjectErrors] = useState<Record<string, string>>({});
    const [materializingProjectId, setMaterializingProjectId] = useState<string>();
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const draftAttachments = useCreateDraftAttachmentsStore((state) => state.attachments);
    const addDraftAttachments = useCreateDraftAttachmentsStore((state) => state.add);
    const removeDraftAttachments = useCreateDraftAttachmentsStore((state) => state.remove);
    const clearDraftAttachments = useCreateDraftAttachmentsStore((state) => state.clear);
    const allAssets = useMemo(() => [...assets, ...draftAttachments.map((item) => item.asset)], [assets, draftAttachments]);
    const selectedAssetIdsWithDrafts = useMemo(() => Array.from(new Set([...selectedAssetIds, ...draftAttachments.map((item) => item.asset.id)])).slice(-20), [draftAttachments, selectedAssetIds]);

    const stopWatching = useCallback(() => {
        streamRef.current?.();
        streamRef.current = null;
    }, []);

    const refreshConversations = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const page = await listCreativeConversationPage({ source: "agent" });
            setConversations(page.conversations);
            setHistoryHasMore(page.hasMore);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const refreshAssets = useCallback(async (id: string, generation = conversationGenerationRef.current) => {
        const nextAssets = await listCreativeAssets(id);
        if (generation !== conversationGenerationRef.current || activeConversationRef.current !== id) return;
        setAssets(nextAssets);
    }, []);

    const refreshConversation = useCallback(async (id: string, generation = conversationGenerationRef.current) => {
        const requestId = ++refreshRequestRef.current;
        const [nextMessages, nextAssets] = await Promise.all([listCreativeMessages(id, undefined, MESSAGE_PAGE_SIZE), listCreativeAssets(id)]);
        if (requestId !== refreshRequestRef.current || generation !== conversationGenerationRef.current || activeConversationRef.current !== id) return;
        const runIds = Array.from(new Set(nextMessages.map((item) => item.runId).filter((value): value is string => Boolean(value))));
        const runs = await Promise.all(runIds.map((runId) => getCreativeAgentRun(runId).catch(() => null)));
        if (requestId !== refreshRequestRef.current || generation !== conversationGenerationRef.current || activeConversationRef.current !== id) return;
        setMessages(uniqueMessages(nextMessages));
        setHasOlderMessages(Boolean(nextMessages[0] && nextMessages[0].sequence > 1));
        setAssets(nextAssets);
        setSelectedAssetIds([]);
        setRunDetails((current) => {
            const next = { ...current };
            runs.forEach((run) => {
                if (run) next[run.id] = run;
            });
            return next;
        });
        const handoffs = nextMessages.map((item) => item.metadata.projectHandoff).filter(isCreativeProjectHandoff);
        const projects = await Promise.all(handoffs.map(getMaterializedCreativeProject));
        if (requestId !== refreshRequestRef.current || generation !== conversationGenerationRef.current || activeConversationRef.current !== id) return;
        setProjectLinks((current) => {
            const next = { ...current };
            handoffs.forEach((handoff, index) => {
                const project = projects[index];
                if (project) next[handoff.id] = project;
                else delete next[handoff.id];
            });
            return next;
        });
    }, []);

    const loadMoreConversations = useCallback(async () => {
        if (historyLoadingMore || !historyHasMore) return;
        setHistoryLoadingMore(true);
        try {
            const page = await listCreativeConversationPage({ source: "agent", offset: conversations.length });
            setConversations((current) => Array.from(new Map([...current, ...page.conversations].map((item) => [item.id, item])).values()));
            setHistoryHasMore(page.hasMore);
        } finally {
            setHistoryLoadingMore(false);
        }
    }, [conversations.length, historyHasMore, historyLoadingMore]);

    const loadOlderMessages = useCallback(async () => {
        const id = activeConversationRef.current;
        const firstSequence = messages[0]?.sequence;
        if (!id || !firstSequence || olderMessagesLoading || !hasOlderMessages) return;
        setOlderMessagesLoading(true);
        try {
            const older = await listCreativeMessages(id, firstSequence, MESSAGE_PAGE_SIZE);
            if (activeConversationRef.current !== id) return;
            setMessages((current) => uniqueMessages([...older, ...current]));
            setHasOlderMessages(Boolean(older[0] && older[0].sequence > 1));
        } finally {
            setOlderMessagesLoading(false);
        }
    }, [hasOlderMessages, messages, olderMessagesLoading]);

    const newConversation = useCallback(() => {
        stopWatching();
        clearDraftAttachments();
        conversationGenerationRef.current += 1;
        activeConversationRef.current = undefined;
        refreshRequestRef.current += 1;
        submittingRef.current = false;
        failedSubmissionsRef.current.clear();
        setConversationId(undefined);
        setActiveRunId(undefined);
        setActiveRunStatus(undefined);
        setMessages([]);
        setHasOlderMessages(false);
        setAssets([]);
        setSelectedAssetIds([]);
        setSending(false);
    }, [clearDraftAttachments, stopWatching]);

    const openConversation = useCallback(
        async (id: string) => {
            stopWatching();
            clearDraftAttachments();
            const generation = ++conversationGenerationRef.current;
            activeConversationRef.current = id;
            setSending(false);
            submittingRef.current = false;
            failedSubmissionsRef.current.clear();
            setActiveRunId(undefined);
            setConversationLoading(true);
            setConversationId(id);
            try {
                const conversation = await getCreativeConversation(id);
                if (conversation.surface !== "chat" || conversation.source !== "agent") throw new Error("该记录不属于创作 Agent 工作台");
                await refreshConversation(id, generation);
                setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)].sort((a, b) => b.updatedAt - a.updatedAt));
            } catch (error) {
                if (generation === conversationGenerationRef.current && activeConversationRef.current === id) newConversation();
                throw error;
            } finally {
                if (generation === conversationGenerationRef.current && activeConversationRef.current === id) setConversationLoading(false);
            }
        },
        [clearDraftAttachments, newConversation, refreshConversation, stopWatching],
    );

    useEffect(() => {
        let active = true;
        const requestedConversationId = createConversationIdFromSearch(window.location.search);
        const conversationsRequest = refreshConversations().catch(() => undefined);
        if (!requestedConversationId) {
            void Promise.all([conversationsRequest, listCreativeAgentRuns("chat")])
                .then(([, runs]) => {
                    if (!active || activeConversationRef.current) return;
                    const resumable = latestResumableAgentRun(runs);
                    if (resumable) return openConversation(resumable.conversationId);
                })
                .catch(() => undefined);
        }
        return () => {
            active = false;
            stopWatching();
        };
    }, [openConversation, refreshConversations, stopWatching]);

    const updateAssistant = useCallback((id: string, content?: string, status: CreativeMessage["status"] = "running") => {
        setMessages((current) => current.map((item) => (item.id === id ? { ...item, content: content?.trim() || item.content, status, updatedAt: Date.now() } : item)));
    }, []);

    const materializeProject = useCallback(async (handoff: CreativeProjectHandoff) => {
        setMaterializingProjectId(handoff.id);
        setProjectErrors((current) => ({ ...current, [handoff.id]: "" }));
        try {
            const result = await materializeCreativeProjectHandoff(handoff);
            setProjectLinks((current) => ({ ...current, [handoff.id]: result }));
            return result;
        } catch (error) {
            const text = error instanceof Error ? error.message : "项目创建失败";
            setProjectErrors((current) => ({ ...current, [handoff.id]: text }));
            throw error;
        } finally {
            setMaterializingProjectId(undefined);
        }
    }, []);

    const ensureConversation = useCallback(async () => {
        if (activeConversationRef.current) return activeConversationRef.current;
        const generation = conversationGenerationRef.current;
        const conversation = await createCreativeConversation({ surface: "chat", source: "agent", title: "新对话" });
        if (generation !== conversationGenerationRef.current) throw new Error("创作入口已切换，请重试");
        activeConversationRef.current = conversation.id;
        setConversationId(conversation.id);
        setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
        return conversation.id;
    }, []);

    const uploadAttachments = useCallback(
        async (files: File[]) => {
            if (!files.length) return [];
            return addDraftAttachments(files, activeConversationRef.current || "");
        },
        [addDraftAttachments],
    );

    const materializeDraftAttachments = useCallback(
        async (assetIds: string[]) => {
            const draftIds = assetIds.filter((id) => getCreateDraftAttachment(id));
            if (!draftIds.length) return { conversationId: activeConversationRef.current, assetIds, replacements: new Map<string, CreativeAsset>() };
            const replacements = new Map<string, CreativeAsset>();
            setUploading(true);
            try {
                const id = await ensureConversation();
                for (const draftId of draftIds) {
                    const draft = getCreateDraftAttachment(draftId);
                    if (draft) replacements.set(draftId, await uploadCreativeAsset(id, draft.file));
                }
                return { conversationId: id, assetIds: assetIds.map((assetId) => replacements.get(assetId)?.id || assetId), replacements };
            } finally {
                if (replacements.size) {
                    const uploadedAssets = Array.from(replacements.values());
                    setAssets((current) => [...current, ...uploadedAssets.filter((asset) => !current.some((item) => item.id === asset.id))]);
                    setSelectedAssetIds((current) => Array.from(new Set([...current, ...uploadedAssets.map((asset) => asset.id)])).slice(-20));
                    removeDraftAttachments(replacements.keys());
                }
                setUploading(false);
            }
        },
        [ensureConversation, removeDraftAttachments],
    );

    const watchRun = useCallback(
        (run: CreativeAgentRun, assistantMessageId: string, generation = conversationGenerationRef.current) => {
            streamRef.current?.();
            setActiveRunId(run.id);
            setActiveRunStatus(run.status);
            streamRef.current = watchCreativeAgentRun(run.id, {
                onProgress: (text) => {
                    if (generation === conversationGenerationRef.current && activeConversationRef.current === run.conversationId) updateAssistant(assistantMessageId, text);
                },
                onStatus: (status) => {
                    if (generation === conversationGenerationRef.current && activeConversationRef.current === run.conversationId) setActiveRunStatus(status);
                },
                onTaskCompleted: () => {
                    if (generation === conversationGenerationRef.current && activeConversationRef.current === run.conversationId) void refreshAssets(run.conversationId, generation).catch(() => undefined);
                },
                onTerminal: (status, text) => {
                    if (generation !== conversationGenerationRef.current || activeConversationRef.current !== run.conversationId) return;
                    updateAssistant(assistantMessageId, text, status === "completed" ? "completed" : status);
                    setSending(false);
                    submittingRef.current = false;
                    setActiveRunId(undefined);
                    setActiveRunStatus(undefined);
                    streamRef.current = null;
                    void Promise.all([refreshConversation(run.conversationId, generation), refreshConversations()]);
                },
                onConnectionError: (text) => {
                    if (generation !== conversationGenerationRef.current || activeConversationRef.current !== run.conversationId) return;
                    updateAssistant(assistantMessageId, text, "failed");
                    setSending(false);
                    submittingRef.current = false;
                    setActiveRunId(undefined);
                    setActiveRunStatus(undefined);
                },
                onProjectHandoff: (handoff) => {
                    if (generation !== conversationGenerationRef.current || activeConversationRef.current !== run.conversationId) return;
                    setMessages((current) => current.map((item) => (item.id === assistantMessageId ? { ...item, metadata: { ...item.metadata, projectHandoff: handoff } } : item)));
                    void materializeProject(handoff).catch(() => undefined);
                },
            });
        },
        [materializeProject, refreshAssets, refreshConversation, refreshConversations, updateAssistant],
    );

    useEffect(() => {
        if (!conversationId || sending) return;
        const running = messages.find((item) => item.role === "assistant" && item.status === "running" && item.runId);
        if (!running?.runId) return;
        void getCreativeAgentRun(running.runId)
            .then((run) => {
                setSending(true);
                submittingRef.current = true;
                watchRun(run, running.id, conversationGenerationRef.current);
            })
            .catch(() => undefined);
    }, [conversationId, messages, sending, watchRun]);

    const executeSubmission = useCallback(
        async (snapshot: PendingCreateSubmission) => {
            try {
                const created = await createCreativeAgentRun({
                    clientRequestId: snapshot.clientRequestId,
                    surface: "chat",
                    conversationId: snapshot.conversationId,
                    prompt: snapshot.content,
                    assetIds: snapshot.assetIds,
                    skillIds: snapshot.skillIds,
                    modelIds: snapshot.modelIds,
                    preferences: snapshot.preferences,
                });
                const run = created.run;
                failedSubmissionsRef.current.delete(snapshot.temporaryAssistantId);
                if (snapshot.generation !== conversationGenerationRef.current) {
                    submittingRef.current = false;
                    return true;
                }
                activeConversationRef.current = run.conversationId;
                setConversationId(run.conversationId);
                setActiveRunId(run.id);
                setRunDetails((current) => ({ ...current, [run.id]: run }));
                setMessages((current) =>
                    current.map((item) => {
                        if (item.id === snapshot.temporaryUserId) return { ...item, id: run.inputMessageId, conversationId: run.conversationId, runId: run.id };
                        if (item.id === snapshot.temporaryAssistantId) return { ...item, id: run.assistantMessageId, conversationId: run.conversationId, runId: run.id };
                        return item;
                    }),
                );
                watchRun(run, run.assistantMessageId, snapshot.generation);
                void refreshConversations();
                return true;
            } catch (error) {
                failedSubmissionsRef.current.set(snapshot.temporaryAssistantId, snapshot);
                updateAssistant(snapshot.temporaryAssistantId, error instanceof Error ? error.message : "创作请求失败", "failed");
                setSending(false);
                submittingRef.current = false;
                return false;
            }
        },
        [refreshConversations, updateAssistant, watchRun],
    );

    const submit = useCallback(
        async (prompt: string, options?: CreateSubmitOptions) => {
            const content = prompt.trim();
            if (!content || sending || submittingRef.current) return false;
            submittingRef.current = true;
            const generation = conversationGenerationRef.current;
            stopWatching();
            setSending(true);
            const selectedIds = (options?.assetIds || selectedAssetIdsWithDrafts).slice(-20);
            let prepared: Awaited<ReturnType<typeof materializeDraftAttachments>>;
            try {
                prepared = await materializeDraftAttachments(selectedIds);
            } catch (error) {
                setSending(false);
                submittingRef.current = false;
                throw error;
            }
            const now = Date.now();
            const sequence = messages.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
            const temporaryUserId = `message-${nanoid()}`;
            const temporaryAssistantId = `message-${nanoid()}`;
            const submittedConversationId = prepared.conversationId || conversationId;
            const optimisticConversationId = submittedConversationId || "pending";
            const assetIds = prepared.assetIds;
            const preferences = remapDraftAssetIds(options?.preferences, prepared.replacements);
            const snapshot: PendingCreateSubmission = {
                clientRequestId: `create-${nanoid()}`,
                generation,
                conversationId: submittedConversationId,
                content,
                assetIds,
                skillIds: options?.skillIds || [],
                modelIds: options?.modelIds || [],
                preferences,
                temporaryUserId,
                temporaryAssistantId,
            };
            setMessages((current) => [
                ...current,
                { id: temporaryUserId, conversationId: optimisticConversationId, sequence, role: "user", status: "completed", content, metadata: { assetIds }, createdAt: now, updatedAt: now },
                {
                    id: temporaryAssistantId,
                    conversationId: optimisticConversationId,
                    sequence: sequence + 1,
                    role: "assistant",
                    status: "running",
                    content: agentRequirementAcknowledgement(content, "chat", assetIds.length > 0),
                    metadata: {},
                    createdAt: now,
                    updatedAt: now,
                },
            ]);
            const consumedIds = new Set([...selectedIds, ...assetIds]);
            setSelectedAssetIds((current) => current.filter((id) => !consumedIds.has(id)));
            return executeSubmission(snapshot);
        },
        [conversationId, executeSubmission, materializeDraftAttachments, messages, selectedAssetIdsWithDrafts, sending, stopWatching],
    );

    const retrySubmission = useCallback(
        async (assistantMessageId: string) => {
            const snapshot = failedSubmissionsRef.current.get(assistantMessageId);
            if (!snapshot || sending || submittingRef.current || snapshot.generation !== conversationGenerationRef.current) return false;
            submittingRef.current = true;
            stopWatching();
            setSending(true);
            updateAssistant(assistantMessageId, "正在重新提交创作请求", "running");
            return executeSubmission(snapshot);
        },
        [executeSubmission, sending, stopWatching, updateAssistant],
    );

    const cancel = useCallback(async () => {
        if (!activeRunId) return;
        await controlCreativeAgentRun(activeRunId, "cancel");
    }, [activeRunId]);

    const control = useCallback(
        async (action: "pause" | "resume") => {
            if (!activeRunId) return;
            const result = await controlCreativeAgentRun(activeRunId, action);
            setActiveRunStatus(result.run.status);
            if (action === "resume") {
                const assistantMessage = messages.find((item) => item.runId === result.run.id && item.role === "assistant");
                if (assistantMessage) {
                    submittingRef.current = true;
                    watchRun(result.run, assistantMessage.id, conversationGenerationRef.current);
                }
            }
        },
        [activeRunId, messages, watchRun],
    );

    const retryTask = useCallback(
        async (runId: string, taskId: string) => {
            const result = await retryCreativeAgentTask(runId, taskId);
            setRunDetails((current) => ({ ...current, [runId]: result }));
            const assistantMessage = messages.find((item) => item.runId === runId && item.role === "assistant");
            if (assistantMessage) {
                updateAssistant(assistantMessage.id, "正在重新生成失败任务…");
                setSending(true);
                submittingRef.current = true;
                watchRun(result, assistantMessage.id, conversationGenerationRef.current);
            }
        },
        [messages, updateAssistant, watchRun],
    );

    const retryRun = useCallback(
        async (runId: string) => {
            const result = await controlCreativeAgentRun(runId, "retry");
            setRunDetails((current) => ({ ...current, [runId]: result.run }));
            setActiveRunId(runId);
            setActiveRunStatus(result.run.status);
            const assistantMessage = messages.find((item) => item.runId === runId && item.role === "assistant");
            if (assistantMessage) {
                updateAssistant(assistantMessage.id, "正在重新分析并执行这次请求…", "running");
                setSending(true);
                submittingRef.current = true;
                watchRun(result.run, assistantMessage.id, conversationGenerationRef.current);
            }
        },
        [messages, updateAssistant, watchRun],
    );

    const renameConversation = useCallback(async (id: string, title: string) => {
        const updated = await updateCreativeConversation(id, { title });
        setConversations((current) => current.map((item) => (item.id === id ? updated : item)).sort((a, b) => b.updatedAt - a.updatedAt));
    }, []);

    const deleteConversations = useCallback(
        async (ids: string[]) => {
            const uniqueIds = Array.from(new Set(ids));
            await deleteCreativeConversations(uniqueIds);
            if (uniqueIds.includes(activeConversationRef.current || "")) newConversation();
            await refreshConversations();
        },
        [newConversation, refreshConversations],
    );

    return {
        conversations,
        messages,
        assets,
        conversationId,
        activeRunId,
        activeRunStatus,
        runDetails,
        historyLoading,
        historyLoadingMore,
        historyHasMore,
        loadMoreConversations,
        conversationLoading,
        olderMessagesLoading,
        hasOlderMessages,
        loadOlderMessages,
        sending,
        submit,
        cancel,
        control,
        retryTask,
        retryRun,
        retrySubmission,
        openConversation,
        newConversation,
        renameConversation,
        deleteConversations,
        projectLinks,
        projectErrors,
        materializingProjectId,
        materializeProject,
        selectedAssetIds: selectedAssetIdsWithDrafts,
        selectedAssets: allAssets.filter((asset) => selectedAssetIdsWithDrafts.includes(asset.id)),
        toggleAsset: (id: string) => setSelectedAssetIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-20))),
        uploading,
        uploadAttachments,
        removeAttachment: (id: string) => {
            if (getCreateDraftAttachment(id)) removeDraftAttachments([id]);
            setSelectedAssetIds((current) => current.filter((item) => item !== id));
        },
        restoreAttachments: (ids: string[]) => setSelectedAssetIds(Array.from(new Set(ids.filter((id) => allAssets.some((asset) => asset.id === id)))).slice(-20)),
    };
}

function uniqueMessages(messages: CreativeMessage[]) {
    return Array.from(new Map(messages.map((item) => [item.id, item])).values()).sort((a, b) => a.sequence - b.sequence);
}

function remapDraftAssetIds(preferences: CreativeGenerationPreferences | undefined, replacements: Map<string, CreativeAsset>) {
    if (!preferences?.video || !replacements.size) return preferences;
    const remap = (id?: string) => (id ? replacements.get(id)?.id || id : undefined);
    return {
        ...preferences,
        video: {
            ...preferences.video,
            firstFrameAssetId: remap(preferences.video.firstFrameAssetId),
            lastFrameAssetId: remap(preferences.video.lastFrameAssetId),
        },
    };
}
