"use strict";

const reportWorkerError = console.error.bind(console);
console.error = (...args) => {
    if (String(args[0] || "").startsWith("INFO:")) {
        console.info(...args);
        return;
    }
    reportWorkerError(...args);
};

importScripts("/mediapipe/vision_bundle.js");

let segmenterPromise = null;

const fallbackPoints = [
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.25, y: 0.5 },
    { x: 0.75, y: 0.5 },
    { x: 0.25, y: 0.75 },
    { x: 0.5, y: 0.75 },
    { x: 0.75, y: 0.75 },
];

function getSegmenter() {
    if (!segmenterPromise) {
        segmenterPromise = Vision.InteractiveSegmenterLegacy.createFromOptions(
            {
                wasmLoaderPath: "/mediapipe/wasm/vision_wasm_internal.js",
                wasmBinaryPath: "/mediapipe/wasm/vision_wasm_internal.wasm",
            },
            {
                baseOptions: { modelAssetPath: "/canvas/models/magic_touch.tflite" },
                runningMode: "IMAGE",
                outputConfidenceMasks: true,
                outputCategoryMask: false,
            },
        );
    }
    return segmenterPromise;
}

async function resetSegmenter() {
    const current = segmenterPromise;
    segmenterPromise = null;
    if (!current) return;
    try {
        (await current).close();
    } catch {
        // The model may have failed before a segmenter instance existed.
    }
}

self.onmessage = async (event) => {
    const { id, image, operation = "mask", targetPoint } = event.data || {};
    try {
        if (!Number.isInteger(id) || !image || (operation !== "mask" && operation !== "layers")) throw new Error("主体分割请求无效");
        const segmenter = await getSegmenter();
        const firstPoint = normalizedPoint(targetPoint) || { x: 0.5, y: 0.5 };
        let selected = null;
        const points = [firstPoint, ...fallbackPoints.filter((point) => point.x !== firstPoint.x || point.y !== firstPoint.y)];
        for (const point of points) {
            const candidate = segmentCandidate(segmenter, image, point);
            if (!selected || candidate.score > selected.score) selected = candidate;
        }
        if (!selected || !isReliableCandidate(selected)) throw new Error("没有识别到可靠主体，请尝试局部编辑");
        if (operation === "layers" && supportsWorkerImageEncoding()) {
            const layers = await composeSubjectLayers(image, selected);
            self.postMessage({ id, operation, ...layers });
        } else {
            self.postMessage({ id, operation, width: selected.width, height: selected.height, mask: selected.data.buffer }, [selected.data.buffer]);
        }
    } catch (error) {
        await resetSegmenter();
        self.postMessage({ id, error: error instanceof Error ? error.message : "本地主体分割失败" });
    } finally {
        image?.close();
    }
};

function segmentCandidate(segmenter, image, point) {
    const result = segmenter.segment(image, { keypoint: point });
    try {
        const masks = result.confidenceMasks || [];
        if (!masks.length) throw new Error("本地模型没有返回主体蒙版");
        const arrays = masks.map((mask) => mask.getAsFloat32Array());
        const selectedIndex = masks.reduce((best, mask, index) => (pointConfidence(mask, arrays[index], point) > pointConfidence(masks[best], arrays[best], point) ? index : best), 0);
        const selected = masks[selectedIndex];
        const data = new Float32Array(arrays[selectedIndex]);
        const stats = maskStats(data, selected.width, selected.height);
        return { width: selected.width, height: selected.height, data, ...stats };
    } finally {
        result.close();
    }
}

function pointConfidence(mask, data, point) {
    const x = Math.min(mask.width - 1, Math.max(0, Math.round(point.x * (mask.width - 1))));
    const y = Math.min(mask.height - 1, Math.max(0, Math.round(point.y * (mask.height - 1))));
    return data[y * mask.width + x];
}

function maskStats(data, width, height) {
    let foregroundPixels = 0;
    let borderPixels = 0;
    let foregroundBorderPixels = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const foreground = data[y * width + x] >= 0.5;
            if (foreground) foregroundPixels += 1;
            if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
            borderPixels += 1;
            if (foreground) foregroundBorderPixels += 1;
        }
    }
    const areaRatio = foregroundPixels / Math.max(1, width * height);
    const borderRatio = foregroundBorderPixels / Math.max(1, borderPixels);
    return { areaRatio, borderRatio, score: areaRatio * (1 - areaRatio) * (1 - borderRatio) };
}

function normalizedPoint(value) {
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return { x: Math.min(1, Math.max(0, value.x)), y: Math.min(1, Math.max(0, value.y)) };
}

function isReliableCandidate(candidate) {
    return candidate.areaRatio >= 0.01 && candidate.areaRatio <= 0.95 && candidate.borderRatio <= 0.5;
}

function supportsWorkerImageEncoding() {
    return typeof OffscreenCanvas === "function" && typeof OffscreenCanvas.prototype.convertToBlob === "function";
}

async function composeSubjectLayers(image, subjectMask) {
    const width = image.width;
    const height = image.height;
    const foregroundCanvas = new OffscreenCanvas(width, height);
    const foregroundContext = foregroundCanvas.getContext("2d", { willReadFrequently: true });
    const editMaskCanvas = new OffscreenCanvas(width, height);
    const editMaskContext = editMaskCanvas.getContext("2d");
    if (!foregroundContext || !editMaskContext) throw new Error("浏览器无法创建主体图层");
    foregroundContext.drawImage(image, 0, 0);
    const foreground = foregroundContext.getImageData(0, 0, width, height);
    const editMask = editMaskContext.createImageData(width, height);
    let foregroundPixels = 0;
    let backgroundPixels = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const confidence = sampleSubjectConfidence(subjectMask, x, y, width, height);
            const offset = (y * width + x) * 4;
            foreground.data[offset + 3] = Math.round(foreground.data[offset + 3] * confidence);
            editMask.data[offset] = 255;
            editMask.data[offset + 1] = 255;
            editMask.data[offset + 2] = 255;
            editMask.data[offset + 3] = Math.round(255 * (1 - confidence));
            if (confidence >= 0.5) foregroundPixels += 1;
            else backgroundPixels += 1;
        }
    }
    foregroundContext.putImageData(foreground, 0, 0);
    editMaskContext.putImageData(editMask, 0, 0);
    const [foregroundBlob, editMaskBlob] = await Promise.all([foregroundCanvas.convertToBlob({ type: "image/png" }), editMaskCanvas.convertToBlob({ type: "image/png" })]);
    return { width, height, foregroundPixels, backgroundPixels, foregroundBlob, editMaskBlob };
}

function sampleSubjectConfidence(mask, x, y, width, height) {
    const sourceX = width === 1 ? 0 : (x / (width - 1)) * (mask.width - 1);
    const sourceY = height === 1 ? 0 : (y / (height - 1)) * (mask.height - 1);
    const left = Math.floor(sourceX);
    const top = Math.floor(sourceY);
    const right = Math.min(mask.width - 1, left + 1);
    const bottom = Math.min(mask.height - 1, top + 1);
    const horizontal = sourceX - left;
    const vertical = sourceY - top;
    const topValue = mask.data[top * mask.width + left] * (1 - horizontal) + mask.data[top * mask.width + right] * horizontal;
    const bottomValue = mask.data[bottom * mask.width + left] * (1 - horizontal) + mask.data[bottom * mask.width + right] * horizontal;
    return Math.max(0, Math.min(1, topValue * (1 - vertical) + bottomValue * vertical));
}
