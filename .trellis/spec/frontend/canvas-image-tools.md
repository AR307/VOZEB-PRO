# Canvas 图片工具契约

## 范围

本契约覆盖 Canvas 的“消除背景”和“智能分层”。两者是两条完全不同的链路：人物/普通主体去背继续使用现有本地语义分割；电商智能分层直接调用一次上游图片编辑/分层接口。

## 智能分层

- Canvas 只提交一次原图和分层提示词，任务类型为 `edit`，配置标记 `outputMode: "layers"`。
- 分层提示词要求上游一次返回全部独立结果；每个结果是原图中的一个独立元素或背景，保留原始像素、颜色、比例和真实 Alpha，不得重绘、合并、矩形裁切或把前景补回背景。
- 客户端只能等待任务终态并消费服务端返回的完整 `result.results[]`。禁止调用 bbox 识别接口，禁止加载电商分割 Worker，禁止按元素再发图片请求。
- Provider 请求模板中的 `n`、`count`、`num_images`、`batch_size` 在 `outputMode: "layers"` 时不由平台补写；管理员模板明确写入的字段保持原样。上游决定返回多少张，平台不添加结果上限或拍脑袋数量。
- OpenAI、Gemini、声明式自定义协议和轮询响应都必须解析数组结果。自定义 `resultField` 可以指向数组；兼容顶层 `data/results/images/layers` 等结果容器。保存时保留所有成功结果，顶层兼容字段指向第一张。
- Canvas 只创建一个结果节点，节点 `metadata.imageLayers` 按上游结果顺序保存全部图片，并以第一张作为节点主媒体。节点内预览使用干净主题色背景，不把棋盘格写入媒体；“下载全部分层”在浏览器即时生成 ZIP，不写服务器临时包。
- 上游没有返回有效图片时任务失败并显示真实错误；不得用本地切片、生成占位图、矩形蒙版或假图层冒充成功。单张返回也按真实结果保留，不自行复制或补齐。
- 电商背景补全必须由同一上游分层契约明确返回背景结果，或由另一个明确的背景任务完成；不得把前景透明空洞图冒充背景，也不得将已分离元素重新绘回背景。

## 消除背景

- 仅沿用现有 `splitSubjectAndBackgroundDataUrl` 本地语义分割与透明 PNG 上传链路。
- Worker 结果必须校验尺寸、Alpha 和非空主体；失败保留原图，不创建残缺节点。
- 此入口不创建图片生成任务，不经过电商分层协议。

## 数据结构

```ts
type ImageTaskConfig = {
  outputMode?: "layers";
  outputBackground?: "opaque" | "transparent";
};

type CanvasImageLayerAsset = {
  id: string;
  name: string;
  content: string;
  storageKey?: string;
  serverUrl?: string;
  mimeType?: string;
  width: number;
  height: number;
  zIndex: number;
};

type CanvasNodeMetadata = {
  imageLayers?: CanvasImageLayerAsset[];
};
```

## 错误和恢复

| 条件                     | 行为                                           |
| ------------------------ | ---------------------------------------------- |
| 未配置可用图片模型       | 打开现有配置入口，不创建任务                   |
| 上游 HTTP/业务失败       | 结果节点显示服务端错误，允许既有重试流程       |
| 上游任务状态未知         | 保留原任务身份并显示检查状态，不创建第二个任务 |
| 返回 JSON 无效或没有图片 | 任务失败并保留原图                             |
| 返回多张图片             | 全部落盘、登记、展示和 ZIP 下载                |
| 单张图片无效             | 保留同批其他有效结果；全部无效才失败           |
| 人物去背 Worker 失败     | 保留原图并释放操作锁                           |

## 必须回归

- 智能分层只出现一次 `/api/image-tasks` 请求，不出现 `/api/canvas/image-decomposition` 或电商 Worker 请求。
- 自定义协议的数组 `resultField`、OpenAI JSON/Multipart、轮询结果均保留全部 `results[]`。
- 一个 Canvas 结果节点保存全部图层，节点内 ZIP 条目数等于成功结果数，服务器没有 ZIP 临时文件。
- 人物去背仍只执行本地 Worker，不创建图片任务。
- 同一任务重连或恢复不重复落盘、不重复创建 Canvas 节点。
