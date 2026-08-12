import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama mobile list layout", () => {
    it("does not enable cached content sizing before the responsive breakpoint", async () => {
        const [page, generation] = await Promise.all([readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/page.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-generation-panel.tsx"), "utf8")]);
        const source = `${page}\n${generation}`;

        expect(source).not.toMatch(/(?:^|[\s"])(?<!sm:)\[content-visibility:auto\]/m);
        expect(source).toContain("[content-visibility:visible]");
        expect(source).toContain("sm:[content-visibility:auto]");
    });

    it("uses the production workspace panels with responsive episode and Agent controls", async () => {
        const [page, sections, agent] = await Promise.all([
            readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/page.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-project-sections.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-agent-panel.tsx"), "utf8"),
        ]);

        expect(page).not.toContain("xl:grid-cols-[184px_minmax(0,1fr)_360px]");
        expect(page).toContain("data-drama-workspace-body");
        expect(page).toContain("data-drama-production-scroll");
        expect(page).toContain("<DramaEpisodeSidebar");
        expect(page).toContain("episodeNavigatorOpen={episodeNavigatorOpen}");
        expect(page).toContain("open={agentOpen}");
        expect(sections).toContain("data-drama-workspace-header");
        expect(sections).toContain("data-drama-stage-navigation");
        expect(page).toContain("<DramaGenerationPanel");
        expect(page).toContain("<DramaStageHeader");
        expect(sections).toContain('aria-label="短剧剧集导航"');
        expect(sections).toContain("data-drama-episode-sidebar");
        expect(sections).toContain("min-[1366px]:block");
        expect(sections).toContain("stageStatuses");
        expect(sections).toContain("待审核");
        expect(page).toContain("data-drama-script-global-bar");
        expect(page).toContain("onContinue={() => void analyzeScript()}");
        expect(sections).not.toContain("<Tabs");
        expect(agent).toContain("activated");
        expect(agent).toContain('aria-label="项目 Agent 面板"');
        expect(agent).toContain("destroyOnHidden={false}");
    });
});
