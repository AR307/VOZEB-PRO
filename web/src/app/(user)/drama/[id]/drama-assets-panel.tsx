"use client";

import { App, Button, Empty, Image, Input, Popconfirm, Tooltip } from "antd";
import { FileText, ImagePlus, KeyRound, MapPinned, Package, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentMediaPreview } from "@/components/agent/agent-media-preview";
import type { DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { useDramaStore } from "../stores/use-drama-store";
import { DRAMA_ASSET_DEFINITIONS, type DramaAssetKind } from "./drama-asset-definitions";
import { DramaAssetEditorDrawer } from "./drama-asset-editor-drawer";
import { dramaAssetReferences } from "./drama-asset-reference-utils";
import { DramaStageHeader } from "./drama-editor-elements";

export { imageResultsToReferences } from "./drama-asset-reference-utils";

const assetKinds: DramaAssetKind[] = ["characters", "scenes", "props", "clues"];
const assetIcons = { characters: Users, scenes: MapPinned, props: Package, clues: KeyRound } satisfies Record<DramaAssetKind, typeof Users>;

export function DramaAssetsPanel({ project }: { project: DramaProject }) {
    const { message } = App.useApp();
    const removeAsset = useDramaStore((state) => state.removeAsset);
    const [activeKind, setActiveKind] = useState<DramaAssetKind>("characters");
    const [query, setQuery] = useState("");
    const [editor, setEditor] = useState<{ kind: DramaAssetKind; assetId?: string }>();
    const definition = DRAMA_ASSET_DEFINITIONS[activeKind];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const items = useMemo(
        () =>
            project[activeKind].filter((item) => {
                if (!normalizedQuery) return true;
                return `${item.name}\n${item.description}`.toLocaleLowerCase().includes(normalizedQuery);
            }),
        [activeKind, normalizedQuery, project],
    );
    const totalAssets = assetKinds.reduce((total, kind) => total + project[kind].length, 0);
    const missingPrimaryCount = assetKinds.reduce((total, kind) => total + project[kind].filter((item) => !dramaAssetReferences(item).length).length, 0);

    return (
        <div className="min-w-0">
            <DramaStageHeader
                step="03 · 视觉资产"
                title="视觉资产"
                description="用卡片浏览角色、场景、道具与线索；完整设定、配音和参考图在详情中按需编辑。"
                status={!totalAssets ? "等待资产" : missingPrimaryCount ? "需要补充基准图" : "资产已就绪"}
                tone={!totalAssets || missingPrimaryCount ? "attention" : "ready"}
                metrics={[
                    { label: "资产", value: totalAssets },
                    { label: "待补基准图", value: missingPrimaryCount },
                    { label: "来源素材", value: project.sourceAssets?.length || 0 },
                ]}
                action={
                    <Button type="primary" className="!h-11 !w-full sm:!h-9 sm:!w-auto" icon={<Plus className="size-4" />} onClick={() => setEditor({ kind: activeKind })}>
                        新建{definition.title}
                    </Button>
                }
            />

            <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-2.5 lg:flex-row lg:items-center lg:justify-between">
                <nav className="hide-scrollbar flex min-w-0 gap-1 overflow-x-auto" aria-label="视觉资产分类">
                    {assetKinds.map((kind) => {
                        const itemDefinition = DRAMA_ASSET_DEFINITIONS[kind];
                        const Icon = assetIcons[kind];
                        const active = activeKind === kind;
                        return (
                            <button
                                key={kind}
                                type="button"
                                className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${active ? "bg-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                style={active ? { color: "var(--background)" } : undefined}
                                onClick={() => {
                                    setActiveKind(kind);
                                    setQuery("");
                                }}
                                aria-current={active ? "page" : undefined}
                            >
                                <Icon className="size-4" style={active ? { color: "var(--background)" } : undefined} />
                                <span style={active ? { color: "var(--background)" } : undefined}>{itemDefinition.title}</span>
                                <span className={`text-xs tabular-nums ${active ? "opacity-65" : "text-muted-foreground"}`} style={active ? { color: "var(--background)" } : undefined}>
                                    {project[kind].length}
                                </span>
                            </button>
                        );
                    })}
                </nav>
                <div className="min-w-0 lg:w-72 lg:shrink-0">
                    <Input allowClear prefix={<Search className="size-4 text-muted-foreground" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${definition.title}名称或用途`} />
                </div>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold">{definition.title}库</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{definition.description}</p>
                </div>
                {normalizedQuery ? <span className="shrink-0 text-xs text-muted-foreground">找到 {items.length} 项</span> : null}
            </div>

            {items.length ? (
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-drama-asset-grid>
                    {items.map((item) => (
                        <DramaAssetCard
                            key={item.id}
                            project={project}
                            kind={activeKind}
                            item={item}
                            onEdit={() => setEditor({ kind: activeKind, assetId: item.id })}
                            onDelete={() => {
                                removeAsset(project.id, activeKind, item.id);
                                message.success(`${definition.title}已删除`);
                            }}
                        />
                    ))}
                </div>
            ) : (
                <div className="mt-3 grid min-h-56 place-items-center rounded-xl border border-dashed border-border bg-card/60 px-4 py-8">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={normalizedQuery ? `没有匹配“${query.trim()}”的${definition.title}` : `还没有${definition.title}资产，请使用页面顶部主操作创建`} />
                </div>
            )}

            {project.sourceAssets?.length ? <DramaSourceAssetStrip project={project} /> : null}

            <DramaAssetEditorDrawer project={project} kind={editor?.kind || activeKind} assetId={editor?.assetId} open={Boolean(editor)} onClose={() => setEditor(undefined)} />
        </div>
    );
}

function DramaAssetCard({ project, kind, item, onEdit, onDelete }: { project: DramaProject; kind: DramaAssetKind; item: DramaNamedAsset; onEdit: () => void; onDelete: () => void }) {
    const definition = DRAMA_ASSET_DEFINITIONS[kind];
    const references = dramaAssetReferences(item);
    const primary = references.find((reference) => reference.id === item.primaryReferenceId) || references[0];
    const usageCount = assetUsageCount(project, kind, item.id);

    return (
        <article className="group min-w-0 overflow-hidden rounded-xl border border-border bg-card transition hover:border-foreground/20 hover:shadow-[0_12px_32px_rgba(15,23,42,.08)]">
            <button type="button" className="block w-full text-left" onClick={onEdit} aria-label={`编辑${definition.title}：${item.name}`}>
                <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden bg-muted/55">
                    {primary?.url ? (
                        <Image src={imagePreviewUrl(primary.url, 640)} alt={`${item.name}基准图`} rootClassName="!block !size-full" className="!size-full !object-cover transition duration-300 group-hover:scale-[1.02]" preview={false} />
                    ) : (
                        <div className="grid gap-2 text-center text-muted-foreground">
                            <ImagePlus className="mx-auto size-6" />
                            <span className="text-xs">待补基准图</span>
                        </div>
                    )}
                </div>
                <div className="min-w-0 p-3.5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                        <h4 className="truncate font-semibold">{item.name}</h4>
                        <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${primary ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300"}`}
                        >
                            {primary ? "已设基准" : "待补基准"}
                        </span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{item.description || `还没有填写${definition.label}用途`}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{references.length} 张候选</span>
                        <span>{usageCount} 个镜头引用</span>
                    </div>
                </div>
            </button>
            <div className="flex min-h-10 items-center border-t border-border px-2">
                <Button type="text" className="!h-8 !min-w-0 !flex-1 !justify-start !px-2 !text-xs" icon={<Pencil className="size-3.5" />} onClick={onEdit}>
                    编辑设定
                </Button>
                <Popconfirm title={`删除${definition.title}“${item.name}”？`} description="关联镜头中的资产引用会同步移除。" okText="删除" cancelText="取消" onConfirm={onDelete}>
                    <Tooltip title={`删除${definition.title}`}>
                        <Button
                            type="text"
                            shape="circle"
                            className="!size-8 !min-w-8 !text-muted-foreground hover:!bg-rose-50 hover:!text-rose-600 dark:hover:!bg-rose-950/30 dark:hover:!text-rose-300"
                            icon={<Trash2 className="size-3.5" />}
                            aria-label={`删除${definition.title}：${item.name}`}
                        />
                    </Tooltip>
                </Popconfirm>
            </div>
        </article>
    );
}

function DramaSourceAssetStrip({ project }: { project: DramaProject }) {
    return (
        <section className="mt-7 border-t border-border pt-5">
            <div>
                <h3 className="text-sm font-semibold">项目来源素材</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">从统一 Agent 或项目交接带入的原始素材会继续保留，可供项目 Agent 与后续生成引用。</p>
            </div>
            <div className="hide-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1">
                {project.sourceAssets?.map((asset) => {
                    const url = asset.serverUrl || asset.remoteUrl || "";
                    return (
                        <article key={asset.id} className="w-36 shrink-0 overflow-hidden rounded-xl border border-border bg-card">
                            <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-muted/55">
                                {url && asset.type !== "text" ? <AgentMediaPreview type={asset.type} url={url} title={asset.title || "项目来源素材"} className="size-full" /> : <FileText className="size-5 text-muted-foreground" />}
                            </div>
                            <div className="p-2.5">
                                <div className="truncate text-xs font-medium" title={asset.title}>
                                    {asset.title || "未命名素材"}
                                </div>
                                <div className="mt-1 text-[11px] uppercase text-muted-foreground">{asset.type}</div>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function assetUsageCount(project: DramaProject, kind: DramaAssetKind, assetId: string) {
    return project.episodes.reduce(
        (total, episode) =>
            total +
            episode.shots.filter((shot) => {
                if (kind === "characters") return shot.characterIds.includes(assetId);
                if (kind === "scenes") return shot.sceneId === assetId;
                if (kind === "props") return shot.propIds.includes(assetId);
                return shot.clueIds.includes(assetId);
            }).length,
        0,
    );
}
