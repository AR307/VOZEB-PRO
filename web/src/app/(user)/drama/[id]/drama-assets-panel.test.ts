import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { imageResultsToReferences } from "./drama-assets-panel";

describe("drama asset image results", () => {
    it("keeps every generated image as a candidate reference", () => {
        const references = imageResultsToReferences({
            dataUrl: "data:image/png;base64,first",
            serverUrl: "/api/generation-log-assets/first.png",
            results: [
                { dataUrl: "data:image/png;base64,first", serverUrl: "/api/generation-log-assets/first.png", width: 1024, height: 1024 },
                { serverUrl: "/api/generation-log-assets/second.png", width: 1024, height: 1024 },
            ],
        });

        expect(references).toHaveLength(2);
        expect(references.map((item) => item.url)).toEqual(["/api/generation-log-assets/first.png", "/api/generation-log-assets/second.png"]);
        expect(references.map((item) => item.label)).toEqual(["AI 候选图 1", "AI 候选图 2"]);
    });

    it("uses an asset card library and moves create/edit fields into a responsive drawer", async () => {
        const [panel, editor] = await Promise.all([readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-assets-panel.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/app/(user)/drama/[id]/drama-asset-editor-drawer.tsx"), "utf8")]);

        expect(panel).toContain("data-drama-asset-grid");
        expect(panel).toContain("<DramaAssetEditorDrawer");
        expect(panel).toContain("项目来源素材");
        expect(editor).toContain("size={620}");
        expect(editor).toContain('maxWidth: "100vw"');
        expect(editor).toContain("上传候选");
        expect(editor).toContain("生成候选");
    });
});
