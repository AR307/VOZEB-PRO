"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Modal } from "antd";
import { BookOpen, Bot, Check, Images, LoaderCircle, Menu, Plus, Redo2, RefreshCw, Sparkles, Trash2, Undo2, Upload } from "lucide-react";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasProjectSaveState } from "../stores/use-canvas-store";

export function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    saveState,
    onRetrySave,
    canUndo,
    canRedo,
    onWorkbench,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onImportImage,
    onUndo,
    onRedo,
    agentOpen,
    compactAgentStatus,
    onToggleAgent,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    saveState?: CanvasProjectSaveState;
    onRetrySave: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onWorkbench: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onImportImage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    agentOpen: boolean;
    compactAgentStatus?: { connected: boolean; enabled: boolean; activity: string };
    onToggleAgent: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const menuTriggerRef = useRef<HTMLButtonElement>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    useEffect(() => {
        if (!menuOpen) return;
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (menuTriggerRef.current?.contains(target)) return;
            if (target instanceof Element && target.closest(".ant-dropdown, .ant-dropdown-menu, .ant-dropdown-menu-submenu, .ant-dropdown-menu-submenu-popup")) return;
            setMenuOpen(false);
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [menuOpen]);

    return (
        <>
            <div className="canvas-topbar pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-16 items-center justify-between gap-2 px-4">
                <div className="canvas-topbar-left pointer-events-auto flex min-w-0 items-center gap-3">
                    <Dropdown
                        open={menuOpen}
                        onOpenChange={setMenuOpen}
                        trigger={["click"]}
                        menu={{
                            onClick: () => setMenuOpen(false),
                            items: [
                                { key: "workbench", icon: <Sparkles className="size-4" />, label: "工作台", onClick: onWorkbench },
                                { key: "docs", icon: <BookOpen className="size-4" />, label: "使用帮助", onClick: () => window.location.assign("/help?section=canvas") },
                                { key: "projects", icon: <Images className="size-4" />, label: "我的画布", onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: "新建画布", onClick: onCreateProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除当前画布", onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "import", icon: <Upload className="size-4" />, label: "导入素材", onClick: onImportImage },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text="撤销" shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button ref={menuTriggerRef} type="button" className="grid size-9 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label="打开画布菜单">
                            <Menu className="size-5" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="canvas-topbar-title flex min-w-0 items-center gap-2">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="w-[min(280px,48vw)] max-w-[280px] bg-transparent p-0 text-left text-lg font-semibold tracking-normal outline-none"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="canvas-topbar-title-button max-w-[280px] truncate border-b border-dashed border-transparent text-left text-lg font-semibold tracking-normal transition hover:border-current"
                                onDoubleClick={onStartTitleEditing}
                                title="双击修改画布名称"
                            >
                                {title}
                            </button>
                        )}
                        <CanvasSaveStatus state={saveState} onRetry={onRetrySave} />
                    </div>
                </div>

                <div className="canvas-topbar-actions pointer-events-auto flex min-w-0 items-center gap-1.5">
                    {compactAgentStatus ? <CompactAgentStatus status={compactAgentStatus} onClick={onToggleAgent} /> : null}
                    <UserStatusActions variant="canvas" onOpenShortcuts={() => setShortcutsOpen(true)} />
                    {!agentOpen ? (
                        <>
                            <span className="canvas-topbar-divider h-6 w-px" style={{ background: theme.toolbar.border }} />
                            <Button
                                type="text"
                                className="canvas-agent-button !font-medium"
                                style={{ color: theme.toolbar.item, height: 36, minHeight: 36, paddingInline: 8 }}
                                icon={<Bot className="size-4" />}
                                onClick={onToggleAgent}
                                aria-label="Agent 对话"
                            >
                                Agent 对话
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>
            <Modal title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["拖动画布"]} value="平移视图" theme={theme} />
                    <Shortcut keys={["滚轮"]} value="缩放画布" theme={theme} />
                    <Shortcut keys={["缩放滑杆"]} value="精确调整缩放" theme={theme} />
                    <Shortcut keys={["Ctrl / Cmd", "拖动"]} value="框选多个节点" theme={theme} />
                    <Shortcut keys={["Shift / Ctrl / Cmd", "点击"]} value="追加选择节点" theme={theme} />
                    <Shortcut keys={["Ctrl / Cmd", "A"]} value="全选节点" theme={theme} />
                    <Shortcut keys={["Ctrl / Cmd", "C / V"]} value="复制 / 粘贴节点，或粘贴剪切板文本/图片" theme={theme} />
                    <Shortcut keys={["Ctrl / Cmd", "Z"]} value="撤销" theme={theme} />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value="重做" theme={theme} />
                    <Shortcut keys={["Ctrl / Cmd", "Y"]} value="重做" theme={theme} />
                    <Shortcut keys={["Delete / Backspace"]} value="删除选中" theme={theme} />
                    <Shortcut keys={["Esc"]} value="取消选择并关闭浮层" theme={theme} />
                    <Shortcut keys={["拖入图片/视频/音频"]} value="上传到画布" theme={theme} />
                </div>
            </Modal>
        </>
    );
}

function CanvasSaveStatus({ state, onRetry }: { state?: CanvasProjectSaveState; onRetry: () => void }) {
    const theme = canvasThemes[useThemeStore((current) => current.theme)];
    if (state?.status === "saving") {
        return (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs" style={{ color: theme.node.muted }} aria-label="正在保存画布">
                <LoaderCircle className="size-3.5 motion-safe:animate-spin" />
                <span className="hidden sm:inline">保存中</span>
            </span>
        );
    }
    if (state?.status === "error") {
        return (
            <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs transition hover:opacity-70" style={{ color: theme.node.danger }} onClick={onRetry} title={state.message || "保存失败，点击重试"} aria-label="保存失败，点击重试">
                <RefreshCw className="size-3.5" />
                <span className="hidden sm:inline">保存失败</span>
            </button>
        );
    }
    if (state?.status === "conflict") {
        return (
            <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 text-xs transition hover:opacity-70"
                style={{ color: theme.node.danger }}
                onClick={onRetry}
                title={state.message || "版本冲突，点击刷新"}
                aria-label="画布版本冲突，点击刷新"
            >
                <RefreshCw className="size-3.5" />
                <span className="hidden sm:inline">版本冲突</span>
            </button>
        );
    }
    return (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs" style={{ color: theme.node.muted }} aria-label="画布已保存">
            <Check className="size-3.5" />
            <span className="hidden sm:inline">已保存</span>
        </span>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function CompactAgentStatus({ status, onClick }: { status: { connected: boolean; enabled: boolean; activity: string }; onClick: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const label = status.connected ? "已连接到本地 Codex" : status.enabled ? status.activity || "连接中" : "正在连接本地 Codex";
    const dotColor = status.connected ? "#22c55e" : status.enabled ? "#f59e0b" : theme.node.muted;
    return (
        <button
            type="button"
            className="flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            style={{ background: "transparent", color: theme.node.text }}
            onClick={onClick}
            title="打开本地 Codex 面板"
        >
            <span className="size-2 rounded-full" style={{ background: dotColor }} />
            <span className="max-w-[120px] truncate sm:max-w-[180px]">{label}</span>
        </button>
    );
}

function Shortcut({ keys, value, theme }: { keys: string[]; value: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
                            style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover, color: theme.toolbar.item }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}
