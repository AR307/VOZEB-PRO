import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";

import { CreativeResultSwitcher, hasMultipleCreativeResults } from "./creative-result-switcher";

describe("creative result switcher", () => {
    it("does not render any more-results DOM for one actual result", () => {
        const results = [asset("one")];
        expect(hasMultipleCreativeResults([])).toBe(false);
        expect(hasMultipleCreativeResults(results)).toBe(false);
        expect(renderToStaticMarkup(<CreativeResultSwitcher results={results} selectedIndex={0} width={352} renderThumbnail={() => <span>预览</span>} onSelect={() => undefined} />)).toBe("");
    });

    it("renders the shared switcher only for multiple actual results", () => {
        const results = [asset("one"), asset("two")];
        const markup = renderToStaticMarkup(<CreativeResultSwitcher results={results} selectedIndex={1} width={352} renderThumbnail={(_result, index) => <span>预览 {index + 1}</span>} onSelect={() => undefined} />);
        expect(hasMultipleCreativeResults(results)).toBe(true);
        expect(markup).toContain("更多生成结果");
        expect(markup).toContain('data-results-count="2"');
        expect(markup).toContain('aria-label="查看生成结果 2"');
        expect(markup).toContain('aria-pressed="true"');
    });
});

function asset(id: string): CreativeAsset {
    return { id, userId: "user", conversationId: "conversation", ordinal: 0, type: "image", status: "ready", title: id, serverUrl: `/${id}.png`, metadata: {}, createdAt: 1, updatedAt: 1 };
}
