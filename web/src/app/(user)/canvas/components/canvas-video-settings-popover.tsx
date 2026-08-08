"use client";

import { VideoSettingsPanel, videoResolutionLabel, videoSecondsLabel, videoSizeLabel } from "@/components/video-settings-panel";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasNodeMetadata } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { canvasVideoReferenceModeLabel } from "../utils/canvas-video-references";
import { CanvasSettingsPopoverShell, type CanvasSettingsPopoverPlacement } from "./canvas-settings-popover-shell";
import { CanvasVideoReferenceSettings } from "./canvas-video-reference-settings";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    metadata?: CanvasNodeMetadata;
    references: CanvasResourceReference[];
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMetadataChange: (patch: Partial<CanvasNodeMetadata>) => void;
    buttonClassName?: string;
    placement?: CanvasSettingsPopoverPlacement;
};

export function CanvasVideoSettingsPopover({ config, metadata, references, onConfigChange, onMetadataChange, buttonClassName, placement = "topLeft" }: CanvasVideoSettingsPopoverProps) {
    const label = `${canvasVideoReferenceModeLabel(metadata?.videoReferenceMode)} · ${videoResolutionLabel(config.vquality)} · ${videoSizeLabel(config.size)} · ${videoSecondsLabel(config.videoSeconds)}`;
    return (
        <CanvasSettingsPopoverShell label={label} buttonClassName={buttonClassName} defaultButtonClassName="!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5" placement={placement} buttonAriaLabel={`视频设置：${label}`}>
            {(theme) => (
                <div className="space-y-4">
                    <div className="text-lg font-semibold" style={{ color: theme.node.text }}>
                        视频设置
                    </div>
                    <CanvasVideoReferenceSettings metadata={metadata} references={references} theme={theme} onChange={onMetadataChange} />
                    <VideoSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} showTitle={false} className="space-y-4" />
                </div>
            )}
        </CanvasSettingsPopoverShell>
    );
}
