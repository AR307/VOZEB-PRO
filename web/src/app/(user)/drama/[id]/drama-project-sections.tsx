"use client";

import { useEffect, useRef, useState } from "react";
import { App, Button, Drawer, Input, Tooltip } from "antd";
import { ArrowLeft, Bot, BookOpenText, ChevronDown, Clapperboard, Film, History, PanelLeft, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { splitDramaSource } from "@/lib/drama-source-splitter";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import type { DramaEpisode, DramaProject } from "../types";
import { useDramaStore } from "../stores/use-drama-store";
import { DramaScriptWorkspace } from "./drama-script-workspace";
import { DramaStageHeader } from "./drama-editor-elements";

export type DramaProjectStage = "script" | "review" | "assets" | "storyboard" | "generate";

const stages = [
    { value: "script", label: "剧本", shortLabel: "剧本", icon: Clapperboard },
    { value: "review", label: "内容审核", shortLabel: "审核", icon: Save },
    { value: "assets", label: "视觉资产", shortLabel: "资产", icon: Sparkles },
    { value: "storyboard", label: "分镜", shortLabel: "分镜", icon: Film },
    { value: "generate", label: "镜头生成", shortLabel: "生成", icon: Sparkles },
] as const;

function usePermanentDramaPanels() {
    const [permanent, setPermanent] = useState(false);
    useEffect(() => {
        const media = window.matchMedia("(min-width: 1366px)");
        const update = () => setPermanent(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    return permanent;
}

function DramaEpisodePanel({ project, episode, permanent, onOpenChange, onStageChange }: { project: DramaProject; episode: DramaEpisode; permanent: boolean; onOpenChange: (open: boolean) => void; onStageChange: (stage: DramaProjectStage) => void }) {
    const { modal } = App.useApp();
    const addEpisode = useDramaStore((state) => state.addEpisode);
    const deleteEpisode = useDramaStore((state) => state.deleteEpisode);
    const selectEpisode = useDramaStore((state) => state.selectEpisode);
    const [query, setQuery] = useState("");

    const confirmDelete = (episodeId: string) => {
        const removing = project.episodes.find((item) => item.id === episodeId);
        if (!removing) return;
        modal.confirm({
            title: `删除${removing.title}？`,
            content: "本集剧本、分镜和任务记录会一起删除。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => deleteEpisode(project.id, removing.id),
        });
    };

    const filteredEpisodes = project.episodes.filter((item, index) => `${index + 1} ${item.title}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return (
        <div className="flex h-full min-h-0 flex-col bg-card" data-drama-episode-panel>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-3">
                <div>
                    <div className="text-sm font-semibold">集数管理</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                        {project.episodes.length} 集 · 当前第 {project.episodes.findIndex((item) => item.id === episode.id) + 1} 集
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Tooltip title="添加剧集">
                        <Button
                            type="text"
                            shape="circle"
                            className="!size-8 !min-w-8"
                            icon={<Plus className="size-4" />}
                            onClick={() => {
                                addEpisode(project.id);
                                onStageChange("script");
                            }}
                            aria-label="添加剧集"
                        />
                    </Tooltip>
                    <Tooltip title="收起集数管理">
                        <Button type="text" shape="circle" className="!size-8 !min-w-8" icon={<X className="size-4" />} onClick={() => onOpenChange(false)} aria-label="收起集数管理" />
                    </Tooltip>
                </div>
            </div>
            <div className="shrink-0 px-2.5 pt-2.5">
                <Input size="small" allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索集数" aria-label="搜索集数" />
            </div>
            <nav className="hide-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-label="短剧剧集导航">
                {filteredEpisodes.map((item) => {
                    const index = project.episodes.findIndex((episodeItem) => episodeItem.id === item.id);
                    const active = item.id === episode.id;
                    const progress = episodeProgressLabel(item);
                    return (
                        <div key={item.id} className={`group flex min-w-0 items-center rounded-lg border transition ${active ? "border-foreground/20 bg-foreground" : "border-transparent bg-transparent hover:border-border hover:bg-muted/70"}`}>
                            <button
                                type="button"
                                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left"
                                onClick={() => {
                                    selectEpisode(project.id, item.id);
                                    if (!permanent) onOpenChange(false);
                                }}
                                aria-current={active ? "page" : undefined}
                                aria-label={`打开${item.title}`}
                            >
                                <span className={`grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold tabular-nums ${active ? "bg-background/15 text-background" : "bg-muted text-muted-foreground"}`}>
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block truncate text-sm font-medium ${active ? "text-background" : "text-foreground"}`}>{item.title}</span>
                                    <span className={`mt-0.5 block truncate text-[11px] ${active ? "text-background/65" : "text-muted-foreground"}`}>
                                        {item.script.length} 字 · {item.shots.length} 场 · {progress}
                                    </span>
                                </span>
                            </button>
                            {project.episodes.length > 1 ? (
                                <Tooltip title={`删除${item.title}`}>
                                    <Button
                                        type="text"
                                        shape="circle"
                                        className={`!mr-1 !size-8 !min-w-8 opacity-60 transition group-hover:opacity-100 focus:opacity-100 ${active ? "!text-background/70 hover:!bg-background/10 hover:!text-background" : "!text-muted-foreground hover:!bg-rose-50 hover:!text-rose-600 dark:hover:!bg-rose-950/30 dark:hover:!text-rose-300"}`}
                                        icon={<Trash2 className="size-3.5" />}
                                        onClick={() => confirmDelete(item.id)}
                                        aria-label={`删除${item.title}`}
                                    />
                                </Tooltip>
                            ) : null}
                        </div>
                    );
                })}
            </nav>
            <div className="shrink-0 border-t border-border p-2">
                <Button
                    block
                    type="text"
                    icon={<Plus className="size-4" />}
                    onClick={() => {
                        addEpisode(project.id);
                        onStageChange("script");
                    }}
                >
                    新建集数
                </Button>
            </div>
        </div>
    );
}

