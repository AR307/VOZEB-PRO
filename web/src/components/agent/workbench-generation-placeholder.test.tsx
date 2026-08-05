import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkbenchGenerationActivity, WorkbenchGenerationPlaceholder } from "./workbench-generation-placeholder";

describe("workbench generation placeholders", () => {
    it("keeps generation status accessible without visible status copy", () => {
        const placeholder = renderToStaticMarkup(<WorkbenchGenerationPlaceholder kind="image" />);
        const activity = renderToStaticMarkup(<WorkbenchGenerationActivity kind="video" count={2} />);

        expect(placeholder).toContain('aria-label="图片正在生成"');
        expect(placeholder).toContain('aria-busy="true"');
        expect(placeholder).not.toContain("animate-spin");
        expect(placeholder).not.toContain("bg-background/80");
        expect(placeholder).not.toContain(">图片正在生成<");
        expect(activity).toContain('aria-label="2 个视频任务正在生成"');
        expect(activity).toContain('class="sr-only">2 个视频任务正在生成</span>');
        expect(activity).not.toContain(">生成中<");
    });

    it("uses a lightweight layered smoke field without per-tile paint animation", () => {
        const placeholder = renderToStaticMarkup(<WorkbenchGenerationPlaceholder kind="image" />);
        const stylesheet = readFileSync(resolve(process.cwd(), "src/components/agent/workbench-generation-placeholder.module.css"), "utf8");

        expect(placeholder.match(/data-smoke-layer/g)).toHaveLength(2);
        expect(placeholder).toContain('data-kind="image"');
        expect(placeholder).not.toContain("--cube-index");
        expect(placeholder).not.toContain("/logo.svg");
        expect(stylesheet).toContain("/generation-smoke.webp");
        expect(stylesheet).not.toContain("radial-gradient");
        expect(stylesheet).toContain("@keyframes smoke-drift-primary");
        expect(stylesheet).toContain("translate3d");
        expect(stylesheet).toContain("contain: paint");
        expect(stylesheet).not.toContain("filter:");
        expect(stylesheet).not.toContain("backdrop-filter");
        expect(stylesheet).toContain("prefers-reduced-motion");
    });
});
