"use client";

import { App, Button, Drawer, Input, Modal, Segmented, Select, Tooltip } from "antd";
import { CircleCheck, ImagePlus, Link2, LoaderCircle, MessageSquareText, RotateCcw, Send, Square, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SiteLogo } from "@/components/layout/site-logo";
import type { TextAreaRef } from "antd/es/input/TextArea";

import type { AgentMediaDownload } from "@/components/agent/agent-media-download";
import { CreativeAgentControls, CreativeAgentSkillCard, type CreativeAgentModelOption } from "@/components/agent/creative-agent-controls";
import { AgentMessageActions } from "@/components/agent/agent-message-actions";
import { AgentMarkdown } from "@/components/agent/agent-markdown";
import { formatAgentMessageText, friendlyAgentError } from "@/components/agent/agent-message-format";
import { AgentMediaPreview } from "@/components/agent/agent-media-preview";
import { clipboardImageFiles } from "@/lib/clipboard-image-files";
import type { CreativeAsset, CreativeMessage } from "@/lib/creative-runtime-contract";
import { CREATIVE_UPLOAD_MAX_BYTES, isCreativeUploadMimeType } from "@/lib/creative-upload";
import type { DramaAssetReference, DramaEpisode, DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { useCreativeAgentOptions } from "@/hooks/use-creative-agent-options";
import { controlCreativeAgentRun, createCreativeAgentRun, createCreativeConversation, listCreativeAssets, listCreativeMessages, uploadCreativeAsset, watchCreativeAgentRun } from "@/services/api/creative";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useDramaStore } from "../stores/use-drama-store";
import { agentRequirementAcknowledgement } from "@/lib/agent-requirement-acknowledgement";
import type { DramaProjectStage } from "./drama-project-sections";

type PendingDramaSubmission = {
    clientRequestId: string;
    conversationId?: string;
    content: string;
    assetIds: string[];
    skillIds: string[];
    modelIds: string[];
    temporaryUserId: string;
    temporaryAssistantId: string;
    snapshot: ReturnType<typeof dramaSnapshot>;
};

