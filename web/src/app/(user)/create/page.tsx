"use client";

import { App, Button, Drawer } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { ChevronsDown, Clapperboard, History, Play, Plus, ScanFace, ShoppingBag, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CREATIVE_UPLOAD_ACCEPT, CREATIVE_UPLOAD_MAX_BYTES, isCreativeUploadMimeType } from "@/lib/creative-upload";
import type { CreateOverviewAsset } from "@/lib/create-workbench-overview";
import type { CreativeAsset, CreativeGenerationMode, CreativeGenerationPreferences, CreativeMessage } from "@/lib/creative-runtime-contract";
import type { VideoReferenceRole } from "@/lib/video-reference-contract";
import { useCreativeAgentModels } from "@/hooks/use-creative-agent-options";
import { listAgentSkills, type AgentSkillSummary } from "@/services/api/agent-skills";
import type { CreativeAgentRun } from "@/services/api/creative";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import type { PublicGalleryItem } from "@/services/api/work-governance";
import { createAgentPromptFromHash } from "@/lib/create-agent-prompt";

import { CreativeComposer } from "./components/creative-composer";
import { CreativeConversationList } from "./components/creative-conversation-list";
import { CreateInspirationGallery } from "./components/create-inspiration-gallery";
import { CreativeMessages } from "./components/creative-messages";
import { creativeRunReplayPreferences } from "./components/creative-run-replay";
import { CreateWorkbenchOverview } from "./components/create-workbench-overview";
import { createConversationHref, createConversationIdFromSearch } from "./create-conversation-navigation";
import { useCreateAgent } from "./use-create-agent";

const SKILL_VISUALS = [
    { icon: ShoppingBag, iconClass: "text-sky-600 dark:text-sky-300", surfaceClass: "bg-sky-50 dark:bg-sky-400/10" },
    { icon: ScanFace, iconClass: "text-violet-600 dark:text-violet-300", surfaceClass: "bg-violet-50 dark:bg-violet-400/10" },
    { icon: Play, iconClass: "text-emerald-600 dark:text-emerald-300", surfaceClass: "bg-emerald-50 dark:bg-emerald-400/10" },
    { icon: Clapperboard, iconClass: "text-red-500 dark:text-red-300", surfaceClass: "bg-red-50 dark:bg-red-400/10" },
] as const;

