"use client";

import { Button, Empty } from "antd";
import { Plus, Sparkles } from "lucide-react";

import type { DramaEpisode, DramaProject, DramaShot } from "../types";

export function DramaSceneStructure({ project, episode, selectedShotId, onSelect }: { project: DramaProject; episode: DramaEpisode; selectedShotId?: string; onSelect: (shot: DramaShot) => void }) {
    const sceneNames = new Map(project.scenes.map((scene) => [scene.id, scene.name]));
    const characterNames = new Map(project.characters.map((character) => [character.id, character.name]));
    return (
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-border bg-muted/15" data-drama-scene-structure>
            <div className="shrink-0 border-b border-border px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold">场景结构</h3>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{episode.shots.length} 个场景 / 镜头</p>
                    </div>
                    <Button type="text" shape="circle" className="!size-7 !min-w-7" icon={<Plus className="size-3.5" />} disabled aria-label="新增场景" title="场景由 AI 内容整理后生成" />
                </div>
                {episode.shots.length ? (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Sparkles className="size-3 text-[var(--primary)]" />
                        <span>AI 整理后可逐项定位</span>
                    </div>
                ) : null}
            </div>
            <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                {episode.shots.length ? (
                    <div className="space-y-1">
                        {episode.shots.map((shot) => {
                            const active = shot.id === selectedShotId;
                            const characters = shot.characterIds
                                .map((id) => characterNames.get(id))
                                .filter(Boolean)
                                .join("、");
                            return (
                                <button
                                    key={shot.id}
                                    type="button"
                                    className={`w-full rounded-md border px-2.5 py-2 text-left transition ${active ? "border-[var(--primary)]/45 bg-[var(--primary)]/8" : "border-transparent hover:border-border hover:bg-background"}`}
                                    onClick={() => onSelect(shot)}
                                    aria-current={active ? "true" : undefined}
                                >
                                    <span className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                                        <span className="tabular-nums">场景 {String(shot.order).padStart(2, "0")}</span>
                                        <span className="truncate">{sceneNames.get(shot.sceneId || "") || "未分配场景"}</span>
                                    </span>
                                    <span className="mt-1 block truncate text-xs font-medium text-foreground">{shot.title || "未命名镜头"}</span>
                                    <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">{shot.description || shot.sourceText || "暂无场景描述"}</span>
                                    {characters ? <span className="mt-1 block truncate text-[10px] text-muted-foreground">角色：{characters}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成内容整理后生成场景结构" className="!my-8 !text-xs" />
                )}
            </div>
        </aside>
    );
}
