import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

const columnGap = 92;
const rowGap = 52;
const componentGap = 112;
const startOffset = 96;

export function autoLayoutCanvas(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const visibleNodes = nodes.filter((node) => !isAgentInternalNode(node));
    if (!visibleNodes.length) return nodes;

    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const outgoing = new Map(visibleNodes.map((node) => [node.id, [] as string[]]));
    const incoming = new Map(visibleNodes.map((node) => [node.id, [] as string[]]));
    const adjacent = new Map(visibleNodes.map((node) => [node.id, new Set<string>()]));
    connections.forEach((connection) => {
        if (!visibleIds.has(connection.fromNodeId) || !visibleIds.has(connection.toNodeId)) return;
        outgoing.get(connection.fromNodeId)!.push(connection.toNodeId);
        incoming.get(connection.toNodeId)!.push(connection.fromNodeId);
        adjacent.get(connection.fromNodeId)!.add(connection.toNodeId);
        adjacent.get(connection.toNodeId)!.add(connection.fromNodeId);
    });

    const components = buildLayoutComponents(visibleNodes, adjacent, incoming, outgoing);
    const columnWidths = new Map<number, number>();
    components.forEach(({ buckets }) =>
        buckets.forEach((bucket, depth) => {
            columnWidths.set(depth, Math.max(columnWidths.get(depth) || 0, ...bucket.map((node) => node.width)));
        }),
    );
    const columnX = new Map<number, number>();
    const positions = new Map<string, CanvasNodeData["position"]>();
    let x = startOffset;
    Array.from(columnWidths.keys())
        .sort((first, second) => first - second)
        .forEach((depth) => {
            columnX.set(depth, x);
            x += columnWidths.get(depth)! + columnGap;
        });

    let componentY = startOffset;
    components.forEach(({ buckets }) => {
        const bucketHeights = new Map(Array.from(buckets, ([depth, bucket]) => [depth, stackHeight(bucket)]));
        const bandHeight = Math.max(...bucketHeights.values());
        buckets.forEach((bucket, depth) => {
            let y = componentY + (bandHeight - bucketHeights.get(depth)!) / 2;
            bucket.forEach((node) => {
                positions.set(node.id, { x: columnX.get(depth)!, y });
                y += node.height + rowGap;
            });
        });
        componentY += bandHeight + componentGap;
    });
    return nodes.map((node) => (positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node));
}

export function isAgentInternalNode(node: CanvasNodeData) {
    if (node.metadata?.internalOnly) return true;
    if (!node.metadata?.agentRunId) return false;
    return node.type === CanvasNodeType.Brief || node.type === CanvasNodeType.BrandKit || node.type === CanvasNodeType.Config || node.type === CanvasNodeType.Task;
}

function disconnectedNodeDepth(type: CanvasNodeType) {
    if (type === CanvasNodeType.Config || type === CanvasNodeType.Task) return 1;
    if (type === CanvasNodeType.Image || type === CanvasNodeType.Panorama || type === CanvasNodeType.Video || type === CanvasNodeType.Audio) return 2;
    return 0;
}

function buildLayoutComponents(nodes: CanvasNodeData[], adjacent: Map<string, Set<string>>, incoming: Map<string, string[]>, outgoing: Map<string, string[]>) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const visited = new Set<string>();
    const connected: CanvasNodeData[][] = [];
    const isolated: CanvasNodeData[] = [];
    [...nodes].sort(originalOrder).forEach((node) => {
        if (visited.has(node.id)) return;
        if (!adjacent.get(node.id)?.size) {
            visited.add(node.id);
            isolated.push(node);
            return;
        }
        const component: CanvasNodeData[] = [];
        const stack = [node.id];
        visited.add(node.id);
        while (stack.length) {
            const currentId = stack.pop()!;
            component.push(byId.get(currentId)!);
            adjacent.get(currentId)?.forEach((nextId) => {
                if (visited.has(nextId)) return;
                visited.add(nextId);
                stack.push(nextId);
            });
        }
        connected.push(component);
    });

    const groups = [...connected, ...(isolated.length ? [isolated] : [])];
    return groups
        .map((component) => {
            const componentIds = new Set(component.map((node) => node.id));
            const depths = component.length === isolated.length && component.every((node) => !adjacent.get(node.id)?.size) ? new Map(component.map((node) => [node.id, disconnectedNodeDepth(node.type)])) : resolveDepths(component, componentIds, outgoing);
            const buckets = new Map<number, CanvasNodeData[]>();
            component.forEach((node) => {
                const depth = depths.get(node.id) || 0;
                buckets.set(depth, [...(buckets.get(depth) || []), node]);
            });
            orderBuckets(buckets, incoming, outgoing);
            return { buckets, order: Math.min(...component.map((node) => node.position.y + node.height / 2)), left: Math.min(...component.map((node) => node.position.x)) };
        })
        .sort((first, second) => first.order - second.order || first.left - second.left);
}