export default function CreatePage() {
    const { message } = App.useApp();
    const router = useRouter();
    const inputRef = useRef<TextAreaRef>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);
    const frameInputRef = useRef<HTMLInputElement>(null);
    const frameUploadRoleRef = useRef<FrameRole | undefined>(undefined);
    const initialConversationRestoredRef = useRef(false);
    const initialPromptRestoredRef = useRef(false);
    const conversationScrollRef = useRef<HTMLElement>(null);
    const previousScrollTopRef = useRef(0);
    const awayFromLatestRef = useRef(false);
    const [prompt, setPrompt] = useState("");
    const [skills, setSkills] = useState<AgentSkillSummary[]>([]);
    const [skillsLoading, setSkillsLoading] = useState(true);
    const [selectedSkillId, setSelectedSkillId] = useState<string>();
    const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
    const [smartPlanning, setSmartPlanning] = useState(true);
    const [creationMode, setCreationMode] = useState<"agent" | CreativeGenerationMode>("agent");
    const [generationPreferences, setGenerationPreferences] = useState<CreativeGenerationPreferences>({});
    const [historyOpen, setHistoryOpen] = useState(false);
    const [awayFromLatest, setAwayFromLatest] = useState(false);
    const [composerExpanded, setComposerExpanded] = useState(true);
    const publicSettings = usePublicSessionStore((state) => state.payload?.settings);
    const siteTitle = publicSettings?.site?.title || "VOZEB PRO";
    const agent = useCreateAgent();
    const openAgentConversation = agent.openConversation;
    const newAgentConversation = agent.newConversation;
    const hasConversation = agent.messages.length > 0;
    const showConversation = hasConversation || agent.conversationLoading;
    const selectedSkill = skills.find((skill) => skill.id === selectedSkillId);
    const modelOptions = useCreativeAgentModels();
    const selectedModels = modelOptions.filter((model) => selectedModelIds.includes(model.id));

    useEffect(() => {
        let active = true;
        void listAgentSkills("all")
            .then((items) => {
                if (active) setSkills(items);
            })
            .catch(() => {
                if (active) setSkills([]);
            })
            .finally(() => {
                if (active) setSkillsLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (initialConversationRestoredRef.current) return;
        initialConversationRestoredRef.current = true;
        const conversationId = createConversationIdFromSearch(window.location.search);
        if (!conversationId) return;
        void openAgentConversation(conversationId).catch((error) => {
            message.error(error instanceof Error ? error.message : "恢复对话失败");
            router.replace("/create");
        });
    }, [message, openAgentConversation, router]);

    useEffect(() => {
        if (initialPromptRestoredRef.current) return;
        initialPromptRestoredRef.current = true;
        const incomingPrompt = createAgentPromptFromHash(window.location.hash);
        if (!incomingPrompt) return;
        setPrompt(incomingPrompt);
        router.replace("/create");
        window.requestAnimationFrame(() => inputRef.current?.focus());
        message.success("已填入作品提示词");
    }, [message, router]);

    useEffect(() => {
        if (!agent.conversationId || createConversationIdFromSearch(window.location.search) === agent.conversationId) return;
        router.replace(createConversationHref(agent.conversationId), { scroll: false });
    }, [agent.conversationId, router]);

    useEffect(() => {
        previousScrollTopRef.current = 0;
        awayFromLatestRef.current = false;
        setAwayFromLatest(false);
        setComposerExpanded(true);
    }, [agent.conversationId]);

    const openConversation = (id: string) => {
        router.push(createConversationHref(id));
        void openAgentConversation(id).catch((error) => {
            message.error(error instanceof Error ? error.message : "打开对话失败");
            router.replace("/create");
        });
    };

    const newConversation = () => {
        newAgentConversation();
        router.replace("/create");
    };

    const submit = async () => {
        if (!prompt.trim()) {
            message.warning("请先描述你的创作需求");
            inputRef.current?.focus();
            return;
        }
        if (!smartPlanning && !selectedModelIds.length) {
            message.warning("请选择至少一个模型，或重新开启智能规划");
            return;
        }
        const videoPreference = generationPreferences.video;
        if (videoPreference?.referenceMode === "first_frame" && !videoPreference.firstFrameAssetId) {
            message.warning("请先选择视频首帧图片");
            return;
        }
        if (videoPreference?.referenceMode === "first_last" && (!videoPreference.firstFrameAssetId || !videoPreference.lastFrameAssetId)) {
            message.warning("请先同时选择视频首帧和尾帧图片");
            return;
        }
        try {
            const preferences = { ...generationPreferences, ...(creationMode !== "agent" ? { mode: creationMode } : {}) };
            if (await agent.submit(prompt, { skillIds: selectedSkillId ? [selectedSkillId] : [], ...(!smartPlanning && selectedModelIds.length ? { modelIds: selectedModelIds } : {}), ...(Object.keys(preferences).length ? { preferences } : {}) })) {
                setPrompt("");
                setSelectedSkillId(undefined);
                setGenerationPreferences((current) => (current.video ? { ...current, video: { ...current.video, firstFrameAssetId: undefined, lastFrameAssetId: undefined } } : current));
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材上传失败");
        }
    };

    const restoreRoundInput = (editedMessage: CreativeMessage, run?: CreativeAgentRun) => {
        const assetIds = Array.isArray(editedMessage.metadata.assetIds) ? editedMessage.metadata.assetIds.filter((id): id is string => typeof id === "string") : [];
        const { mode, ...preferences } = creativeRunReplayPreferences(run) || {};
        const availableModelIds = (run?.requestedModelIds || []).filter((id) => modelOptions.some((model) => model.id === id));
        setPrompt(editedMessage.content);
        agent.restoreAttachments(assetIds);
        setSelectedSkillId(run?.selectedSkillIds?.find((id) => skills.some((skill) => skill.id === id)));
        setSelectedModelIds(availableModelIds);
        setSmartPlanning(!availableModelIds.length);
        setCreationMode(mode || "agent");
        setGenerationPreferences(preferences);
        window.requestAnimationFrame(() => inputRef.current?.focus());
        message.info("已恢复本轮需求、参考素材和生成设置，可修改后重新发送");
    };

    const repeatRound = async (sourceMessage: CreativeMessage, run?: CreativeAgentRun) => {
        const assetIds = Array.isArray(sourceMessage.metadata.assetIds) ? sourceMessage.metadata.assetIds.filter((id): id is string => typeof id === "string") : [];
        const submitted = await agent.submit(sourceMessage.content, {
            assetIds,
            skillIds: run?.selectedSkillIds || [],
            modelIds: run?.requestedModelIds || [],
            preferences: creativeRunReplayPreferences(run),
        });
        if (submitted) message.success("已按原设置创建新的生成任务");
    };

    const uploadAttachments = async (files: File[], successMessage?: string) => {
        const unsupported = files.find((file) => !isCreativeUploadMimeType(file.type));
        if (unsupported) {
            message.error(`${unsupported.name} 不是支持的图片、视频或音频格式`);
            return [] as CreativeAsset[];
        }
        const oversized = files.find((file) => file.size > CREATIVE_UPLOAD_MAX_BYTES);
        if (oversized) {
            message.error(`${oversized.name} 超过 20MB`);
            return [] as CreativeAsset[];
        }
        try {
            const items = await agent.uploadAttachments(files);
            if (items.length) message.success(successMessage || `已添加 ${items.length} 份素材`);
            return items;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材上传失败");
            return [] as CreativeAsset[];
        }
    };

    const usePublicPrompt = (value: string) => {
        setPrompt(value);
        window.requestAnimationFrame(() => inputRef.current?.focus());
        message.success("已填入公开提示词");
    };

    const importReferenceMedia = async (input: { url: string; mimeType?: string; fileStem: string }) => {
        try {
            const response = await fetch(input.url);
            if (!response.ok) throw new Error("读取参考素材失败");
            const blob = await response.blob();
            const mimeType = blob.type || input.mimeType || "";
            if (!isCreativeUploadMimeType(mimeType)) throw new Error("该媒体格式暂不支持作为参考素材");
            const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
            const referenced = await uploadAttachments([new File([blob], `${input.fileStem}.${extension}`, { type: mimeType })], "已引用到 Agent 输入框");
            if (referenced.length) window.requestAnimationFrame(() => inputRef.current?.focus());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "引用素材失败");
        }
    };

    const usePublicImage = async (item: PublicGalleryItem) => {
        const preview = item.preview;
        if (!preview || preview.mediaType !== "image") return;
        await importReferenceMedia({ url: preview.url, mimeType: preview.mimeType, fileStem: item.slug });
    };

    const useRecentAsset = async (asset: CreateOverviewAsset) => {
        await importReferenceMedia({ url: asset.url, fileStem: asset.id });
    };

    const selectSkill = (skill: AgentSkillSummary) => {
        setSelectedSkillId(skill.id);
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    const toggleModel = (model: (typeof modelOptions)[number]) => {
        setSelectedModelIds((current) => {
            const next = current.includes(model.id) ? current.filter((id) => id !== model.id) : [...current, model.id].slice(-6);
            setSmartPlanning(next.length === 0);
            return next;
        });
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    const changeCreationMode = (mode: "agent" | CreativeGenerationMode) => {
        setCreationMode(mode);
        if (mode !== "video") setGenerationPreferences((current) => (current.video ? { ...current, video: { ...current.video, referenceMode: "reference", firstFrameAssetId: undefined, lastFrameAssetId: undefined } } : current));
        if (mode === "agent") {
            setSelectedModelIds([]);
            setSmartPlanning(true);
            return;
        }
        setSelectedModelIds([]);
        setSmartPlanning(true);
    };

    const changeGenerationPreference = (capability: "image" | "video" | "audio", patch: Record<string, string | number>) => {
        setGenerationPreferences((current) => {
            if (capability !== "video") return { ...current, [capability]: { ...current[capability], ...patch } };
            const nextVideo = { ...current.video, ...patch };
            if (patch.referenceMode === "reference") return { ...current, video: { ...nextVideo, firstFrameAssetId: undefined, lastFrameAssetId: undefined } };
            if (patch.referenceMode === "first_frame") return { ...current, video: { ...nextVideo, lastFrameAssetId: undefined } };
            return { ...current, video: nextVideo };
        });
    };

    const selectVideoFrame = (role: FrameRole, assetId: string) => {
        const otherId = role === "first_frame" ? generationPreferences.video?.lastFrameAssetId : generationPreferences.video?.firstFrameAssetId;
        if (otherId === assetId) {
            message.warning("首帧和尾帧不能使用同一张图片");
            return;
        }
        setGenerationPreferences((current) => {
            const video = current.video || {};
            return {
                ...current,
                video: {
                    ...video,
                    referenceMode: role === "last_frame" ? "first_last" : video.referenceMode === "first_last" ? "first_last" : "first_frame",
                    ...(role === "first_frame" ? { firstFrameAssetId: assetId } : { lastFrameAssetId: assetId }),
                },
            };
        });
    };

    const removeVideoFrame = (role: FrameRole) => {
        setGenerationPreferences((current) =>
            current.video
                ? {
                      ...current,
                      video: {
                          ...current.video,
                          ...(role === "first_frame" ? { firstFrameAssetId: undefined } : { lastFrameAssetId: undefined }),
                      },
                  }
                : current,
        );
    };

    const removeAttachment = (id: string) => {
        agent.removeAttachment(id);
        setGenerationPreferences((current) =>
            current.video
                ? {
                      ...current,
                      video: {
                          ...current.video,
                          ...(current.video.firstFrameAssetId === id ? { firstFrameAssetId: undefined } : {}),
                          ...(current.video.lastFrameAssetId === id ? { lastFrameAssetId: undefined } : {}),
                      },
                  }
                : current,
        );
    };

    const setAwayFromLatestState = (away: boolean) => {
        if (away === awayFromLatestRef.current) return;
        awayFromLatestRef.current = away;
        setAwayFromLatest(away);
    };

    const updateConversationScrollState = (element: HTMLElement) => {
        const scrollTop = element.scrollTop;
        const distanceFromLatest = Math.max(0, element.scrollHeight - element.clientHeight - scrollTop);
        const scrollingUp = scrollTop < previousScrollTopRef.current - 3;
        const away = scrollingUp ? true : distanceFromLatest > 48 ? awayFromLatestRef.current : false;
        previousScrollTopRef.current = scrollTop;
        setAwayFromLatestState(away);
        if (!away) setComposerExpanded(true);
        else if (scrollingUp) setComposerExpanded(false);
    };

    const scrollToLatest = () => {
        awayFromLatestRef.current = false;
        setAwayFromLatest(false);
        setComposerExpanded(true);
        const element = conversationScrollRef.current;
        if (!element) return;
        previousScrollTopRef.current = element.scrollTop;
        const settle = (behavior: ScrollBehavior = "smooth") => element.scrollTo({ top: element.scrollHeight, behavior });
        const resizeObserver = new ResizeObserver(() => settle("auto"));
        resizeObserver.observe(element);
        window.requestAnimationFrame(() => {
            settle();
            window.requestAnimationFrame(() => settle());
            window.setTimeout(() => {
                settle("auto");
                resizeObserver.disconnect();
            }, 500);
        });
    };

    const composer = (
        <CreativeComposer
            inputRef={inputRef}
            value={prompt}
            busy={agent.sending}
            centered={!showConversation}
            onChange={setPrompt}
            onSubmit={() => void submit()}
            onCancel={() => void agent.cancel().catch((error) => message.error(error instanceof Error ? error.message : "停止任务失败"))}
            attachments={agent.selectedAssets}
            skills={skills}
            skillsLoading={skillsLoading}
            selectedSkill={selectedSkill}
            models={modelOptions}
            selectedModels={selectedModels}
            smartPlanning={smartPlanning}
            creationMode={creationMode}
            generationPreferences={generationPreferences}
            uploading={agent.uploading}
            compact={showConversation && awayFromLatest && !composerExpanded}
            onExpand={() => {
                setComposerExpanded(true);
                window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onRemoveAttachment={removeAttachment}
            onSelectSkill={selectSkill}
            onRemoveSkill={() => setSelectedSkillId(undefined)}
            onToggleModel={toggleModel}
            onClearModels={() => {
                setSelectedModelIds([]);
                setSmartPlanning(true);
            }}
            onToggleSmartPlanning={() => {
                setSmartPlanning((enabled) => {
                    if (!enabled) setSelectedModelIds([]);
                    return !enabled;
                });
            }}
            onChangeCreationMode={changeCreationMode}
            onChangeGenerationPreference={changeGenerationPreference}
            onSelectVideoFrame={selectVideoFrame}
            onUploadVideoFrame={(role) => {
                frameUploadRoleRef.current = role;
                frameInputRef.current?.click();
            }}
            onRemoveVideoFrame={removeVideoFrame}
            onAttachment={() => attachmentInputRef.current?.click()}
            onPasteImages={(files) => void uploadAttachments(files)}
        />
    );

    return (
        <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fcfdff_100%)] text-[#20242a] dark:bg-[linear-gradient(180deg,#111316_0%,#12151a_100%)] dark:text-[#f3f5f7]">
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1 sm:right-5 sm:top-4">
                {hasConversation ? <Button type="text" shape="circle" icon={<Plus className="size-4" />} onClick={newConversation} aria-label="新建对话" title="新建对话" /> : null}
                <Button type="text" shape="circle" icon={<History className="size-4" />} onClick={() => setHistoryOpen(true)} aria-label="创作历史" title="创作历史" />
            </div>

            <section
                ref={conversationScrollRef}
                data-testid="creative-conversation-scroll"
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
                onScroll={(event) => updateConversationScrollState(event.currentTarget)}
                onWheelCapture={(event) => {
                    if (event.deltaY < 0) {
                        setAwayFromLatestState(true);
                        setComposerExpanded(false);
                    }
                }}
            >
                {showConversation ? (
                    <CreativeMessages
                        messages={agent.messages}
                        assets={agent.assets}
                        loading={agent.conversationLoading}
                        projectLinks={agent.projectLinks}
                        projectErrors={agent.projectErrors}
                        runDetails={agent.runDetails}
                        materializingProjectId={agent.materializingProjectId}
                        onMaterializeProject={agent.materializeProject}
                        onRetryTask={(runId, taskId) => void agent.retryTask(runId, taskId).catch((error) => message.error(error instanceof Error ? error.message : "重试任务失败"))}
                        onRetryRun={(runId) => void agent.retryRun(runId).catch((error) => message.error(error instanceof Error ? error.message : "重新分析失败"))}
                        onRetrySubmission={(messageId) => void agent.retrySubmission(messageId).catch((error) => message.error(error instanceof Error ? error.message : "重试请求失败"))}
                        onEditMessage={restoreRoundInput}
                        onRepeatMessage={(sourceMessage, run) => void repeatRound(sourceMessage, run).catch((error) => message.error(error instanceof Error ? error.message : "再次生成失败"))}
                        busy={agent.sending}
                        selectedAssetIds={agent.selectedAssetIds}
                        onToggleAsset={agent.toggleAsset}
                        hasOlder={agent.hasOlderMessages}
                        olderLoading={agent.olderMessagesLoading}
                        onLoadOlder={() => void agent.loadOlderMessages()}
                        followLatest={!awayFromLatest}
                    />
                ) : (
                    <div className="mx-auto flex min-h-full w-full min-w-0 max-w-[1240px] flex-col items-center px-2.5 pb-3 pt-5 sm:px-8 sm:pb-8 sm:pt-14 lg:pt-[10vh]">
                        <div className="text-center">
                            <h1 className="text-[23px] font-semibold leading-tight sm:text-[31px]">{siteTitle} 创作 Agent</h1>
                            <p className="mt-2 text-sm text-[#8b949f] dark:text-[#7f8996]">从一个想法开始</p>
                        </div>
                        <div className="mt-5 w-full sm:mt-8">{composer}</div>
                        <div className="mt-2 flex w-full min-w-0 flex-wrap justify-center gap-1.5 sm:mt-3 sm:gap-2">
                            {skillsLoading ? <span className="px-2 py-2 text-xs text-[#9aa2ad]">正在加载创作 Skill...</span> : null}
                            {skills.map((skill, index) => {
                                const visual = skillVisual(skill, index);
                                const Icon = visual.icon;
                                return (
                                    <button
                                        key={skill.id}
                                        type="button"
                                        aria-label={`使用 ${skill.name} Skill`}
                                        title={skill.description}
                                        className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e3e7eb] bg-white px-3 text-sm font-medium text-[#343b44] transition hover:border-[#cfd6dd] hover:bg-[#f7f8fa] dark:border-[#343a42] dark:bg-[#181b20] dark:text-[#dce1e7] dark:hover:border-[#4a525d] dark:hover:bg-[#20242a]"
                                        onClick={() => selectSkill(skill)}
                                    >
                                        <Icon className={`size-4 ${visual.iconClass}`} />
                                        <span>{skill.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <CreateWorkbenchOverview onUseAsset={useRecentAsset} />
                        <CreateInspirationGallery onUsePrompt={usePublicPrompt} onUseImage={usePublicImage} />
                    </div>
                )}
            </section>

            {showConversation ? (
                <div className="relative shrink-0">
                    {awayFromLatest ? (
                        <Button
                            type="text"
                            icon={<ChevronsDown className="size-4" />}
                            className="!absolute !-top-11 !left-1/2 !z-20 !h-9 !-translate-x-1/2 !rounded-lg !border !border-[#e1e5e9] !bg-white !px-3 !text-sm !font-medium !text-[#596572] !shadow-[0_6px_20px_rgba(32,36,42,0.08)] hover:!bg-[#f4f6f8] hover:!text-[#20242a] dark:!border-[#343a42] dark:!bg-[#1c2025] dark:!text-[#b7c0ca] dark:!shadow-black/25 dark:hover:!bg-[#272c33] dark:hover:!text-white"
                            onClick={scrollToLatest}
                        >
                            回到底部
                        </Button>
                    ) : null}
                    {composer}
                </div>
            ) : null}
            <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept={CREATIVE_UPLOAD_ACCEPT}
                className="hidden"
                onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    event.target.value = "";
                    void uploadAttachments(files);
                }}
            />
            <input
                ref={frameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const role = frameUploadRoleRef.current;
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!role || !file) return;
                    void uploadAttachments([file]).then((items) => {
                        const image = items.find((item) => item.type === "image");
                        if (image) selectVideoFrame(role, image.id);
                    });
                }}
            />

            <Drawer title="创作历史" placement="right" size="min(92vw, 380px)" open={historyOpen} onClose={() => setHistoryOpen(false)} styles={{ body: { padding: 0, overflow: "hidden" } }}>
                <CreativeConversationList
                    items={agent.conversations}
                    activeId={agent.conversationId}
                    loading={agent.historyLoading}
                    hasMore={agent.historyHasMore}
                    loadingMore={agent.historyLoadingMore}
                    onLoadMore={() => void agent.loadMoreConversations()}
                    onNew={() => {
                        newConversation();
                        setHistoryOpen(false);
                    }}
                    onOpen={(id) => {
                        openConversation(id);
                        setHistoryOpen(false);
                    }}
                    onRename={async (id, title) => {
                        try {
                            await agent.renameConversation(id, title);
                            message.success("标题已更新");
                        } catch (error) {
                            message.error(error instanceof Error ? error.message : "修改标题失败");
                            throw error;
                        }
                    }}
                    onDelete={async (ids) => {
                        try {
                            await agent.deleteConversations(ids);
                            message.success(ids.length > 1 ? `已删除 ${ids.length} 条对话` : "对话已删除");
                        } catch (error) {
                            message.error(error instanceof Error ? error.message : "删除对话失败");
                            throw error;
                        }
                    }}
                />
            </Drawer>
        </main>
    );
}

function skillVisual(skill: AgentSkillSummary, index: number) {
    if (skill.id === "ecommerce-image") return SKILL_VISUALS[0];
    if (skill.id === "character-design") return SKILL_VISUALS[1];
    if (skill.id === "image-motion") return SKILL_VISUALS[2];
    if (skill.id === "drama-planning") return SKILL_VISUALS[3];
    return { ...SKILL_VISUALS[index % SKILL_VISUALS.length], icon: Sparkles };
}

type FrameRole = Extract<VideoReferenceRole, "first_frame" | "last_frame">;