export function DramaEpisodeSidebar({ project, episode, open, onOpenChange, onStageChange }: { project: DramaProject; episode: DramaEpisode; open: boolean; onOpenChange: (open: boolean) => void; onStageChange: (stage: DramaProjectStage) => void }) {
    if (!open) return null;
    return (
        <aside className="hidden h-full min-h-0 w-[226px] shrink-0 border-r border-border min-[1366px]:block" aria-label="集数管理侧栏" data-drama-episode-sidebar>
            <DramaEpisodePanel project={project} episode={episode} permanent onOpenChange={onOpenChange} onStageChange={onStageChange} />
        </aside>
    );
}

export function DramaEpisodeNavigator({ project, episode, open, onOpenChange, onStageChange }: { project: DramaProject; episode: DramaEpisode; open: boolean; onOpenChange: (open: boolean) => void; onStageChange: (stage: DramaProjectStage) => void }) {
    const permanent = usePermanentDramaPanels();

    const episodeIndex = Math.max(
        0,
        project.episodes.findIndex((item) => item.id === episode.id),
    );
    const trigger = (
        <button
            type="button"
            className="mt-0.5 flex max-w-full items-center gap-1.5 text-left text-xs text-muted-foreground transition hover:text-foreground"
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            aria-label={open ? "收起剧集导航" : "打开剧集导航"}
        >
            <PanelLeft className="size-3.5 shrink-0" />
            <span className="shrink-0 tabular-nums">第 {String(episodeIndex + 1).padStart(2, "0")} 集</span>
            <span className="truncate">{episode.title}</span>
            <ChevronDown className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
    );

    return (
        <>
            {trigger}
            <Drawer title="集数管理" placement="left" size={300} open={!permanent && open} closable={false} onClose={() => onOpenChange(false)} styles={{ wrapper: { maxWidth: "100vw" }, body: { padding: 0 } }}>
                <DramaEpisodePanel project={project} episode={episode} permanent={false} onOpenChange={onOpenChange} onStageChange={onStageChange} />
            </Drawer>
        </>
    );
}