export function DramaAgentPanel({
    project,
    episode,
    stage,
    open,
    onOpenChange,
    onConversationChange,
    selectedShotId,
}: {
    project: DramaProject;
    episode: DramaEpisode;
    stage: DramaProjectStage;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConversationChange: (conversationId: string) => void;
    selectedShotId?: string;
}) {
    const [permanent, setPermanent] = useState(false);
    const [activated, setActivated] = useState(open);

    useEffect(() => {
        const media = window.matchMedia("(min-width: 1366px)");
        const update = () => setPermanent(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    useEffect(() => {
        if (open) setActivated(true);
    }, [open]);

    if (!activated) return null;

    const content = <DramaAgentContent project={project} episode={episode} stage={stage} selectedShotId={selectedShotId} onClose={() => onOpenChange(false)} onConversationChange={onConversationChange} />;
    if (permanent) {
        return open ? (
            <aside className="hidden h-full min-h-0 w-[320px] shrink-0 border-l border-border bg-card min-[1366px]:block" aria-label="项目 Agent 面板" data-drama-agent-panel>
                <div className="h-full min-h-0 overflow-hidden">{content}</div>
            </aside>
        ) : (
            <aside className="hidden" aria-hidden="true">
                {content}
            </aside>
        );
    }

    return (
        <Drawer title="项目 Agent" placement="right" size={420} open={open} closable={false} destroyOnHidden={false} onClose={() => onOpenChange(false)} styles={{ wrapper: { maxWidth: "100vw" }, body: { padding: 0 } }}>
            {content}
        </Drawer>
    );
}

function DramaAgentContent({
    project,
    episode,
    stage,
    selectedShotId,
    onClose,
    onConversationChange,
}: {
    project: DramaProject;
    episode: DramaEpisode;
    stage: DramaProjectStage;
    selectedShotId?: string;
    onClose: () => void;
    onConversationChange: (conversationId: string) => void;
}) {
    const { message } = App.useApp();
    const site = usePublicSessionStore((state) => state.payload?.settings?.site) || { logoUrl: "/logo.svg" };
    const { skills, skillsLoading, models } = useCreativeAgentOptions("drama");
    const [messages, setMessages] = useState<CreativeMessage[]>([]);
    const [assets, setAssets] = useState<CreativeAsset[]>([]);
    const [prompt, setPrompt] = useState("");
    const [selectedSkillId, setSelectedSkillId] = useState<string>();
    const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [smartPlanning, setSmartPlanning] = useState(true);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [runId, setRunId] = useState<string>();
    const streamRef = useRef<(() => void) | null>(null);
    const submittingRef = useRef(false);
    const failedSubmissionsRef = useRef(new Map<string, PendingDramaSubmission>());
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<TextAreaRef>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeConversationIdRef = useRef(project.creativeConversationId);
    const selectedSkill = skills.find((skill) => skill.id === selectedSkillId);
    const selectedModels = models.filter((model) => selectedModelIds.includes(model.id));
    const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));
    const stageGuide = DRAMA_AGENT_STAGE_GUIDES[stage];
    const projectAssetCount = project.characters.length + project.scenes.length + project.props.length + project.clues.length;

    useEffect(() => {
        if (project.creativeConversationId) activeConversationIdRef.current = project.creativeConversationId;
    }, [project.creativeConversationId]);

    const refresh = useCallback(async (conversationId = activeConversationIdRef.current) => {
        if (!conversationId) return;
        const [nextMessages, nextAssets] = await Promise.all([listCreativeMessages(conversationId), listCreativeAssets(conversationId)]);
        setMessages(nextMessages);
        setAssets(nextAssets);
    }, []);

    useEffect(() => {
        setLoading(true);
        void refresh().finally(() => setLoading(false));
        return () => streamRef.current?.();
    }, [refresh]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [assets.length, messages.at(-1)?.id]);

    const assetsByRun = useMemo(() => {
        const map = new Map<string, CreativeAsset[]>();
        for (const asset of assets) {
            const key = asset.messageId || asset.sourceRunId;
            if (key) map.set(key, [...(map.get(key) || []), asset]);
        }
        return map;
    }, [assets]);
    const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

    const ensureConversation = async () => {
        if (activeConversationIdRef.current) return activeConversationIdRef.current;
        const conversation = await createCreativeConversation({ surface: "drama", source: "drama", projectId: project.id, title: `${project.title || "短剧"} Agent` });
        activeConversationIdRef.current = conversation.id;
        onConversationChange(conversation.id);
        return conversation.id;
    };

    const uploadImages = async (files: File[]) => {
        const unsupported = files.find((file) => !isCreativeUploadMimeType(file.type) || !file.type.startsWith("image/"));
        if (unsupported) return message.error(`${unsupported.name} 不是支持的图片格式`);
        const oversized = files.find((file) => file.size > CREATIVE_UPLOAD_MAX_BYTES);
        if (oversized) return message.error(`${oversized.name} 超过 20MB`);
        if (!files.length || uploading) return;
        setUploading(true);
        try {
            const conversationId = await ensureConversation();
            const uploaded: CreativeAsset[] = [];
            for (const file of files) uploaded.push(await uploadCreativeAsset(conversationId, file));
            setAssets((current) => [...current, ...uploaded.filter((asset) => !current.some((item) => item.id === asset.id))]);
            setSelectedAssetIds((current) => Array.from(new Set([...current, ...uploaded.map((asset) => asset.id)])));
            message.success(`已上传 ${uploaded.length} 张参考图`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "参考图上传失败");
        } finally {
            setUploading(false);
        }
    };

    const executeSubmission = async (submission: PendingDramaSubmission) => {
        try {
            const result = await createCreativeAgentRun({
                clientRequestId: submission.clientRequestId,
                surface: "drama",
                conversationId: submission.conversationId,
                projectId: project.id,
                prompt: submission.content,
                assetIds: submission.assetIds,
                skillIds: submission.skillIds,
                modelIds: submission.modelIds,
                snapshot: submission.snapshot,
            });
            failedSubmissionsRef.current.delete(submission.temporaryAssistantId);
            activeConversationIdRef.current = result.run.conversationId;
            if (result.run.conversationId !== project.creativeConversationId) onConversationChange(result.run.conversationId);
            setRunId(result.run.id);
            setMessages((current) =>
                current.map((item) => {
                    if (item.id === submission.temporaryUserId) return { ...item, id: result.run.inputMessageId, conversationId: result.run.conversationId, runId: result.run.id };
                    if (item.id === submission.temporaryAssistantId) return { ...item, id: result.run.assistantMessageId, conversationId: result.run.conversationId, runId: result.run.id };
                    return item;
                }),
            );
            await refresh(result.run.conversationId);
            streamRef.current?.();
            streamRef.current = watchCreativeAgentRun(result.run.id, {
                onProgress: () => void refresh(),
                onTaskCompleted: () => void refresh(),
                onStatus: () => undefined,
                onProjectHandoff: () => undefined,
                onConnectionError: () => {
                    setSending(false);
                    submittingRef.current = false;
                    setRunId(undefined);
                    void refresh();
                },
                onTerminal: () => {
                    setSending(false);
                    submittingRef.current = false;
                    setRunId(undefined);
                    streamRef.current = null;
                    void refresh();
                },
            });
            return true;
        } catch (error) {
            failedSubmissionsRef.current.set(submission.temporaryAssistantId, submission);
            const content = friendlyAgentError(error, "项目 Agent 请求失败，请稍后重试。");
            setMessages((current) => current.map((item) => (item.id === submission.temporaryAssistantId ? { ...item, content, status: "failed", updatedAt: Date.now() } : item)));
            setSending(false);
            submittingRef.current = false;
            setRunId(undefined);
            return false;
        }
    };

    const submit = async () => {
        const content = prompt.trim();
        if (!content || sending || submittingRef.current || uploading) return;
        submittingRef.current = true;
        setPrompt("");
        setSending(true);
        const now = Date.now();
        const sequence = messages.reduce((highest, item) => Math.max(highest, item.sequence), 0) + 1;
        const temporaryUserId = `message-${nanoid()}`;
        const temporaryAssistantId = `message-${nanoid()}`;
        const assetIds = [...selectedAssetIds];
        const submission: PendingDramaSubmission = {
            clientRequestId: `drama-agent-${nanoid()}`,
            conversationId: activeConversationIdRef.current,
            content,
            assetIds,
            skillIds: selectedSkillId ? [selectedSkillId] : [],
            modelIds: smartPlanning ? [] : selectedModelIds,
            temporaryUserId,
            temporaryAssistantId,
            snapshot: dramaSnapshot(project, episode, stage, selectedShotId),
        };
        setMessages((current) => [
            ...current,
            { id: temporaryUserId, conversationId: submission.conversationId || "pending", sequence, role: "user", status: "completed", content, metadata: { assetIds }, createdAt: now, updatedAt: now },
            {
                id: temporaryAssistantId,
                conversationId: submission.conversationId || "pending",
                sequence: sequence + 1,
                role: "assistant",
                status: "running",
                content: agentRequirementAcknowledgement(content, "drama", assetIds.length > 0),
                metadata: {},
                createdAt: now,
                updatedAt: now,
            },
        ]);
        setSelectedSkillId(undefined);
        setSelectedAssetIds((current) => current.filter((id) => !assetIds.includes(id)));
        return executeSubmission(submission);
    };

    const retrySubmission = async (assistantMessageId: string) => {
        const submission = failedSubmissionsRef.current.get(assistantMessageId);
        if (!submission || sending || submittingRef.current) return false;
        submittingRef.current = true;
        setSending(true);
        setMessages((current) => current.map((item) => (item.id === assistantMessageId ? { ...item, content: "正在重新提交创作请求", status: "running", updatedAt: Date.now() } : item)));
        return executeSubmission(submission);
    };

    const toggleModel = (model: CreativeAgentModelOption) => {
        setSelectedModelIds((current) => {
            const next = current.includes(model.id) ? current.filter((id) => id !== model.id) : [...current, model.id];
            setSmartPlanning(next.length === 0);
            return next;
        });
    };

    const enableSmartPlanning = () => {
        setSelectedModelIds([]);
        setSmartPlanning(true);
    };

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border px-4 py-3.5">
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 font-medium">
                        <SiteLogo logoUrl={site.logoUrl} className="size-5" />
                        <span className="truncate">{stageGuide.label}</span>
                    </div>
                    <Tooltip title="收起项目 Agent">
                        <Button type="text" shape="circle" className="!size-8 !min-w-8" icon={<X className="size-4" />} onClick={onClose} aria-label="收起项目 Agent" />
                    </Tooltip>
                </div>
                <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                    {projectAssetCount} 项资产 · {episode.shots.length} 个镜头 · 建议不会自动修改项目
                </p>
                <div className="mt-3 grid grid-cols-2 gap-1.5" data-drama-agent-quick-actions>
                    {stageGuide.prompts.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            className="min-h-9 min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs leading-4 text-muted-foreground transition hover:border-foreground/20 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={sending}
                            onClick={() => {
                                setPrompt(item.prompt);
                                window.requestAnimationFrame(() => inputRef.current?.focus());
                            }}
                            aria-label={`Agent 快捷操作：${item.label}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-4 py-4">
                {loading ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-3.5" data-drama-agent-loading>
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                            正在恢复项目 Agent
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">正在读取历史对话与当前阶段快照；后台运行不会因为面板收起而取消。</p>
                        <AgentCapabilityList labels={stageGuide.prompts.map((item) => item.label)} />
                    </div>
                ) : null}
                {!loading && !messages.length ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/15 p-4" data-drama-agent-empty>
                        <span className="grid size-9 place-items-center rounded-md border border-border bg-background text-muted-foreground">
                            <MessageSquareText className="size-4" />
                        </span>
                        <div className="mt-3 text-sm font-medium text-foreground">从当前阶段开始协作</div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Agent 已获得当前剧集、资产与镜头语义快照。点击上方检查项只会填入草稿，确认发送后才会运行，也不会自动修改项目。</p>
                        <AgentCapabilityList labels={stageGuide.prompts.map((item) => item.label)} />
                    </div>
                ) : null}
                {messages.map((message) => {
                    const referencedAssets = message.role === "user" ? messageAssetIds(message).flatMap((id) => assetById.get(id) || []) : [];
                    const messageAssets = [...(assetsByRun.get(message.id) || []), ...(message.runId ? assetsByRun.get(message.runId) || [] : [])].filter((asset, index, list) => list.findIndex((item) => item.id === asset.id) === index);
                    const displayContent = message.status === "failed" ? friendlyAgentError(message.content) : formatAgentMessageText(message.content);
                    return (
                        <div key={message.id} className={`group/message min-w-0 ${message.role === "user" ? "pl-8 text-right" : "pr-2"}`}>
                            {referencedAssets.length ? <DramaMessageReferences assets={referencedAssets} /> : null}
                            <div className={`min-w-0 break-words text-sm leading-6 [overflow-wrap:anywhere] ${message.status === "failed" ? "text-red-500" : "text-foreground"}`}>
                                {message.status === "running" ? <LoaderCircle className="mr-1 inline size-3.5 animate-spin" /> : null}
                                {message.role === "assistant" && message.status === "completed" ? <AgentMarkdown>{displayContent}</AgentMarkdown> : <span className="whitespace-pre-wrap">{displayContent}</span>}
                            </div>
                            {messageAssets.length ? <DramaAgentAssets assets={messageAssets} project={project} episode={episode} /> : null}
                            {message.role === "assistant" && message.status === "failed" && !message.runId ? (
                                <Button
                                    type="text"
                                    size="small"
                                    className="!mt-1 !h-7 !px-1.5 !text-xs !text-red-600 hover:!bg-red-50 hover:!text-red-700 dark:!text-red-300 dark:hover:!bg-red-950/30 dark:hover:!text-red-200"
                                    icon={<RotateCcw className="size-3.5" />}
                                    onClick={() => void retrySubmission(message.id)}
                                    aria-label="重试本次项目 Agent 请求"
                                >
                                    重试
                                </Button>
                            ) : null}
                            {message.status !== "running" ? (
                                <AgentMessageActions
                                    text={displayContent}
                                    downloads={agentAssetDownloads(messageAssets)}
                                    onEdit={
                                        message.role === "user" && !sending
                                            ? (text) => {
                                                  setPrompt(text);
                                                  setSelectedAssetIds(messageAssetIds(message).filter((id) => assets.some((asset) => asset.id === id)));
                                                  window.requestAnimationFrame(() => inputRef.current?.focus());
                                              }
                                            : undefined
                                    }
                                    align={message.role === "user" ? "end" : "start"}
                                />
                            ) : null}
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>
            <div className="m-3 min-w-0 shrink-0 rounded-lg border border-border bg-background p-2 shadow-[0_8px_24px_rgba(15,23,42,.08)]">
                {selectedSkill ? <CreativeAgentSkillCard skill={selectedSkill} onRemove={() => setSelectedSkillId(undefined)} className="pb-1" /> : null}
                {selectedAssets.length ? (
                    <div className="thin-scrollbar flex gap-2 overflow-x-auto px-1 pb-2">
                        {selectedAssets.map((asset) => {
                            const url = asset.serverUrl || asset.remoteUrl || "";
                            return (
                                <div key={asset.id} className="group relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                                    {url ? <AgentMediaPreview type="image" url={url} title={asset.title || "参考图"} className="size-full" /> : <ImagePlus className="m-auto size-4 text-muted-foreground" />}
                                    <button
                                        type="button"
                                        className="absolute right-1 top-1 z-10 grid size-5 place-items-center rounded bg-background/90 text-muted-foreground shadow-sm hover:text-foreground"
                                        onClick={() => setSelectedAssetIds((current) => current.filter((id) => id !== asset.id))}
                                        aria-label={`移除参考图：${asset.title}`}
                                    >
                                        <X className="size-3" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                <Input.TextArea
                    ref={inputRef}
                    value={prompt}
                    autoSize={{ minRows: 2, maxRows: 5 }}
                    placeholder="告诉 Agent 下一步要做什么"
                    disabled={sending}
                    variant="borderless"
                    className="!min-w-0 !bg-transparent !px-2 !shadow-none"
                    onChange={(event) => setPrompt(event.target.value)}
                    onPaste={(event) => {
                        const files = clipboardImageFiles(event.clipboardData);
                        if (!files.length) return;
                        event.preventDefault();
                        void uploadImages(files);
                    }}
                    onPressEnter={(event) => {
                        if (!event.shiftKey) {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                />
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-border pt-2">
                    <div className="flex min-w-0 items-center gap-1">
                        <input
                            ref={fileInputRef}
                            hidden
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            onChange={(event) => {
                                void uploadImages(Array.from(event.target.files || []));
                                event.target.value = "";
                            }}
                        />
                        <Button type="text" shape="circle" className="!size-8 !min-w-8" icon={<ImagePlus className="size-4" />} loading={uploading} disabled={sending} onClick={() => fileInputRef.current?.click()} aria-label="上传参考图" />
                        <CreativeAgentControls
                            compact
                            skills={skills}
                            skillsLoading={skillsLoading}
                            selectedSkill={selectedSkill}
                            models={models}
                            selectedModels={selectedModels}
                            smartPlanning={smartPlanning}
                            onSelectSkill={(skill) => setSelectedSkillId(skill.id)}
                            onToggleModel={toggleModel}
                            onClearModels={enableSmartPlanning}
                            onSmartPlanningChange={(enabled) => (enabled ? enableSmartPlanning() : setSmartPlanning(false))}
                        />
                    </div>
                    {sending && runId ? (
                        <Button danger shape="circle" icon={<Square className="size-3.5" />} onClick={() => void controlCreativeAgentRun(runId, "cancel")} aria-label="停止项目 Agent" />
                    ) : (
                        <Button type="primary" shape="circle" icon={<Send className="size-3.5" />} disabled={!prompt.trim() || uploading} onClick={() => void submit()} aria-label="发送给项目 Agent" />
                    )}
                </div>
            </div>
        </div>
    );
}

function AgentCapabilityList({ labels }: { labels: string[] }) {
    return (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
            {labels.map((label) => (
                <span key={label} className="flex min-w-0 items-start gap-1.5">
                    <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                    <span className="min-w-0 leading-4">{label}</span>
                </span>
            ))}
        </div>
    );
}

function DramaMessageReferences({ assets }: { assets: CreativeAsset[] }) {
    let imageIndex = 0;
    return (
        <div className="mb-1.5 flex max-w-full flex-wrap justify-end gap-1.5" aria-label="本轮参考素材">
            {assets.flatMap((asset) => {
                const url = asset.serverUrl || asset.remoteUrl || "";
                if (asset.type !== "image" || !url) return [];
                return (
                    <div key={asset.id} className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted" title={asset.title || "参考图"}>
                        <AgentMediaPreview type="image" url={url} title={asset.title || "参考图"} className="size-full" />
                        <span className="absolute left-1 top-1 rounded bg-black/65 px-1 py-0.5 text-[9px] font-medium leading-none text-white">{imageReferenceLabel(imageIndex++)}</span>
                    </div>
                );
            })}
        </div>
    );
}

function messageAssetIds(message: CreativeMessage) {
    const value = message.metadata.assetIds;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function DramaAgentAssets({ assets, project, episode }: { assets: CreativeAsset[]; project: DramaProject; episode: DramaEpisode }) {
    const { message } = App.useApp();
    const updateShot = useDramaStore((state) => state.updateShot);
    const updateAsset = useDramaStore((state) => state.updateAsset);
    const addCharacter = useDramaStore((state) => state.addCharacter);
    const addScene = useDramaStore((state) => state.addScene);
    const addProp = useDramaStore((state) => state.addProp);
    const addClue = useDramaStore((state) => state.addClue);
    const [referenceAsset, setReferenceAsset] = useState<CreativeAsset>();
    const [visualAsset, setVisualAsset] = useState<CreativeAsset>();
    const [shotId, setShotId] = useState(episode.shots[0]?.id || "");
    const [frameKind, setFrameKind] = useState<"start" | "end">("start");
    const [visualKind, setVisualKind] = useState<VisualAssetKind>("characters");
    const [visualAssetId, setVisualAssetId] = useState("");
    const [newVisualAssetName, setNewVisualAssetName] = useState("");
    const applyReference = () => {
        const shot = episode.shots.find((item) => item.id === shotId);
        const url = referenceAsset?.serverUrl || referenceAsset?.remoteUrl || "";
        if (!shot || !url) return;
        updateShot(project.id, episode.id, shot.id, {
            ...(frameKind === "start"
                ? { storyboardStatus: "success" as const, storyboardTaskId: undefined, storyboardError: undefined, storyboardImageUrl: url, storyboardImageWidth: referenceAsset?.width, storyboardImageHeight: referenceAsset?.height }
                : {
                      storyboardFrameMode: "first_last" as const,
                      storyboardEndStatus: "success" as const,
                      storyboardEndTaskId: undefined,
                      storyboardEndError: undefined,
                      storyboardEndImageUrl: url,
                      storyboardEndImageWidth: referenceAsset?.width,
                      storyboardEndImageHeight: referenceAsset?.height,
                  }),
            generationStatus: "idle",
            generationTaskId: undefined,
            generationError: undefined,
            videoUrl: undefined,
            audioStatus: "idle",
            audioTaskId: undefined,
            audioError: undefined,
            audioUrl: undefined,
        });
        setReferenceAsset(undefined);
        message.success(`已引用为${shot.title}的${frameKind === "start" ? "起始帧" : "结束帧"}`);
    };

    const applyVisualAsset = () => {
        const sourceAsset = visualAsset;
        const url = sourceAsset?.serverUrl || sourceAsset?.remoteUrl || "";
        if (!sourceAsset || !url) return;
        const reference: DramaAssetReference = {
            id: `reference-${nanoid()}`,
            url,
            storageKey: sourceAsset.storageKey,
            source: "generated",
            label: sourceAsset.title || "Agent 生成图",
            width: sourceAsset.width,
            height: sourceAsset.height,
            createdAt: new Date().toISOString(),
        };
        const selected = project[visualKind].find((item) => item.id === visualAssetId);
        const name = newVisualAssetName.trim() || sourceAsset.title.trim() || `${visualKind === "characters" ? "角色" : visualKind === "scenes" ? "场景" : visualKind === "props" ? "道具" : "线索"}参考`;
        if (selected) {
            const references = [...(selected.references || []), reference];
            updateAsset(project.id, visualKind, selected.id, { references, primaryReferenceId: reference.id, referenceImageUrl: reference.url, referenceStorageKey: reference.storageKey });
            message.success(`已加入${selected.name}的视觉参考图`);
        } else if (visualKind === "characters") {
            addCharacter(project.id, { name, description: "来自项目 Agent 的视觉参考", profile: emptyAssetProfile(), references: [reference], primaryReferenceId: reference.id, referenceImageUrl: reference.url, referenceStorageKey: reference.storageKey });
            message.success(`已创建角色“${name}”并加入参考图`);
        } else if (visualKind === "scenes") {
            addScene(project.id, { name, description: "来自项目 Agent 的视觉参考", profile: emptyAssetProfile(), references: [reference], primaryReferenceId: reference.id, referenceImageUrl: reference.url, referenceStorageKey: reference.storageKey });
            message.success(`已创建场景“${name}”并加入参考图`);
        } else if (visualKind === "props") {
            addProp(project.id, { name, description: "来自项目 Agent 的视觉参考", profile: emptyAssetProfile(), references: [reference], primaryReferenceId: reference.id, referenceImageUrl: reference.url, referenceStorageKey: reference.storageKey });
            message.success(`已创建道具“${name}”并加入参考图`);
        } else {
            addClue(project.id, {
                name,
                description: "来自项目 Agent 的视觉参考",
                payoff: "",
                profile: emptyAssetProfile(),
                references: [reference],
                primaryReferenceId: reference.id,
                referenceImageUrl: reference.url,
                referenceStorageKey: reference.storageKey,
            });
            message.success(`已创建线索“${name}”并加入参考图`);
        }
        setVisualAsset(undefined);
        setVisualAssetId("");
        setNewVisualAssetName("");
    };

    return (
        <>
            <div className="mt-3 grid gap-2">
                {assets
                    .filter((asset) => asset.type !== "text")
                    .map((asset) => {
                        const url = asset.serverUrl || asset.remoteUrl || "";
                        if (!url) return null;
                        return (
                            <div key={asset.id} className="min-w-0">
                                <AgentMediaPreview type={asset.type} url={url} title={asset.title || "Agent 生成媒体"} className={asset.type === "image" ? "max-h-64 rounded-md" : asset.type === "video" ? "aspect-video rounded-md" : undefined} />
                                {asset.type === "image" ? (
                                    <div className="mt-2 flex min-w-0 items-center rounded-lg border border-border/70 bg-muted/30 p-1">
                                        <Button
                                            type="text"
                                            className="!h-7 !min-w-0 !flex-1 !justify-center !px-2 !text-xs !text-foreground hover:!bg-background/80"
                                            size="small"
                                            icon={<Link2 className="size-3.5" />}
                                            disabled={!episode.shots.length}
                                            onClick={() => setReferenceAsset(asset)}
                                        >
                                            引用到分镜
                                        </Button>
                                        <span className="h-4 w-px shrink-0 bg-border" />
                                        <Button
                                            type="text"
                                            className="!h-7 !min-w-0 !flex-1 !justify-center !px-2 !text-xs !text-foreground hover:!bg-background/80"
                                            size="small"
                                            icon={<ImagePlus className="size-3.5" />}
                                            onClick={() => setVisualAsset(asset)}
                                        >
                                            加入视觉资产
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
            </div>
            <Modal title="引用图片到分镜" open={Boolean(referenceAsset)} width={420} centered destroyOnHidden okText="确认引用" cancelText="取消" okButtonProps={{ disabled: !shotId }} onCancel={() => setReferenceAsset(undefined)} onOk={applyReference}>
                <div className="grid gap-4 pt-2">
                    <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">目标镜头</span>
                        <Select
                            value={shotId || undefined}
                            placeholder="选择要引用的镜头"
                            optionFilterProp="label"
                            options={episode.shots.map((shot) => ({ value: shot.id, label: `${String(shot.order).padStart(2, "0")} · ${shot.title}` }))}
                            onChange={setShotId}
                        />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">引用位置</span>
                        <Segmented
                            block
                            value={frameKind}
                            options={[
                                { label: "起始帧", value: "start" },
                                { label: "结束帧", value: "end" },
                            ]}
                            onChange={(value) => setFrameKind(value as "start" | "end")}
                        />
                    </label>
                    <p className="text-xs leading-5 text-muted-foreground">引用后会替换该位置现有图片；如镜头已有视频，需要重新生成以应用新画面。</p>
                </div>
            </Modal>
            <Modal
                title="加入视觉资产"
                open={Boolean(visualAsset)}
                width={460}
                centered
                destroyOnHidden
                okText="保存到视觉资产"
                cancelText="取消"
                okButtonProps={{ disabled: !visualAsset || (!visualAssetId && !newVisualAssetName.trim()) }}
                onCancel={() => {
                    setVisualAsset(undefined);
                    setVisualAssetId("");
                    setNewVisualAssetName("");
                }}
                onOk={applyVisualAsset}
            >
                <div className="grid gap-4 pt-2">
                    <p className="text-sm leading-6 text-muted-foreground">这张 Agent 图片会直接保存为角色、场景、道具或线索的参考图，不需要下载后重新上传。</p>
                    <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">资产类型</span>
                        <Segmented
                            block
                            value={visualKind}
                            options={visualAssetKinds.map((item) => ({ label: item.label, value: item.value }))}
                            onChange={(value) => {
                                setVisualKind(value as VisualAssetKind);
                                setVisualAssetId("");
                            }}
                        />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">加入已有资产</span>
                        <Select
                            allowClear
                            value={visualAssetId || undefined}
                            placeholder="选择已有角色、场景、道具或线索"
                            options={project[visualKind].map((item) => ({ value: item.id, label: item.name }))}
                            onChange={(value) => {
                                setVisualAssetId(value || "");
                                if (value) setNewVisualAssetName("");
                            }}
                        />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">或新建资产名称</span>
                        <Input
                            value={newVisualAssetName}
                            onChange={(event) => {
                                setNewVisualAssetName(event.target.value);
                                if (event.target.value.trim()) setVisualAssetId("");
                            }}
                            placeholder={`例如：${visualAssetKinds.find((item) => item.value === visualKind)?.placeholder || "关键资产"}`}
                        />
                    </label>
                </div>
            </Modal>
        </>
    );
}

type VisualAssetKind = "characters" | "scenes" | "props" | "clues";

const DRAMA_AGENT_STAGE_GUIDES: Record<DramaProjectStage, { label: string; prompts: Array<{ label: string; prompt: string }> }> = {
    script: {
        label: "剧本协作",
        prompts: [
            { label: "检查阶段完成度", prompt: "检查当前集剧本是否具备进入内容审核的条件，按已完成、待补充、阻塞项列出结果。" },
            { label: "检查缺失资产", prompt: "从当前剧本中找出尚未登记的角色、场景、道具和线索，只给出资产清单与优先级。" },
            { label: "检查一致性", prompt: "检查当前集的人物动机、时间线、冲突、情绪递进和结尾钩子是否一致，列出最小修改建议。" },
            { label: "建议下一步", prompt: "根据当前剧本与项目状态，只建议一个最值得立即执行的下一步，并说明完成标准。" },
        ],
    },
    review: {
        label: "内容审核协作",
        prompts: [
            { label: "检查阶段完成度", prompt: "检查当前内容审核是否具备确认条件，按镜头列出已完成、待确认和阻塞项。" },
            { label: "检查缺失资产", prompt: "检查审核结果是否遗漏角色、场景、道具、线索或对应稳定引用，列出缺失项。" },
            { label: "检查一致性", prompt: "核对镜头与原剧本的对白、旁白、角色、场景、道具、线索和镜头边界，列出不一致项。" },
            { label: "建议下一步", prompt: "根据当前审核状态，只建议一个最值得立即执行的下一步，并说明完成标准。" },
        ],
    },
    assets: {
        label: "视觉资产协作",
        prompts: [
            { label: "检查阶段完成度", prompt: "检查当前视觉资产库是否具备进入分镜制作的条件，按资产类型列出完成度和阻塞项。" },
            { label: "检查缺失资产", prompt: "对照当前集镜头检查角色、场景、道具和线索资产，列出缺失项与优先级。" },
            { label: "检查一致性", prompt: "检查核心角色、场景和道具的视觉识别、配色、造型与基准图是否存在冲突。" },
            { label: "建议下一步", prompt: "根据资产库与当前集需求，只建议一个最值得立即完善的资产，并说明完成标准。" },
        ],
    },
    storyboard: {
        label: "分镜协作",
        prompts: [
            { label: "检查阶段完成度", prompt: "检查当前集分镜是否具备进入镜头生成的条件，按镜头列出完成、待补和阻塞项。" },
            { label: "检查缺失资产", prompt: "检查分镜图片与视频提示词是否缺少稳定角色、场景、道具、线索或参考图引用。" },
            { label: "检查一致性", prompt: "检查当前集分镜的景别、轴线、视线、动作承接、场景连续性和资产一致性，给出逐镜头建议。" },
            { label: "建议下一步", prompt: "根据当前分镜状态，只建议一个最值得立即修正的镜头，并说明完成标准。" },
        ],
    },
    generate: {
        label: "生成协作",
        prompts: [
            { label: "检查阶段完成度", prompt: "检查当前集镜头、配音与整集合成的完成度，按可生成、生成中、失败和已完成分类。" },
            { label: "检查缺失资产", prompt: "检查待生成镜头的提示词、参考资产、画幅、时长、首尾帧和配音依赖是否完整。" },
            { label: "检查一致性", prompt: "检查当前生成结果的角色、场景、动作、镜头衔接、音画与字幕一致性，归纳需修正项。" },
            { label: "建议下一步", prompt: "根据当前任务状态与错误信息，只建议一个最值得立即执行的下一步，不自动重试或生成。" },
        ],
    },
};

const visualAssetKinds: Array<{ value: VisualAssetKind; label: string; placeholder: string }> = [
    { value: "characters", label: "角色", placeholder: "女主角" },
    { value: "scenes", label: "场景", placeholder: "医院走廊" },
    { value: "props", label: "道具", placeholder: "旧手机" },
    { value: "clues", label: "线索", placeholder: "染血的手帕" },
];

function emptyAssetProfile() {
    return { visualIdentity: "", styling: "", colorPalette: "", consistencyRules: "" };
}

function agentAssetSnapshot(asset: DramaNamedAsset) {
    return {
        id: asset.id,
        name: asset.name,
        description: asset.description,
        profile: asset.profile,
        primaryReferenceId: asset.primaryReferenceId,
        referenceImageUrl: asset.referenceImageUrl,
    };
}

function dramaSnapshot(project: DramaProject, episode: DramaEpisode, stage: DramaProjectStage, selectedShotId?: string) {
    return {
        currentStage: stage,
        project: {
            id: project.id,
            title: project.title,
            summary: project.summary,
            style: project.style,
            ratio: project.ratio,
            defaultVideoMode: project.defaultVideoMode,
        },
        episode: {
            id: episode.id,
            title: episode.title,
            script: episode.script,
            outline: episode.outline,
            hook: episode.hook,
            nextPreview: episode.nextPreview,
            sourceRange: episode.sourceRange,
            reviewStatus: episode.reviewStatus,
        },
        selectedShotId,
        sourceAssets: project.sourceAssets?.map((asset) => ({
            id: asset.id,
            type: asset.type,
            title: asset.title,
            textContent: asset.textContent,
            serverUrl: asset.serverUrl,
            remoteUrl: asset.remoteUrl,
        })),
        characters: project.characters.map((asset) => ({ ...agentAssetSnapshot(asset), voiceProfile: asset.voiceProfile })),
        scenes: project.scenes.map(agentAssetSnapshot),
        props: project.props.map(agentAssetSnapshot),
        clues: project.clues.map((asset) => ({ ...agentAssetSnapshot(asset), payoff: asset.payoff })),
        shots: episode.shots.map((shot) => ({
            id: shot.id,
            order: shot.order,
            title: shot.title,
            description: shot.description,
            sourceText: shot.sourceText,
            shotBoundary: shot.shotBoundary,
            dialogue: shot.dialogue,
            narration: shot.narration,
            utterances: shot.utterances,
            imagePrompt: shot.imagePrompt,
            videoPrompt: shot.videoPrompt,
            cameraMotion: shot.cameraMotion,
            startFramePrompt: shot.startFramePrompt,
            endFramePrompt: shot.endFramePrompt,
            negativePrompt: shot.negativePrompt,
            continuity: shot.continuity,
            duration: shot.duration,
            characterIds: shot.characterIds,
            sceneId: shot.sceneId,
            propIds: shot.propIds,
            clueIds: shot.clueIds,
            videoMode: shot.videoMode,
            storyboardFrameMode: shot.storyboardFrameMode,
            storyboardStatus: shot.storyboardStatus,
            storyboardError: shot.storyboardError,
            storyboardImageUrl: shot.storyboardImageUrl,
            storyboardEndStatus: shot.storyboardEndStatus,
            storyboardEndError: shot.storyboardEndError,
            storyboardEndImageUrl: shot.storyboardEndImageUrl,
            generationStatus: shot.generationStatus,
            generationError: shot.generationError,
            videoUrl: shot.videoUrl,
            subtitle: shot.subtitle,
            audioMode: shot.audioMode,
            audioStatus: shot.audioStatus,
            audioError: shot.audioError,
            audioUrl: shot.audioUrl,
        })),
    };
}

function agentAssetDownloads(assets: CreativeAsset[]): AgentMediaDownload[] {
    return assets.flatMap((asset) => {
        const url = asset.serverUrl || asset.remoteUrl || "";
        return url && (asset.type === "image" || asset.type === "video") ? [{ type: asset.type, url, title: asset.title || (asset.type === "video" ? "生成视频" : "生成图片"), mimeType: asset.mimeType }] : [];
    });
}
