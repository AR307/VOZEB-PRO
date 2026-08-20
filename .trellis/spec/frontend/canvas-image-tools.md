# Canvas 图片工具契约

## 范围

本契约覆盖 Canvas 的“消除背景”和“智能分层”。两者是两条完全不同的链路：人物/普通主体去背继续使用现有本地语义分割；电商智能分层直接调用一次上游图片编辑/分层接口。

## Scenario: Canvas 电商像素级智能分层

### 1. Scope / Trigger

- Canvas 用户对一张电商图点击“智能分层”时使用本契约。
- 人物或普通主体“消除背景”不进入本链路，继续使用下方本地语义分割契约。
- 只有能在一个任务中返回完整原图像素分层资产的上游专用接口满足能力要求；通用生成或编辑接口不能仅凭提示词包装成分层接口。

### 2. Signatures

```ts
type ImageTaskConfig = {
  outputMode?: "layers";
};

type ImageTaskResult = {
  dataUrl: string;
  results?: Array<{ dataUrl: string; width?: number; height?: number }>;
};

type CanvasNodeMetadata = {
  sourceLayerNodeId?: string;
  imageLayerTaskId?: string;
  imageLayerResultIndex?: number;
};

validateImageLayerOutputs(
  sourceDataUrl: string,
  outputDataUrls: string[],
): Promise<ValidatedImageLayerOutput[]>;
```

公开请求为一次 `POST /api/image-tasks`，`kind: "edit"`、`config.outputMode: "layers"`，并且 `references` 必须且只能包含一张源图。任务完成后客户端只消费同一任务的完整 `task.result.results[]`。

### 3. Contracts

- 上游一次返回全部独立元素和一张干净背景。每个结果与源图同宽高并保留原坐标；元素层使用源图原始像素和真实 Alpha，背景只补全元素遮挡区域。
- Provider 请求模板中的 `n`、`count`、`num_images`、`batch_size` 不由平台补写；管理员模板的显式字段保持原样，上游决定结果数量，平台不添加数量上限。
- OpenAI、Gemini、声明式自定义协议和轮询响应都解析完整数组；自定义 `resultField` 可以指向数组，并兼容顶层 `data/results/images/layers` 容器。
- 分层数组不得走普通多结果的“忽略单张失败/自动去重”语义。任一结果不可读、重复或验收失败时整次分层失败并沿用原退款契约，不能把不完整数组保存为成功。
- 服务端按原数组顺序验收并落盘；分层资产不得携带普通生图的 `targetSize`，禁止再次缩放、裁切或重采样。
- Canvas 为每张结果创建一个普通图片节点，使用稳定 `taskId + resultIndex` 幂等恢复；源图分别连接每个结果。禁止集合节点、bbox 接口、电商分割 Worker、本地矩形切片、逐元素任务和占位图。
- 用户通过 Canvas 既有框选/多选批量下载独立节点；不恢复集合节点专用 ZIP 分支。

### 4. Validation & Error Matrix

| 条件                                   | 行为                                         |
| -------------------------------------- | -------------------------------------------- |
| 不是 `edit` 或源图数量不是 1           | API 在上游调用和计费前返回 400               |
| 任一结果无法读取或是全透明空图         | 整个任务失败并退款，不保存部分结果           |
| 元素或背景尺寸与源图不同               | 失败，不能验证原坐标像素                     |
| 元素非透明 RGB 与源图同坐标不一致      | 失败，判定为重绘或改色                       |
| 两个元素覆盖同一源像素                 | 失败，判定为重复或未独立分层                 |
| 背景改动元素覆盖区外的 RGBA            | 失败，判定为背景破坏源图                     |
| 背景没有在每个元素覆盖区产生任何变化   | 失败，判定为元素未移除                       |
| 只有合成图、只有透明层或背景数量不为 1 | 失败并保留源图                               |
| 完整数组通过验收                       | 全部原样落盘并创建独立节点                   |
| 上游任务状态未知                       | 保留原任务身份进入人工检查，不创建第二个任务 |

逐像素验收使用无损相等，不添加颜色误差阈值、元素数量上限、固定重试或固定输出数量。语义上是否“干净”仍由专用上游负责；平台只接受能够证明未重绘元素、未破坏未覆盖背景的结果。

### 5. Good/Base/Bad Cases

- Good：一次任务返回 20 个同尺寸透明元素和一张背景；所有元素互不重复、像素来自源图，背景仅在元素覆盖区变化，最终创建 21 个独立节点。
- Base：一次任务返回一个透明主体和一张干净背景，创建两个节点和两条源图连线。
- Bad：普通图片模型返回一张重绘合成图；即使提示词声明“分层”，也必须失败退款。
- Bad：平台逐元素调用 20 次图片接口，或把本地 bbox 矩形裁片当作 20 个图层。
- Bad：先验收原始层，落盘时再按 `config.size` 重采样，导致像素级结果被二次破坏。

### 6. Tests Required

- 单元测试覆盖重绘像素、尺寸不符、重复元素、背景越界修改、背景未移除元素、全透明空图及 20 个独立元素。
- Runtime 测试断言重复/不可读结果不会被去重或忽略，失败沿用原积分退款；成功时完整数组只落盘和登记一次。
- Provider 协议测试覆盖 OpenAI multipart、JSON、多结果字段和轮询数组，夹具返回的层必须能通过同一 `validateImageLayerOutputs`。
- Canvas 浏览器测试断言只有一次 `/api/image-tasks`，没有 `/api/canvas/image-decomposition` 或电商 Worker；每张结果创建一个节点和一条源图连线，重连不重复。
- 人物去背浏览器测试断言只执行本地 Worker，不创建图片任务；批量下载继续覆盖图片和视频多选。

### 7. Wrong vs Correct

#### Wrong

```ts
const unique = dedupeImageResults(upstreamResults);
for (const element of plannedElements) {
  await createImageTask({ prompt: element.prompt });
}
return createLayerCollectionNode(unique);
```

这会丢失重复/失败证据、重复计费，并用集合 UI 掩盖不完整分层。

#### Correct

```ts
const task = await createImageTask({
  kind: "edit",
  references: [source],
  config: { ...config, outputMode: "layers" },
});
const outputs = await validateImageLayerOutputs(
  sourceDataUrl,
  task.result.results,
);
return outputs.map((output, index) => createImageNode(task.id, index, output));
```

一次上游任务保留完整数组，严格验收后再按稳定结果序号创建普通节点。

## 消除背景

- 仅沿用现有 `splitSubjectAndBackgroundDataUrl` 本地语义分割与透明 PNG 上传链路。
- Worker 结果必须校验尺寸、Alpha 和非空主体；失败保留原图，不创建残缺节点。
- 此入口不创建图片生成任务，不经过电商分层协议。
