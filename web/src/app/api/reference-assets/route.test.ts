import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    writePersistent: vi.fn(),
    writeTemporary: vi.fn(),
    createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.writePersistent, writeReferenceMediaDataUrl: mocks.writeTemporary }));
vi.mock("@/lib/server/reference-asset-access", () => ({ createSignedReferenceAssetUrl: mocks.createSignedUrl }));

import { POST } from "./route";

describe("reference asset upload boundary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.writePersistent.mockResolvedValue({ token: "permanent/asset.mp4", bytes: 4, mimeType: "video/mp4", storage: "local" });
        mocks.createSignedUrl.mockReturnValue("https://drama.example/api/reference-assets/permanent/asset.mp4?expires=1&signature=test");
    });

    it("always applies the 20MB user upload limit even when persistent is requested", async () => {
        const response = await POST(
            new Request("http://localhost/api/reference-assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "video", persistent: true, dataUrl: "data:video/mp4;base64,AAAA", originalName: "产品展示.mp4" }),
            }),
        );
        expect(response.status).toBe(200);
        expect(mocks.writePersistent).toHaveBeenCalledWith(expect.any(String), "video", {
            ownerUserId: "user-one",
            source: "user-upload",
            originalName: "产品展示.mp4",
            maxBytes: 20 * 1024 * 1024,
        });
    });

    it("returns the stable internal storage key for object-backed uploads", async () => {
        mocks.writePersistent.mockResolvedValue({ token: "permanent/asset.png", bytes: 4, mimeType: "image/png", storage: "object" });
        const response = await POST(
            new Request("http://localhost/api/reference-assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "image", persistent: true, dataUrl: "data:image/png;base64,AAAA" }),
            }),
        );

        await expect(response.json()).resolves.toMatchObject({
            url: "/api/reference-assets/permanent/asset.png",
            token: "permanent/asset.png",
            key: "permanent/asset.png",
            storage: "object",
            upstreamUrl: "https://drama.example/api/reference-assets/permanent/asset.mp4?expires=1&signature=test",
        });
    });

    it("accepts binary multipart uploads without base64 request expansion", async () => {
        mocks.writePersistent.mockResolvedValue({ token: "permanent/asset.png", bytes: 4, mimeType: "image/png", storage: "local" });
        const form = new FormData();
        form.append("type", "image");
        form.append("persistent", "true");
        form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "图层.png", { type: "image/png" }));

        const response = await POST(new Request("http://localhost/api/reference-assets", { method: "POST", body: form }));

        expect(response.status).toBe(200);
        expect(mocks.writePersistent).toHaveBeenCalledWith("data:image/png;base64,AQIDBA==", "image", {
            ownerUserId: "user-one",
            source: "user-upload",
            originalName: "图层.png",
            maxBytes: 20 * 1024 * 1024,
        });
    });
});
