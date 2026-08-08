export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#ffffff",
            backdrop: "#ffffff",
            dot: "rgba(14,116,144,.24)",
            line: "rgba(14,116,144,.10)",
            selectionStroke: "#0f172a",
            selectionFill: "rgba(14,116,144,.08)",
        },
        node: {
            label: "#475569",
            fill: "#eef6fb",
            panel: "#ffffff",
            stroke: "#d9e7ee",
            activeStroke: "#0f172a",
            placeholder: "#94a3b8",
            text: "#1e293b",
            muted: "#64748b",
            faint: "#94a3b8",
            danger: "#dc2626",
            dangerSurface: "#fff1f2",
            dangerBorder: "#fecdd3",
            action: "#0f172a",
            actionText: "#ffffff",
            actionDangerText: "#ffffff",
        },
        toolbar: {
            panel: "rgba(255,255,255,.96)",
            border: "#d9e7ee",
            item: "#475569",
            itemHover: "#eef6fb",
            activeBg: "#f8fafc",
            activeText: "#0f172a",
        },
    },
    dark: {
        canvas: {
            background: "#090b10",
            backdrop: "#090b10",
            dot: "rgba(248,250,252,.18)",
            line: "rgba(248,250,252,.08)",
            selectionStroke: "#ffffff",
            selectionFill: "rgba(255,255,255,.10)",
        },
        node: {
            label: "#e5e7eb",
            fill: "#111318",
            panel: "#0f1115",
            stroke: "#303642",
            activeStroke: "#ffffff",
            placeholder: "#94a3b8",
            text: "#f8fafc",
            muted: "#cbd5e1",
            faint: "#64748b",
            danger: "#f87171",
            dangerSurface: "#2a1215",
            dangerBorder: "#7f1d1d",
            action: "#f8fafc",
            actionText: "#0f172a",
            actionDangerText: "#ffffff",
        },
        toolbar: {
            panel: "rgba(10,12,16,.96)",
            border: "#303642",
            item: "#e5e7eb",
            itemHover: "#1f2937",
            activeBg: "#f8fafc",
            activeText: "#0f172a",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
