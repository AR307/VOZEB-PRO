import { describe, expect, it } from "vitest";

import { creativeComposerPopoverOverflow, resolveCreativeComposerPopoverPlacement } from "@/components/creative-composer-popover";

describe("creative composer popover positioning", () => {
    it("keeps desktop direction fixed without automatic flipping", () => {
        expect(resolveCreativeComposerPopoverPlacement("bottomLeft", false)).toBe("bottomLeft");
        expect(creativeComposerPopoverOverflow("bottomLeft")).toBe(false);
    });

    it("centers narrow popovers and only shifts them horizontally", () => {
        expect(resolveCreativeComposerPopoverPlacement("bottomLeft", true)).toBe("bottom");
        expect(resolveCreativeComposerPopoverPlacement("topLeft", true)).toBe("top");
        expect(creativeComposerPopoverOverflow("bottom")).toEqual({ adjustX: 1, adjustY: 0 });
    });
});
