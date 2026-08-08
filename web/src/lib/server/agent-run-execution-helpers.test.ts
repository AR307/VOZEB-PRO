import { describe, expect, it } from "vitest";

import { mergeTaskReferences } from "./agent-run-execution-helpers";

describe("mergeTaskReferences", () => {
    it("keeps an explicit frame role when dependency references use the same media URL", () => {
        expect(
            mergeTaskReferences(
                [{ assetId: "first-image", type: "image", url: "/api/reference-assets/first.png", role: "first_frame" }],
                [{ assetId: "dependency-image", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/first.png", role: "reference" }],
            ),
        ).toEqual([{ assetId: "first-image", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/first.png", role: "first_frame" }]);
    });

    it("promotes a dependency frame role when the existing reference is ordinary", () => {
        expect(
            mergeTaskReferences(
                [{ assetId: "ordinary", type: "image", url: "/api/reference-assets/last.png", role: "reference" }],
                [{ assetId: "last-image", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/last.png", role: "last_frame" }],
            ),
        ).toEqual([{ assetId: "ordinary", sourceTaskId: "image-task", type: "image", url: "/api/reference-assets/last.png", role: "last_frame" }]);
    });
});
