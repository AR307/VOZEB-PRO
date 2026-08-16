import { afterEach, describe, expect, it, vi } from "vitest";

describe("Canvas 本地主体分割", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it("通过 Worker 返回经过校验的语义蒙版", async () => {
        const bitmap = { close: vi.fn() };
        const postMessage = vi.fn(function (this: FakeWorker, message: { id: number; operation: "mask" }) {
            const mask = new Float32Array([0.1, 0.9, 0.8, 0.2]);
            queueMicrotask(() => this.onmessage?.({ data: { id: message.id, operation: message.operation, width: 2, height: 2, mask: mask.buffer } } as MessageEvent));
        });
        class FakeWorker {
            onmessage: ((event: MessageEvent) => void) | null = null;
            onerror: ((event: ErrorEvent) => void) | null = null;
            onmessageerror: (() => void) | null = null;
            postMessage = postMessage;
            terminate = vi.fn();
        }
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(new Blob(["fixture"])) }));
        vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
        vi.stubGlobal("Worker", FakeWorker);
        const { segmentCanvasSubject } = await import("./canvas-subject-segmentation");

        const result = await segmentCanvasSubject("/fixture.png");

        expect(result).toMatchObject({ width: 2, height: 2 });
        expect(Array.from(result.data)).toEqual(expect.arrayContaining([expect.closeTo(0.1), expect.closeTo(0.9), expect.closeTo(0.8), expect.closeTo(0.2)]));
        expect(postMessage).toHaveBeenCalledWith({ id: 1, operation: "mask", image: bitmap }, [bitmap]);
    });

    it("直接接收 Worker 编码后的主体与编辑蒙版 Blob", async () => {
        const bitmap = { close: vi.fn() };
        class FakeWorker {
            onmessage: ((event: MessageEvent) => void) | null = null;
            onerror: ((event: ErrorEvent) => void) | null = null;
            onmessageerror: (() => void) | null = null;
            postMessage(message: { id: number; operation: "layers" }) {
                queueMicrotask(() =>
                    this.onmessage?.({
                        data: {
                            id: message.id,
                            operation: message.operation,
                            width: 2,
                            height: 2,
                            foregroundPixels: 2,
                            backgroundPixels: 2,
                            foregroundBlob: new Blob(["foreground"], { type: "image/png" }),
                            editMaskBlob: new Blob(["mask"], { type: "image/png" }),
                        },
                    } as MessageEvent),
                );
            }
            terminate = vi.fn();
        }
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(new Blob(["fixture"])) }));
        vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
        vi.stubGlobal("Worker", FakeWorker);
        const { renderCanvasSubjectLayers } = await import("./canvas-subject-segmentation");

        const result = await renderCanvasSubjectLayers("/fixture.png");

        expect(result).toMatchObject({ kind: "blobs", width: 2, height: 2, foregroundPixels: 2, backgroundPixels: 2 });
        expect(result.kind === "blobs" && result.foregroundBlob.type).toBe("image/png");
    });

    it("拒绝尺寸不匹配、越界和空蒙版", async () => {
        const { readSubjectSegmentationWorkerResponse, validateCanvasSubjectMask } = await import("./canvas-subject-segmentation");

        expect(readSubjectSegmentationWorkerResponse({ id: 1, operation: "mask", width: 2, height: 2, mask: new Float32Array(3).buffer })).toBeNull();
        expect(
            readSubjectSegmentationWorkerResponse({ id: 1, operation: "layers", width: 2, height: 2, foregroundPixels: 4, backgroundPixels: 0, foregroundBlob: new Blob(["a"], { type: "image/png" }), editMaskBlob: new Blob(["b"], { type: "image/png" }) }),
        ).toBeNull();
        expect(() => validateCanvasSubjectMask({ width: 2, height: 2, data: new Float32Array([0, 0.5, 1.01, 0]) })).toThrow("蒙版数值无效");
        expect(() => validateCanvasSubjectMask({ width: 2, height: 2, data: new Float32Array([0, 0, 0, 0]) })).toThrow("没有识别到明确主体");
        expect(() => validateCanvasSubjectMask({ width: 2, height: 2, data: new Float32Array([1, 1, 1, 1]) })).toThrow("没有识别到可移除背景");
    });

    it("透出模型错误并支持中止", async () => {
        class FakeWorker {
            onmessage: ((event: MessageEvent) => void) | null = null;
            onerror: ((event: ErrorEvent) => void) | null = null;
            onmessageerror: (() => void) | null = null;
            postMessage(message: { id: number }) {
                queueMicrotask(() => this.onmessage?.({ data: { id: message.id, error: "本地模型加载失败" } } as MessageEvent));
            }
            terminate() {}
        }
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(new Blob(["fixture"])) }));
        vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close: vi.fn() }));
        vi.stubGlobal("Worker", FakeWorker);
        const { segmentCanvasSubject } = await import("./canvas-subject-segmentation");

        await expect(segmentCanvasSubject("/fixture.png")).rejects.toThrow("本地模型加载失败");
        const controller = new AbortController();
        controller.abort();
        await expect(segmentCanvasSubject("/fixture.png", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    });
});
