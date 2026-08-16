import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { autoLayoutCanvas, isAgentInternalNode } from "./canvas-auto-layout";

const node = (id: string, type: CanvasNodeType, x = 0, y = 0): CanvasNodeData => ({ id, type, title: id, position: { x, y }, width: 240, height: 140, metadata: {} });

describe("Canvas 一键整理", () => {
    it("按连接拓扑分列并保留节点身份与连接", () => {
        const nodes = [node("prompt", CanvasNodeType.Text, 900, 700), node("config", CanvasNodeType.Config, -300, 20), node("result", CanvasNodeType.Image, 10, -600)];
        const arranged = autoLayoutCanvas(nodes, [
            { id: "edge", fromNodeId: "prompt", toNodeId: "result" },
            { id: "edge-2", fromNodeId: "config", toNodeId: "result" },
        ]);
        expect(arranged.map((item) => item.id)).toEqual(["prompt", "config", "result"]);
        expect(arranged.find((item) => item.id === "prompt")!.position.x).toBeLessThan(arranged.find((item) => item.id === "result")!.position.x);
        expect(arranged.find((item) => item.id === "config")!.position.x).toBeLessThan(arranged.find((item) => item.id === "result")!.position.x);
        expect(arranged.map((item) => item.position)).not.toEqual(nodes.map((item) => item.position));
    });

    it("不移动 Agent 内部节点，并将其标记为默认隐藏", () => {
        const internal = { ...node("brief", CanvasNodeType.Brief), metadata: { agentRunId: "run" } };
        const result = autoLayoutCanvas([internal, node("task", CanvasNodeType.Task)], []);
        expect(result[0].position).toEqual(internal.position);
        expect(isAgentInternalNode(internal)).toBe(true);
        expect(isAgentInternalNode({ ...node("task", CanvasNodeType.Task), metadata: { agentRunId: "run" } })).toBe(false);
    });

    it("长链路不把节点压回固定列，孤立节点按语义分层", () => {
        const nodes = Array.from({ length: 6 }, (_, index) => node(`node-${index}`, index === 0 ? CanvasNodeType.Text : CanvasNodeType.Image, 900 - index * 40, 700 - index * 80));
        const connections = nodes.slice(0, -1).map((item, index) => ({ id: `edge-${index}`, fromNodeId: item.id, toNodeId: nodes[index + 1].id }));
        const arranged = autoLayoutCanvas(nodes, connections);
        expect(new Set(arranged.map((item) => item.position.x)).size).toBe(6);
        expect(arranged.map((item) => item.position.y)).toEqual([96, 96, 96, 96, 96, 96]);
        const isolated = autoLayoutCanvas([node("text", CanvasNodeType.Text), node("config", CanvasNodeType.Config), node("image", CanvasNodeType.Image)], []);
        expect(isolated.find((item) => item.id === "text")!.position.x).toBeLessThan(isolated.find((item) => item.id === "config")!.position.x);
        expect(isolated.find((item) => item.id === "config")!.position.x).toBeLessThan(isolated.find((item) => item.id === "image")!.position.x);
    });

    it("全部是内部节点时保持原布局", () => {
        const internal = { ...node("brief", CanvasNodeType.Brief, 420, 180), metadata: { agentRunId: "run" } };
        expect(autoLayoutCanvas([internal], []).at(0)?.position).toEqual(internal.position);
    });
});