export function DramaWorkspaceHeader({
    project,
    episode,
    stage,
    episodeNavigatorOpen,
    agentOpen,
    onStageChange,
    onEpisodeNavigatorOpenChange,
    onToggleAgent,
    onOpenVersions,
}: {
    project: DramaProject;
    episode: DramaEpisode;
    stage: DramaProjectStage;
    episodeNavigatorOpen: boolean;
    agentOpen: boolean;
    onStageChange: (stage: DramaProjectStage) => void;
    onEpisodeNavigatorOpenChange: (open: boolean) => void;
    onToggleAgent: () => void;
    onOpenVersions: () => void;
}) {
    const router = useRouter();
    const updateProject = useDramaStore((state) => state.updateProject);
    const stageStatuses = dramaStageStatuses(project, episode);

    return (
        <header className="shrink-0 border-b border-border bg-card/95 backdrop-blur-xl" data-drama-workspace-header>
            <div className="flex min-w-0 items-center justify-between gap-3 px-2.5 py-2 sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                    <Tooltip title="返回短剧项目">
                        <Button type="text" shape="circle" className="!size-9 !min-w-9" icon={<ArrowLeft className="size-4" />} onClick={() => router.push("/drama")} aria-label="返回短剧项目" />
                    </Tooltip>
                    <div className="min-w-0 flex-1">
                        <Input variant="borderless" className="!h-7 !p-0 !text-base !font-semibold sm:!text-lg" value={project.title} onChange={(event) => updateProject(project.id, { title: event.target.value })} aria-label="短剧项目名称" />
                        <DramaEpisodeNavigator project={project} episode={episode} open={episodeNavigatorOpen} onOpenChange={onEpisodeNavigatorOpenChange} onStageChange={onStageChange} />
                    </div>
                </div>

                <div className="flex min-w-0 shrink-0 items-center justify-end gap-1">
                    <Tooltip title="项目版本">
                        <Button className="!size-9 !min-w-9 !px-0 sm:!w-auto sm:!px-3" icon={<History className="size-4" />} onClick={onOpenVersions} aria-label="打开项目版本">
                            <span className="hidden sm:inline">版本</span>
                        </Button>
                    </Tooltip>
                    <Tooltip title={agentOpen ? "收起项目 Agent" : "打开项目 Agent"}>
                        <Button
                            className={`!h-9 !px-2.5 ${agentOpen ? "!border-foreground !bg-foreground" : "!border-border !bg-background hover:!border-foreground/25 hover:!bg-muted"}`}
                            style={agentOpen ? { color: "var(--background)" } : undefined}
                            icon={<Bot className="size-4" style={agentOpen ? { color: "var(--background)" } : undefined} />}
                            onClick={onToggleAgent}
                            aria-expanded={agentOpen}
                            aria-label={agentOpen ? "收起项目 Agent" : "打开项目 Agent"}
                        >
                            <span className="hidden xl:inline" style={agentOpen ? { color: "var(--background)" } : undefined}>
                                Agent
                            </span>
                        </Button>
                    </Tooltip>
                    <div className="min-w-0 overflow-visible">
                        <UserStatusActions />
                    </div>
                </div>
            </div>
            <nav className="hide-scrollbar flex min-w-0 items-stretch justify-center gap-1 overflow-x-auto border-t border-border/70 px-2 py-1.5 sm:px-4" aria-label="短剧生产阶段" data-drama-stage-navigation>
                {stages.map((item) => {
                    const Icon = item.icon;
                    const active = stage === item.value;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => onStageChange(item.value)}
                            aria-label={`切换到${item.label}`}
                            aria-current={active ? "step" : undefined}
                            className={`flex h-10 min-w-[5.4rem] max-w-40 flex-1 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium transition sm:min-w-[7rem] ${active ? "bg-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            style={active ? { color: "var(--background)" } : undefined}
                        >
                            <Icon className="size-3.5 shrink-0" style={active ? { color: "var(--background)" } : undefined} />
                            <span className="min-w-0 text-left">
                                <span className="block truncate" style={active ? { color: "var(--background)" } : undefined}>
                                    {item.label}
                                </span>
                                <span className="hidden truncate text-[10px] font-normal opacity-65 sm:block" style={active ? { color: "var(--background)" } : undefined}>
                                    {stageStatuses[item.value]}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </nav>
        </header>
    );
}

function dramaStageStatuses(project: DramaProject, episode: DramaEpisode): Record<DramaProjectStage, string> {
    const assets = project.characters.length + project.scenes.length + project.props.length + project.clues.length;
    const tasks = episode.shots.flatMap((shot) => [shot.storyboardStatus, shot.generationStatus, shot.audioStatus]);
    return {
        script: !episode.script.trim() ? "待编辑" : episode.shots.length ? "已整理" : "编辑中",
        review: episode.reviewStatus === "approved" || episode.reviewStatus === "visual_ready" ? "已确认" : episode.reviewStatus === "content_review" ? "待确认" : "待审核",
        assets: assets ? "已准备" : "待补资产",
        storyboard: episode.shots.length && episode.shots.every((shot) => shot.storyboardStatus === "success") ? "已完成" : "待生成",
        generate: tasks.some((status) => status === "queued" || status === "running") ? "生成中" : episode.shots.length && episode.shots.every((shot) => shot.generationStatus === "success") ? "已完成" : "待生成",
    };
}

function episodeProgressLabel(episode: DramaEpisode) {
    if (episode.renderTask?.status === "success") return "整集已完成";
    if (episode.renderTask && ["pending", "running"].includes(episode.renderTask.status)) return "正在合成";
    if (episode.shots.some((shot) => shot.generationStatus === "queued" || shot.generationStatus === "running")) return "镜头生成中";
    if (episode.reviewStatus === "visual_ready") return `${episode.shots.length} 个镜头 · 可生成`;
    if (episode.reviewStatus === "approved") return `${episode.shots.length} 个镜头 · 待视觉设计`;
    if (episode.reviewStatus === "content_review") return `${episode.shots.length} 个镜头 · 待审核`;
    return episode.script.trim() ? "剧本待解析" : "尚未填写剧本";
}

export function DramaScriptPanel({
    project,
    episode,
    analyzing,
    onAnalyze,
    onStageChange,
    selectedShotId,
    onSelectedShotChange,
}: {
    project: DramaProject;
    episode: DramaEpisode;
    analyzing: boolean;
    onAnalyze: () => void;
    onStageChange: (stage: DramaProjectStage) => void;
    selectedShotId?: string;
    onSelectedShotChange: (shotId?: string) => void;
}) {
    const { message, modal } = App.useApp();
    const importEpisodes = useDramaStore((state) => state.importEpisodes);
    const createVersion = useDramaStore((state) => state.createVersion);
    const sourceFileInputRef = useRef<HTMLInputElement>(null);
    const scriptText = episode.script.trim();
    const paragraphCount = scriptText ? scriptText.split(/\n+/).filter((line) => line.trim()).length : 0;

    const importSourceBook = async (file?: File) => {
        if (!file) return;
        try {
            const drafts = splitDramaSource(await file.text());
            if (!drafts.length) return message.warning("导入文件没有可识别的文本内容");
            modal.confirm({
                title: `导入并自动分为 ${drafts.length} 集？`,
                content: "当前剧集会被替换，系统会先保存一个可恢复的版本快照。",
                okText: "导入分集",
                cancelText: "取消",
                onOk: async () => {
                    await createVersion(project, "整本导入前");
                    importEpisodes(project.id, drafts);
                    onStageChange("script");
                    message.success(`已导入 ${drafts.length} 集，请逐集检查并提取内容结构`);
                },
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "整本导入失败");
        } finally {
            if (sourceFileInputRef.current) sourceFileInputRef.current.value = "";
        }
    };

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <DramaStageHeader
                step="01 · 剧本"
                title="剧本与创作方向"
                description="整理本集故事文本与生产基线；AI 只提取可审核的内容结构，不会在这一步生成视觉提示词。"
                status={scriptText ? (episode.shots.length ? "已提取，可重新解析" : "可提取内容") : "等待剧本"}
                tone={scriptText ? "ready" : "attention"}
                metrics={[
                    { label: "字数", value: scriptText.length },
                    { label: "段落", value: paragraphCount },
                    { label: "生产模式", value: project.defaultVideoMode === "storyboard" ? "分镜驱动" : project.defaultVideoMode === "reference" ? "参考图" : "直接生成" },
                ]}
                secondaryAction={
                    <Button className="!h-11 !w-full sm:!h-9 sm:!w-auto" icon={<BookOpenText className="size-4" />} onClick={() => sourceFileInputRef.current?.click()}>
                        导入整本并分集
                    </Button>
                }
                action={
                    <Button type="primary" className="!h-11 !w-full sm:!h-9 sm:!w-auto" icon={<Sparkles className="size-4" />} loading={analyzing} disabled={!scriptText} title={scriptText ? undefined : "请先填写或导入本集剧本"} onClick={onAnalyze}>
                        AI 提取内容结构
                    </Button>
                }
            />
            <input ref={sourceFileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(event) => void importSourceBook(event.target.files?.[0])} />
            <div className="mt-4 flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
                <DramaScriptWorkspace project={project} episode={episode} selectedShotId={selectedShotId} onSelectedShotChange={onSelectedShotChange} analyzing={analyzing} onAnalyze={onAnalyze} onImport={() => sourceFileInputRef.current?.click()} />
            </div>
        </div>
    );
}
