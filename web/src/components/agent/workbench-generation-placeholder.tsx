import { cn } from "@/lib/utils";
import { memo } from "react";
import styles from "./workbench-generation-placeholder.module.css";

export const WorkbenchGenerationPlaceholder = memo(function WorkbenchGenerationPlaceholder({ kind, className }: { kind: "image" | "video"; className?: string }) {
    const label = kind === "image" ? "图片正在生成" : "视频正在生成";
    return (
        <div role="status" aria-label={label} aria-busy="true" data-kind={kind} className={cn(styles.placeholder, "relative isolate overflow-hidden rounded-lg border border-border", className)}>
            <span className={styles.smoke} aria-hidden="true">
                <span className={styles.smokeTexture} data-smoke-layer />
                <span className={styles.smokeTextureMirror} data-smoke-layer />
            </span>
        </div>
    );
});

export function WorkbenchGenerationActivity({ kind, count }: { kind: "image" | "video"; count: number }) {
    const label = `${count} 个${kind === "image" ? "图片" : "视频"}任务正在生成`;
    return (
        <span role="status" aria-label={label} aria-busy="true" className="relative inline-flex h-7 w-11 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground">
            <span className="relative flex items-end gap-1" aria-hidden="true">
                <span className="h-1.5 w-1 animate-pulse rounded-full bg-current [animation-duration:1.2s]" />
                <span className="h-3 w-1 animate-pulse rounded-full bg-current [animation-delay:-.4s] [animation-duration:1.2s]" />
                <span className="h-2 w-1 animate-pulse rounded-full bg-current [animation-delay:-.8s] [animation-duration:1.2s]" />
            </span>
            <span className="sr-only">{label}</span>
        </span>
    );
}
