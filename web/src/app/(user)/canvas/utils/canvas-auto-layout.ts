import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

const columnGap = 92;
const rowGap = 52;
const startOffset = 96;

export function autoLayoutCanvas(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const visibleNodes = nodes.filter((node) => !isAgentInternalNode(node));
    if (!visibleNodes.length) return nodes;

    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const outgoing = new Map<string, string[]>();
    const incomingCount = new Map(visibleNodes.map((node) => [node.id, 0]));
    connections.forEach((connection) => {
        if (!visibleIds.has(connection.fromNodeId) || !visibleIds.has(connection.toNodeId)) return;
        outgoing.set(connection.fromNodeId, [...(outgoing.get(connection.fromNodeId) || []), connection.toNodeId]);
        incomingCount.set(connection.toNodeId, (incomingCount.get(connection.toNodeId) || 0) + 1);
    });

    const depthById = new Map<string, number>();
    const queue = visibleNodes.filter((node) => incomingCount.get(node.id) === 0 && outgoing.has(node.id)).map((node) => node.id);
    queue.forEach((id) => depthById.set(id, 0));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const sourceId = queue[cursor];
        const sourceDepth = depthById.get(sourceId) || 0;
        for (const targetId of outgoing.get(sourceId) || []) {
            depthById.set(targetId, Math.max(depthById.get(targetId) || 0, sourceDepth + 1));
            const remaining = (incomingCount.get(targetId) || 0) - 1;
            incomingCount.set(targetId, remaining);
            if (remaining === 0) queue.push(targetId);
        }
    }

    visibleNodes.forEach((node) => {
        if (!depthById.has(node.id)) depthById.set(node.id, disconnectedNodeDepth(node.type));
    });
    const buckets = new Map<number, CanvasNodeData[]>();
    visibleNodes.forEach((node) => {
        const depth = depthById.get(node.id) || 0;
        buckets.set(depth, [...(buckets.get(depth) || []), node]);
    });
    buckets.forEach((bucket) => bucket.sort((first, second) => first.position.y - second.position.y || first.position.x - second.position.x));

    const positions = new Map<string, CanvasNodeData["position"]>();
    let x = startOffset;
    Array.from(buckets.keys())
        .sort((first, second) => first - second)
        .forEach((depth) => {
            const bucket = buckets.get(depth)!;
            let y = startOffset;
            bucket.forEach((node) => {
                positions.set(node.id, { x, y });
                y += node.height + rowGap;
            });
            x += Math.max(...bucket.map((node) => node.width)) + columnGap;
        });
    return nodes.map((node) => (positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node));
}

export function isAgentInternalNode(node: CanvasNodeData) {
    if (node.metadata?.internalOnly) return true;
    if (!node.metadata?.agentRunId) return false;
    return node.type === CanvasNodeType.Brief || node.type === CanvasNodeType.BrandKit || node.type === CanvasNodeType.Config;
}

function disconnectedNodeDepth(type: CanvasNodeType) {
    if (type === CanvasNodeType.Config || type === CanvasNodeType.Task) return 1;
    if (type === CanvasNodeType.Image || type === CanvasNodeType.Panorama || type === CanvasNodeType.Video || type === CanvasNodeType.Audio) return 2;
    return 0;
}
