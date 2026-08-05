"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FilePenLine, Image as ImageIcon, LayoutPanelTop, Music2, Paperclip, Send, SlidersHorizontal, Sparkles, Video } from "lucide-react";

import { createAgentPromptHref } from "@/lib/create-agent-prompt";
import { HOME_CREATION_MODES, HOME_PROMPT_EXAMPLES, type HomeCreationMode } from "./home-data";
import { useHomeActions } from "./home-actions";
import styles from "./home.module.css";

const modeIcons = {
    writing: FilePenLine,
    image: ImageIcon,
    video: Video,
    audio: Music2,
    script: LayoutPanelTop,
} as const;

const planningModes = [
    { id: "smart", label: "智能模式", description: "AI 自动规划创作流程", icon: Sparkles },
    { id: "manual", label: "手动模式", description: "按你的设置执行", icon: SlidersHorizontal },
] as const;

type PlanningMode = (typeof planningModes)[number]["id"];

export function HomeAgentHero() {
    const [prompt, setPrompt] = useState("");
    const [mode, setMode] = useState<HomeCreationMode>("writing");
    const [planningMode, setPlanningMode] = useState<PlanningMode>("smart");
    const [planningOpen, setPlanningOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const planningMenuRef = useRef<HTMLDivElement>(null);
    const planningTriggerRef = useRef<HTMLButtonElement>(null);
    const { authenticated, openLogin, startCreating } = useHomeActions();
    const nextPath = createAgentPromptHref(prompt);

    const submit = () => {
        if (!prompt.trim()) {
            textareaRef.current?.focus();
            return;
        }
        startCreating(prompt);
    };

    useEffect(() => {
        if (!planningOpen) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!planningMenuRef.current?.contains(event.target as Node)) setPlanningOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setPlanningOpen(false);
            planningTriggerRef.current?.focus();
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [planningOpen]);

    const selectPlanningMode = (value: PlanningMode) => {
        setPlanningOpen(false);
        if (value === "manual" && !authenticated) {
            openLogin(nextPath);
            return;
        }
        setPlanningMode(value);
    };

    return (
        <section className={styles.hero} aria-labelledby="home-hero-title">
            <span className={`${styles.crystal} ${styles.crystalOne}`} aria-hidden="true" />
            <span className={`${styles.crystal} ${styles.crystalTwo}`} aria-hidden="true" />
            <span className={`${styles.crystal} ${styles.crystalThree}`} aria-hidden="true" />
            <div className={styles.heroContent}>
                <h1 id="home-hero-title" className={styles.heroTitle}>
                    释放想象，<span>AI</span> 帮你实现
                </h1>
                <p className={styles.heroSubtitle}>新一代 AI 内容创作平台，输入你的想法，AI 为你生成高质量内容</p>

                <div className={styles.agentStage}>
                    <div className={styles.agentGlow} data-testid="home-agent-halo" aria-hidden="true">
                        <span className={`${styles.haloRing} ${styles.haloRingOne}`} data-halo-ring />
                        <span className={`${styles.haloRing} ${styles.haloRingTwo}`} data-halo-ring />
                        <span className={`${styles.haloRing} ${styles.haloRingThree}`} data-halo-ring />
                        <span className={`${styles.haloRing} ${styles.haloRingFour}`} data-halo-ring />
                        <span className={`${styles.haloRing} ${styles.haloRingFive}`} data-halo-ring />
                        <span className={`${styles.haloRing} ${styles.haloRingSix}`} data-halo-ring />
                        <span className={styles.haloCenterGlow} />
                        <span className={styles.haloFrontGlow} />
                    </div>
                    <div className={styles.agentCard} data-testid="home-agent-card">
                        <label htmlFor="home-agent-prompt" className={styles.srOnly}>
                            描述你想创作的内容
                        </label>
                        <textarea
                            ref={textareaRef}
                            id="home-agent-prompt"
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={(event) => {
                                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
                            }}
                            className={styles.agentTextarea}
                            placeholder="描述你想创作的内容，比如："
                            rows={2}
                        />

                        <div className={styles.promptExamples} aria-label="示例提示词">
                            {HOME_PROMPT_EXAMPLES.map((example) => (
                                <button key={example} type="button" onClick={() => setPrompt(example)}>
                                    {example}
                                </button>
                            ))}
                        </div>

                        <div className={styles.agentToolbar}>
                            <div ref={planningMenuRef} className={styles.planningSelectWrap}>
                                <button
                                    ref={planningTriggerRef}
                                    type="button"
                                    className={styles.planningTrigger}
                                    aria-label="选择 Agent 模式"
                                    aria-haspopup="listbox"
                                    aria-expanded={planningOpen}
                                    onClick={() => setPlanningOpen(!planningOpen)}
                                    onKeyDown={(event) => {
                                        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                                        event.preventDefault();
                                        setPlanningOpen(true);
                                    }}
                                >
                                    <Sparkles aria-hidden="true" />
                                    <span>{planningModes.find((item) => item.id === planningMode)?.label}</span>
                                    <ChevronDown className={planningOpen ? styles.planningChevronOpen : undefined} aria-hidden="true" />
                                </button>
                                {planningOpen ? (
                                    <div className={styles.planningMenu} role="listbox" aria-label="Agent 模式">
                                        {planningModes.map((item) => {
                                            const Icon = item.icon;
                                            const selected = planningMode === item.id;
                                            return (
                                                <button key={item.id} type="button" role="option" aria-selected={selected} onClick={() => selectPlanningMode(item.id)}>
                                                    <Icon aria-hidden="true" />
                                                    <span>
                                                        <strong>{item.label}</strong>
                                                        <small>{item.description}</small>
                                                    </span>
                                                    {selected ? <Check className={styles.planningCheck} aria-hidden="true" /> : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                            <div className={styles.creationModes} aria-label="创作模式">
                                {HOME_CREATION_MODES.map((item) => {
                                    const Icon = modeIcons[item.icon];
                                    return (
                                        <button key={item.id} type="button" className={mode === item.id ? styles.modeActive : undefined} onClick={() => setMode(item.id)} aria-pressed={mode === item.id}>
                                            <Icon aria-hidden="true" />
                                            <span>{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className={styles.agentTools}>
                                <button type="button" aria-label="添加附件" title="添加附件" onClick={() => (authenticated ? startCreating(prompt) : openLogin(nextPath))}>
                                    <Paperclip aria-hidden="true" />
                                </button>
                                <button type="button" className={styles.sendButton} aria-label="发送到创作 Agent" title="发送" onClick={submit}>
                                    <Send aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
