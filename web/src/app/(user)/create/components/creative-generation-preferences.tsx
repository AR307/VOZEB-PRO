"use client";

import { Button, Popover, Select } from "antd";
import { AudioLines, ChevronDown, ImageIcon, Lightbulb, Sparkles, Video } from "lucide-react";
import { useState } from "react";

import { audioFormatLabel, audioFormatOptions, audioVoiceLabel, audioVoiceOptions } from "@/lib/audio-generation";
import type { CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";
import { cn } from "@/lib/utils";

import { creativeComposerToolButtonClass } from "./creative-composer-styles";

export type MediaCapability = "image" | "video" | "audio";

type PreferencePatch = Partial<NonNullable<CreativeGenerationPreferences[MediaCapability]>>;

const imageRatios = [
    { value: "auto", label: "智能", width: 18, height: 18 },
    { value: "1:1", label: "1:1", width: 18, height: 18 },
    { value: "16:9", label: "16:9", width: 24, height: 14 },
    { value: "4:3", label: "4:3", width: 21, height: 16 },
    { value: "3:2", label: "3:2", width: 23, height: 15 },
    { value: "2:3", label: "2:3", width: 15, height: 23 },
    { value: "3:4", label: "3:4", width: 16, height: 21 },
    { value: "9:16", label: "9:16", width: 14, height: 24 },
] as const;

const videoRatios = [
    { value: "auto", label: "智能", width: 18, height: 18 },
    { value: "21:9", label: "21:9", width: 26, height: 11 },
    { value: "16:9", label: "16:9", width: 24, height: 14 },
    { value: "4:3", label: "4:3", width: 21, height: 16 },
    { value: "1:1", label: "1:1", width: 18, height: 18 },
    { value: "3:4", label: "3:4", width: 16, height: 21 },
    { value: "9:16", label: "9:16", width: 14, height: 24 },
] as const;

const imageQualityOptions = [
    { value: "auto", label: "智能画质", shortLabel: "智能" },
    { value: "high", label: "高画质", shortLabel: "高" },
    { value: "medium", label: "中画质", shortLabel: "中" },
    { value: "low", label: "低画质", shortLabel: "低" },
] as const;

const videoQualityOptions = [
    { value: "auto", label: "智能清晰度", shortLabel: "智能" },
    { value: "480", label: "480P", shortLabel: "480P" },
    { value: "720", label: "720P", shortLabel: "720P" },
    { value: "1080", label: "1080P", shortLabel: "1080P" },
] as const;

const videoDurationOptions = [
    { value: 5, label: "5 秒" },
    { value: 10, label: "10 秒" },
] as const;

const videoReferenceModeOptions = [
    { value: "reference", label: "智能参考" },
    { value: "first_frame", label: "首帧" },
    { value: "first_last", label: "首尾帧" },
] as const;

export function CreativeGenerationPreferences({
    capability,
    capabilities = [capability],
    preferences,
    triggerLabel,
    placement = "topLeft",
    onCapabilityChange,
    onChange,
}: {
    capability: MediaCapability;
    capabilities?: readonly MediaCapability[];
    preferences: CreativeGenerationPreferences;
    triggerLabel?: string;
    placement?: "topLeft" | "bottomLeft";
    onCapabilityChange?: (capability: MediaCapability) => void;
    onChange: (patch: PreferencePatch) => void;
}) {
    const [open, setOpen] = useState(false);
    const availableCapabilities = capabilities.length ? capabilities : [capability];
    const activeCapability = availableCapabilities.includes(capability) ? capability : availableCapabilities[0];
    const summary = triggerLabel || generationPreferenceSummary(activeCapability, preferences);

    return (
        <Popover
            trigger="click"
            placement={placement}
            autoAdjustOverflow={false}
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            styles={{ container: { padding: 10, borderRadius: 16 } }}
            content={
                <div className="hide-scrollbar max-h-[calc(100vh-80px)] w-[304px] max-w-[calc(100vw-32px)] overflow-y-auto">
                    {availableCapabilities.length > 1 ? (
                        <div className={cn("mb-2 grid gap-1 rounded-lg bg-[#f1f3f5] p-0.5 dark:bg-[#252a31]", availableCapabilities.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                            {availableCapabilities.map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={cn(
                                        "inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] text-[11px] font-medium transition",
                                        activeCapability === item
                                            ? "bg-white text-[#20242a] shadow-sm dark:bg-[#343b44] dark:text-white"
                                            : "text-[#7b8591] hover:bg-white/60 hover:text-[#20242a] dark:text-[#8f99a5] dark:hover:bg-[#30363e] dark:hover:text-white",
                                    )}
                                    onClick={() => onCapabilityChange?.(item)}
                                    aria-pressed={activeCapability === item}
                                >
                                    <CreativeModeIcon mode={item} />
                                    {mediaCapabilityLabel(item)}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    <PreferencePanel capability={activeCapability} preferences={preferences} onChange={onChange} />
                </div>
            }
        >
            <Button type="text" className={creativeComposerToolButtonClass(open)} icon={<PreferenceSummaryIcon capability={activeCapability} preferences={preferences} />} aria-label={`生成参数：${summary}`} aria-haspopup="menu" aria-expanded={open}>
                <span className="max-w-[132px] truncate text-xs font-medium sm:max-w-[176px]">{summary}</span>
                <ChevronDown className="size-3.5 shrink-0" />
            </Button>
        </Popover>
    );
}

function PreferencePanel({ capability, preferences, onChange }: { capability: MediaCapability; preferences: CreativeGenerationPreferences; onChange: (patch: PreferencePatch) => void }) {
    if (capability === "audio") {
        return (
            <div className="grid grid-cols-2 gap-1.5">
                <PreferenceSelect label="音色" ariaLabel="选择音色" value={preferences.audio?.voice || "alloy"} options={audioVoiceOptions} onChange={(voice) => onChange({ voice })} />
                <PreferenceSelect label="格式" ariaLabel="选择音频格式" value={preferences.audio?.format || "mp3"} options={audioFormatOptions} onChange={(format) => onChange({ format })} />
            </div>
        );
    }

    const ratios = capability === "image" ? imageRatios : videoRatios;
    const selectedSize = capability === "image" ? preferences.image?.size || "auto" : preferences.video?.size || "auto";
    const selectedQuality = capability === "image" ? preferences.image?.quality || "auto" : preferences.video?.quality || "auto";
    const qualityOptions = capability === "image" ? imageQualityOptions : videoQualityOptions;

    return (
        <div className="grid gap-2.5">
            {capability === "video" ? (
                <CompactOptionGroup label="参考方式" ariaLabel="选择视频参考方式" value={preferences.video?.referenceMode || "reference"} options={videoReferenceModeOptions} columns={3} onChange={(referenceMode) => onChange({ referenceMode })} />
            ) : null}
            <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium text-[#7b8591] dark:text-[#98a2ae]">比例</p>
                    <span className="text-[10px] text-[#a0a8b2] dark:text-[#707b88]">{selectedSize === "auto" ? "智能" : selectedSize}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                    {ratios.map((ratio) => (
                        <button
                            key={ratio.value}
                            type="button"
                            className={cn(
                                "inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-[11px] transition",
                                selectedSize === ratio.value
                                    ? "bg-[#eaf1f5] font-medium text-[#315d78] dark:bg-[#2a3b46] dark:text-[#a8c8dc]"
                                    : "bg-[#f5f6f7] text-[#687481] hover:bg-[#edf0f2] hover:text-[#20242a] dark:bg-[#24282e] dark:text-[#a6afb9] dark:hover:bg-[#30363e] dark:hover:text-white",
                            )}
                            onClick={() => onChange({ size: ratio.value })}
                            aria-label={`选择${capability === "image" ? "图片" : "视频"}比例 ${ratio.label}`}
                            aria-pressed={selectedSize === ratio.value}
                        >
                            <span className="grid h-4 w-5 shrink-0 place-items-center">
                                {ratio.value === "auto" ? <Sparkles className="size-3.5" /> : <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: ratio.width * 0.64, height: ratio.height * 0.64 }} />}
                            </span>
                            <span>{ratio.label}</span>
                        </button>
                    ))}
                </div>
            </div>
            <CompactOptionGroup label={capability === "image" ? "画质" : "清晰度"} ariaLabel={`选择${capability === "image" ? "图片画质" : "视频清晰度"}`} value={selectedQuality} options={qualityOptions} onChange={(quality) => onChange({ quality })} />
            {capability === "video" ? <CompactOptionGroup label="时长" ariaLabel="选择视频时长" value={preferences.video?.seconds || 5} options={videoDurationOptions} columns={2} onChange={(seconds) => onChange({ seconds })} /> : null}
        </div>
    );
}

function CompactOptionGroup<T extends string | number>({
    label,
    ariaLabel,
    value,
    options,
    columns = 4,
    onChange,
}: {
    label: string;
    ariaLabel: string;
    value: T;
    options: readonly { value: T; label: string; shortLabel?: string }[];
    columns?: 2 | 3 | 4;
    onChange: (value: T) => void;
}) {
    return (
        <div className="grid gap-1.5">
            <p className="text-[11px] font-medium text-[#7b8591] dark:text-[#98a2ae]">{label}</p>
            <div className={cn("grid gap-1", columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-4")} role="group" aria-label={ariaLabel}>
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={cn(
                            "h-8 min-w-0 rounded-lg px-1 text-[11px] transition",
                            value === option.value
                                ? "bg-[#eaf1f5] font-medium text-[#315d78] dark:bg-[#2a3b46] dark:text-[#a8c8dc]"
                                : "bg-[#f5f6f7] text-[#687481] hover:bg-[#edf0f2] hover:text-[#20242a] dark:bg-[#24282e] dark:text-[#a6afb9] dark:hover:bg-[#30363e] dark:hover:text-white",
                        )}
                        onClick={() => onChange(option.value)}
                        aria-label={`${ariaLabel} ${option.label}`}
                        aria-pressed={value === option.value}
                    >
                        {option.shortLabel || option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function PreferenceSelect<T extends string | number>({ label, ariaLabel, value, options, onChange }: { label: string; ariaLabel: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
    return (
        <label className="grid min-w-0 gap-0.5 rounded-lg bg-[#f5f6f7] px-2 py-1 text-[10px] text-[#8b949f] dark:bg-[#24282e] dark:text-[#7f8996]">
            {label}
            <Select size="small" variant="borderless" className="w-full" value={value} options={[...options]} onChange={onChange} aria-label={ariaLabel} />
        </label>
    );
}

function PreferenceSummaryIcon({ capability, preferences }: { capability: MediaCapability; preferences: CreativeGenerationPreferences }) {
    if (capability === "audio") return <AudioLines className="size-4" />;
    const size = capability === "image" ? preferences.image?.size : preferences.video?.size;
    const ratio = (capability === "image" ? imageRatios : videoRatios).find((item) => item.value === size);
    if (!ratio || ratio.value === "auto") return <Sparkles className="size-4" />;
    return (
        <span className="grid size-4 place-items-center" aria-hidden="true">
            <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: Math.max(8, ratio.width * 0.55), height: Math.max(7, ratio.height * 0.55) }} />
        </span>
    );
}

export function generationPreferenceSummary(capability: MediaCapability, preferences: CreativeGenerationPreferences) {
    if (capability === "audio") return `${audioVoiceLabel(preferences.audio?.voice || "alloy")} · ${audioFormatLabel(preferences.audio?.format || "mp3")}`;
    const size = capability === "image" ? preferences.image?.size || "auto" : preferences.video?.size || "auto";
    const quality = capability === "image" ? preferences.image?.quality || "auto" : preferences.video?.quality || "auto";
    const sizeLabel = size === "auto" ? "智能比例" : size;
    const qualityLabel = (capability === "image" ? imageQualityOptions : videoQualityOptions).find((item) => item.value === quality)?.label || quality;
    const referenceLabel = capability === "video" ? videoReferenceModeOptions.find((item) => item.value === (preferences.video?.referenceMode || "reference"))?.label : undefined;
    if (size === "auto" && quality === "auto") return capability === "video" ? `智能参数 · ${preferences.video?.seconds || 5}秒` : "智能参数";
    return capability === "video" ? `${sizeLabel} · ${qualityLabel} · ${preferences.video?.seconds || 5}秒${referenceLabel && referenceLabel !== "智能参考" ? ` · ${referenceLabel}` : ""}` : `${sizeLabel} · ${qualityLabel}`;
}

export function mediaCapabilityLabel(capability: MediaCapability) {
    return capability === "image" ? "图片" : capability === "video" ? "视频" : "音频";
}

export function CreativeModeIcon({ mode }: { mode: "agent" | MediaCapability }) {
    if (mode === "image") return <ImageIcon className="size-4" />;
    if (mode === "video") return <Video className="size-4" />;
    if (mode === "audio") return <AudioLines className="size-4" />;
    return <Lightbulb className="size-4" />;
}

export const creativeModeOptions = [
    { value: "agent", label: "Agent 模式", description: "自动理解需求并匹配能力" },
    { value: "image", label: "图片生成", description: "生成或编辑图片" },
    { value: "video", label: "视频生成", description: "文生视频或图生视频" },
    { value: "audio", label: "音频生成", description: "配音、旁白和音频" },
] as const;
