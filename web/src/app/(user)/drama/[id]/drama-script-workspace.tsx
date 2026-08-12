"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Empty, Input, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { BookOpenText, ListTree, SlidersHorizontal, Sparkles, X } from "lucide-react";

import type { DramaEpisode, DramaProject, DramaShot } from "../types";
import { useDramaStore } from "../stores/use-drama-store";
import { DramaEpisodeSettings } from "./drama-episode-settings";
import { DramaSceneStructure } from "./drama-scene-structure";

export function DramaScriptWorkspace({
    project,
    episode,
    selectedShotId,
    onSelectedShotChange,
    analyzing,
    onAnalyze,
    onImport,
}: {
    project: DramaProject;
    episode: DramaEpisode;
    selectedShotId?: string;
    onSelectedShotChange: (shotId?: string) => void;
    analyzing: boolean;
    onAnalyze: () => void;
    onImport: () => void;
}) {
    const updateEpisode = useDramaStore((state) => state.updateEpisode);
    const editorRef = useRef<TextAreaRef>(null);
    const [mobilePanel, setMobilePanel] = useState<"scenes" | "settings">();
    useEffect(() => {
        if (selectedShotId && !episode.shots.some((shot) => shot.id === selectedShotId)) onSelectedShotChange(undefined);
    }, [episode.shots, onSelectedShotChange, selectedShotId]);

    const selectShot = (shot: DramaShot) => {
        onSelectedShotChange(shot.id);
        setMobilePanel(undefined);
        const textarea = editorRef.current?.resizableTextArea?.textArea;
        if (!textarea) return;
        const source = shot.sourceText.trim();
        const start = source ? episode.script.indexOf(source) : -1;
        textarea.focus();
        if (start < 0) return;
        const end = start + source.length;
        textarea.setSelectionRange(start, end);
        const linesBefore = episode.script.slice(0, start).split("\n").length - 1;
        textarea.scrollTop = Math.max(0, linesBefore * 26 - textarea.clientHeight / 3);
    };

    return (
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden min-[1180px]:grid-cols-[220px_minmax(360px,1fr)_292px]" data-drama-script-workspace>
            <div className="hidden min-h-0 min-w-0 min-[1180px]:block">
                <DramaSceneStructure project={project} episode={episode} selectedShotId={selectedShotId} onSelect={selectShot} />
            </div>
            <section className="flex min-h-0 min-w-0 flex-col bg-background" data-drama-script-editor>
                <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                    <div className="min-w-0">
                        <span className="text-xs font-medium text-foreground">纯文本剧本</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">保持现有数据格式</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button type="text" size="small" className="min-[1180px]:!hidden" icon={<ListTree className="size-3.5" />} onClick={() => setMobilePanel("scenes")}>
                            场景结构
                        </Button>
                        <Button type="text" size="small" className="min-[1180px]:!hidden" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setMobilePanel("settings")}>
                            本集设置
                        </Button>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{episode.script.length} 字</span>
                    </div>
                </div>
                {episode.script ? (
                    <Input.TextArea
                        ref={editorRef}
                        value={episode.script}
                        onChange={(event) => updateEpisode(project.id, episode.id, { script: event.target.value })}
                        placeholder="粘贴或编写本集剧本…"
                        className="!min-h-0 !flex-1 !resize-none !rounded-none !border-0 !bg-transparent !px-5 !py-5 !text-[15px] !leading-[26px] !shadow-none focus:!shadow-none"
                        aria-label="本集剧本编辑器"
                    />
                ) : (
                    <div className="grid min-h-[320px] flex-1 place-items-center px-5 py-8">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-sm">粘贴或编写本集剧本，开始整理内容结构</span>}>
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button icon={<BookOpenText className="size-4" />} onClick={onImport}>
                                    导入整本并分集
                                </Button>
                                <Tooltip title="请先添加剧本内容">
                                    <Button type="primary" icon={<Sparkles className="size-4" />} disabled>
                                        AI 整理结构
                                    </Button>
                                </Tooltip>
                            </div>
                        </Empty>
                    </div>
                )}
                {episode.script ? (
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2 min-[1180px]:hidden">
                        <Button size="small" icon={<BookOpenText className="size-3.5" />} onClick={onImport}>
                            导入剧本
                        </Button>
                        <Button size="small" type="primary" icon={<Sparkles className="size-3.5" />} loading={analyzing} onClick={onAnalyze}>
                            AI 整理结构
                        </Button>
                    </div>
                ) : null}
            </section>
            <div className="hidden min-h-0 min-w-0 min-[1180px]:block">
                <DramaEpisodeSettings project={project} episode={episode} />
            </div>
            <Drawer title="场景结构" placement="left" size={300} open={mobilePanel === "scenes"} closable={false} onClose={() => setMobilePanel(undefined)} styles={{ wrapper: { maxWidth: "100vw" }, body: { padding: 0 } }}>
                <div className="flex h-full min-h-0 flex-col">
                    <div className="flex justify-end border-b border-border px-3 py-2">
                        <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={() => setMobilePanel(undefined)}>
                            关闭场景结构
                        </Button>
                    </div>
                    <DramaSceneStructure project={project} episode={episode} selectedShotId={selectedShotId} onSelect={selectShot} />
                </div>
            </Drawer>
            <Drawer title="本集设置" placement="right" size={320} open={mobilePanel === "settings"} closable={false} onClose={() => setMobilePanel(undefined)} styles={{ wrapper: { maxWidth: "100vw" }, body: { padding: 0 } }}>
                <div className="flex h-full min-h-0 flex-col">
                    <div className="flex justify-end border-b border-border px-3 py-2">
                        <Button type="text" size="small" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setMobilePanel(undefined)}>
                            关闭设置
                        </Button>
                    </div>
                    <DramaEpisodeSettings project={project} episode={episode} />
                </div>
            </Drawer>
        </div>
    );
}
