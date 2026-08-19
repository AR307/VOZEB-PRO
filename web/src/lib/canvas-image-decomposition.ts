export const CANVAS_IMAGE_LAYER_KINDS = ["product", "person", "headline", "text", "logo", "badge", "decoration", "foreground"] as const;

export type CanvasImageLayerKind = (typeof CANVAS_IMAGE_LAYER_KINDS)[number];

export type CanvasImageLayerBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CanvasImageLayerCandidate = {
    id: string;
    name: string;
    kind: CanvasImageLayerKind;
    bbox: CanvasImageLayerBox;
    zIndex: number;
    confidence?: number;
};

export type CanvasImageDecomposition = {
    width: number;
    height: number;
    backgroundDescription: string;
    backgroundPreservedVisuals: string[];
    layers: CanvasImageLayerCandidate[];
};

const layerKinds = new Set<string>(CANVAS_IMAGE_LAYER_KINDS);

export function normalizeCanvasImageDecomposition(value: unknown, width: number, height: number): CanvasImageDecomposition | null {
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !isRecord(value) || !Array.isArray(value.layers)) return null;
    const seen = new Set<string>();
    const layers = value.layers.flatMap((entry, index): CanvasImageLayerCandidate[] => {
        if (!isRecord(entry) || !layerKinds.has(String(entry.kind || ""))) return [];
        const bbox = normalizeBox(entry.bbox, width, height);
        if (!bbox) return [];
        if (bbox.x === 0 && bbox.y === 0 && bbox.width === width && bbox.height === height) return [];
        const kind = entry.kind as CanvasImageLayerKind;
        const key = `${bbox.x}:${bbox.y}:${bbox.width}:${bbox.height}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const confidence = Number(entry.confidence);
        return [
            {
                id: text(entry.id) || `layer-${index + 1}`,
                name: text(entry.name) || canvasImageLayerKindLabel(kind),
                kind,
                bbox,
                zIndex: Number.isFinite(Number(entry.zIndex)) ? Math.round(Number(entry.zIndex)) : index,
                ...(Number.isFinite(confidence) ? { confidence: Math.min(1, Math.max(0, confidence)) } : {}),
            },
        ];
    });
    if (!layers.length) return null;
    return {
        width,
        height,
        backgroundDescription: text(value.backgroundDescription),
        backgroundPreservedVisuals: stringList(value.backgroundPreservedVisuals),
        layers: layers.sort((left, right) => left.zIndex - right.zIndex),
    };
}

export function canvasImageLayerKindLabel(kind: CanvasImageLayerKind) {
    return {
        product: "商品",
        person: "人物",
        headline: "标题",
        text: "文字",
        logo: "Logo",
        badge: "角标",
        decoration: "装饰",
        foreground: "前景",
    }[kind];
}

export const canvasImageDecompositionTool = {
    name: "decompose_ecommerce_image",
    description: "识别电商海报中需要独立保留的前景视觉元素及其原图像素坐标",
    parameters: {
        type: "object",
        properties: {
            backgroundDescription: { type: "string" },
            backgroundPreservedVisuals: {
                type: "array",
                items: { type: "string" },
            },
            layers: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        kind: { type: "string", enum: CANVAS_IMAGE_LAYER_KINDS },
                        bbox: {
                            type: "object",
                            properties: {
                                x: { type: "number" },
                                y: { type: "number" },
                                width: { type: "number" },
                                height: { type: "number" },
                            },
                            required: ["x", "y", "width", "height"],
                            additionalProperties: false,
                        },
                        zIndex: { type: "number" },
                        confidence: { type: "number", minimum: 0, maximum: 1 },
                    },
                    required: ["id", "name", "kind", "bbox", "zIndex"],
                    additionalProperties: false,
                },
            },
        },
        required: ["backgroundPreservedVisuals", "layers"],
        additionalProperties: false,
    },
} as const;

export function canvasImageDecompositionInstruction(width: number, height: number) {
    return [
        "你是 VOZEB PRO 电商视觉分层分析器。分析用户提供的完整图片，并调用 decompose_ecommerce_image。",
        `所有 bbox 必须使用原图 ${width}x${height} 的整数像素坐标，禁止使用百分比或归一化坐标。`,
        "完整识别所有需要独立保留的前景视觉元素：主商品和商品组合、人物、标题或艺术字、普通说明文字、品牌 Logo、促销角标或标签、棉花/光效/贴纸等装饰，以及其他独立前景物体。",
        "文字、Logo、角标和装饰不能因为不是主商品而省略；不要把整张海报或整片前景合并成一个主体框。视觉上独立的元素分别返回，必须一起移动的组合可以保留为一层。商品包装自身印刷的文字和 Logo 属于商品画面，不能再重复拆成文字层或 Logo 层。",
        "连续的摄影或插画场景、纹理、地面、桌面、光影、反射，以及已经融入场景的装饰属于背景，不放入 layers；把这些必须保留的背景内容简要列入 backgroundPreservedVisuals。只有可独立移动和复用的元素才返回图层。",
        "bbox 要完整包住元素且不要裁掉边缘；不同图层不要返回相同或近似相同的 bbox。背景本身不放入 layers。zIndex 从后到前递增。backgroundDescription 只简要描述移除独立图层后应保留的背景。",
        "只返回工具参数，不输出解释、Markdown 或内部分析过程。",
    ].join("\n");
}

function normalizeBox(value: unknown, width: number, height: number): CanvasImageLayerBox | null {
    if (!isRecord(value)) return null;
    const values = [value.x, value.y, value.width, value.height].map(Number);
    if (!values.every(Number.isFinite)) return null;
    const [x, y, boxWidth, boxHeight] = values;
    const left = clamp(Math.min(x, x + boxWidth), 0, width);
    const top = clamp(Math.min(y, y + boxHeight), 0, height);
    const right = clamp(Math.max(x, x + boxWidth), 0, width);
    const bottom = clamp(Math.max(y, y + boxHeight), 0, height);
    const normalized = { x: Math.round(left), y: Math.round(top), width: Math.round(right) - Math.round(left), height: Math.round(bottom) - Math.round(top) };
    return normalized.width > 0 && normalized.height > 0 ? normalized : null;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown) {
    return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
