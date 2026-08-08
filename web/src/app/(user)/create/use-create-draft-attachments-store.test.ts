import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCreateDraftAttachment, useCreateDraftAttachmentsStore } from "./use-create-draft-attachments-store";

describe("create draft attachments store", () => {
    beforeEach(() => useCreateDraftAttachmentsStore.setState({ attachments: [] }));

    afterEach(() => {
        useCreateDraftAttachmentsStore.getState().clear();
        vi.restoreAllMocks();
    });

    it("keeps an unsent file in memory until it is explicitly removed", () => {
        const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:create-reference");
        const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        const file = new File(["image"], "reference.webp", { type: "image/webp" });

        const [asset] = useCreateDraftAttachmentsStore.getState().add([file], "");

        expect(createObjectUrl).toHaveBeenCalledWith(file);
        expect(asset.serverUrl).toBe("blob:create-reference");
        expect(getCreateDraftAttachment(asset.id)?.file).toBe(file);
        expect(getCreateDraftAttachment(asset.id)?.asset).toBe(asset);

        useCreateDraftAttachmentsStore.getState().remove([asset.id]);

        expect(getCreateDraftAttachment(asset.id)).toBeUndefined();
        expect(revokeObjectUrl).toHaveBeenCalledWith("blob:create-reference");
    });
});