function resolveDepths(component: CanvasNodeData[], componentIds: Set<string>, outgoing: Map<string, string[]>) {
    const groups = stronglyConnectedGroups(component, componentIds, outgoing);
    const groupByNodeId = new Map(groups.flatMap((group, groupIndex) => group.map((node) => [node.id, groupIndex] as const)));
    const offsetByNodeId = new Map(groups.flatMap((group) => group.map((node, offset) => [node.id, offset] as const)));
    const groupOutgoing = new Map(groups.map((_, groupIndex) => [groupIndex, new Set<number>()]));
    groups.forEach((group, groupIndex) => {
        group.forEach((node) => {
            for (const targetId of outgoing.get(node.id) || []) {
                const targetGroup = groupByNodeId.get(targetId);
                if (targetGroup !== undefined && targetGroup !== groupIndex) groupOutgoing.get(groupIndex)!.add(targetGroup);
            }
        });
    });
    const remaining = new Map(groups.map((_, groupIndex) => [groupIndex, 0]));
    groupOutgoing.forEach((targets) => targets.forEach((target) => remaining.set(target, remaining.get(target)! + 1)));
    const depthByGroup = new Map<number, number>();
    const queue = groups
        .map((_, groupIndex) => groupIndex)
        .filter((groupIndex) => remaining.get(groupIndex) === 0)
        .sort((first, second) => groups[first][0].id.localeCompare(groups[second][0].id));
    queue.forEach((groupIndex) => depthByGroup.set(groupIndex, 0));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const sourceGroup = queue[cursor];
        const sourceDepth = depthByGroup.get(sourceGroup) || 0;
        for (const targetGroup of groupOutgoing.get(sourceGroup) || []) {
            depthByGroup.set(targetGroup, Math.max(depthByGroup.get(targetGroup) || 0, sourceDepth + groups[sourceGroup].length));
            const nextRemaining = remaining.get(targetGroup)! - 1;
            remaining.set(targetGroup, nextRemaining);
            if (nextRemaining === 0) queue.push(targetGroup);
        }
    }
    return new Map(component.map((node) => [node.id, (depthByGroup.get(groupByNodeId.get(node.id)!) || 0) + offsetByNodeId.get(node.id)!]));
}

function stronglyConnectedGroups(component: CanvasNodeData[], componentIds: Set<string>, outgoing: Map<string, string[]>) {
    const byId = new Map(component.map((node) => [node.id, node]));
    const indexById = new Map<string, number>();
    const lowLinkById = new Map<string, number>();
    const stack: string[] = [];
    const stacked = new Set<string>();
    const groups: CanvasNodeData[][] = [];
    let nextIndex = 0;

    const visit = (nodeId: string) => {
        indexById.set(nodeId, nextIndex);
        lowLinkById.set(nodeId, nextIndex);
        nextIndex += 1;
        stack.push(nodeId);
        stacked.add(nodeId);
        [...(outgoing.get(nodeId) || [])]
            .filter((targetId) => componentIds.has(targetId))
            .sort()
            .forEach((targetId) => {
                if (!indexById.has(targetId)) {
                    visit(targetId);
                    lowLinkById.set(nodeId, Math.min(lowLinkById.get(nodeId)!, lowLinkById.get(targetId)!));
                } else if (stacked.has(targetId)) {
                    lowLinkById.set(nodeId, Math.min(lowLinkById.get(nodeId)!, indexById.get(targetId)!));
                }
            });
        if (lowLinkById.get(nodeId) !== indexById.get(nodeId)) return;
        const group: CanvasNodeData[] = [];
        let currentId = "";
        do {
            currentId = stack.pop()!;
            stacked.delete(currentId);
            group.push(byId.get(currentId)!);
        } while (currentId !== nodeId);
        groups.push(group.sort((first, second) => first.id.localeCompare(second.id)));
    };

    [...component]
        .sort((first, second) => first.id.localeCompare(second.id))
        .forEach((node) => {
            if (!indexById.has(node.id)) visit(node.id);
        });
    return groups;
}

function orderBuckets(buckets: Map<number, CanvasNodeData[]>, incoming: Map<string, string[]>, outgoing: Map<string, string[]>) {
    buckets.forEach((bucket) => bucket.sort(originalOrder));
    const depths = [...buckets.keys()].sort((first, second) => first - second);
    for (let pass = 0; pass < 2; pass += 1) {
        const forwardOrder = nodeOrder(buckets);
        depths.slice(1).forEach((depth) => sortByNeighborOrder(buckets.get(depth)!, incoming, forwardOrder));
        const backwardOrder = nodeOrder(buckets);
        depths
            .slice(0, -1)
            .reverse()
            .forEach((depth) => sortByNeighborOrder(buckets.get(depth)!, outgoing, backwardOrder));
    }
}

function sortByNeighborOrder(bucket: CanvasNodeData[], neighbors: Map<string, string[]>, order: Map<string, number>) {
    bucket.sort((first, second) => neighborCenter(first.id, neighbors, order) - neighborCenter(second.id, neighbors, order) || originalOrder(first, second));
}

function neighborCenter(nodeId: string, neighbors: Map<string, string[]>, order: Map<string, number>) {
    const values = (neighbors.get(nodeId) || []).map((id) => order.get(id)).filter((value): value is number => value !== undefined);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.POSITIVE_INFINITY;
}

function nodeOrder(buckets: Map<number, CanvasNodeData[]>) {
    const order = new Map<string, number>();
    buckets.forEach((bucket) => bucket.forEach((node, index) => order.set(node.id, index)));
    return order;
}

function stackHeight(nodes: CanvasNodeData[]) {
    return nodes.reduce((height, node) => height + node.height, 0) + Math.max(0, nodes.length - 1) * rowGap;
}

function originalOrder(first: CanvasNodeData, second: CanvasNodeData) {
    return first.position.y - second.position.y || first.position.x - second.position.x || first.id.localeCompare(second.id);
}
