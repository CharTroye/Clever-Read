# Clever Read

面向论文与长文本的本地阅读应用。支持在原文中选择词语、句子或幻灯片区域，结合文档上下文解释、拆解逻辑和追问。

![Clever Read 阅读界面](screenshots/clever-read-workspace.png)

## 功能

- 文档分类、搜索与续读；保存阅读位置、选区和问题草稿。
- PDF 原版与流式阅读，Word 正文阅读，PPT 图片与文字区域问答。
- 独立解读栏，支持收起、调整宽度、停止生成及失败重试。
- 多模型连接与加密密钥库；配置列表显示模型 ID 和图片输入能力。
- 石墨黑、浅灰两种背景，字号与行距可调，偏好自动保存。
- 阅读记录、术语收藏与 Markdown 导出。

## 快速开始

需要 **Node.js 22+**。Windows 双击 `Start-CleverRead.cmd`，或在项目目录运行：

```sh
node server.mjs
```

打开 <http://127.0.0.1:4173>。依赖已随项目提供，无须执行 `npm install`。

1. 导入文档或粘贴文本，在文档库中选择内容开始阅读。
2. 在 **设置 → 模型连接** 中填写接口地址、模型 ID 和 API Key，保存并启用。
3. 点击词语、选择句子或框选幻灯片内容，解释选区或输入问题。Enter 发送，Shift + Enter 换行。

背景颜色在 **设置 → 阅读偏好** 中选择，点击“保存设置”生效。

## 文件支持

文件最大 30 MB。

| 格式 | 支持范围 |
| --- | --- |
| PDF | 最多 150 页，需文字层；支持原版与流式阅读 |
| Word `.docx` | 解析正文与表格文字，不还原完整排版；`.doc` 需先另存为 `.docx` |
| PPT `.ppt` / `.pptx` | 最多 300 张，保留静态排版；需 Windows 桌面版 WPS 演示或 PowerPoint，优先使用 WPS |
| TXT / Markdown / 粘贴文本 | 纯文本阅读，最多 30 万字符 |

暂不支持 OCR、演示动画、加密或含宏的演示文件，以及跨文档问答。复杂 PDF 排版与公式建议使用原版模式核对。

## 模型与数据

接口需兼容 Chat Completions；基础地址会自动补齐 `/chat/completions`。模型 ID 以服务商 API 文档为准。图片问答需启用“支持图片输入”，并使用接受 `image_url` 的模型。

API Key 加密保存在本机模型库：Windows 使用当前账户的 DPAPI，其他平台使用 AES-GCM。编辑时密钥留空可保留原值；取消保存则仅用于当前页面会话。未连接模型时，仅提供内置术语定义和相关原文。

文档与阅读记录保存在当前浏览器的 IndexedDB。模型问答会向所配置的服务发送选区、相关原文和追问历史；图片问答额外发送选区截图。密钥库位于已被 Git 忽略的 `.runtime/` 目录。本机服务仅监听 `127.0.0.1`。清除浏览器站点数据会移除文档与记录。

## 开发与验证

```sh
npm run check
npm test
```

WPS 集成测试需 Windows 和 WPS 演示，在 PowerShell 中执行：

```powershell
$env:CLEVER_WPS_TEST='1'
npm test
Remove-Item Env:CLEVER_WPS_TEST
```

第三方依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
