# Connected Reading · v0.10.0

## 本次实现

- 段落聚焦；PDF 文字选区与 PPT 框选区域适应阅读区，支持恢复全文。
- 最多 4 段引用联合提问，保存原文位置、选区和提问草稿；每轮最多附 1 张区域截图。
- 模型流式回答；停止、中断和失败保留部分内容。只有显式完成的回答进入后续模型历史，滚动查看前文时停止自动跟随。
- 回答来源经过片段白名单验证，支持定位原文并返回解读；PDF 无法精确匹配时定位页面并说明。
- 当前段落或页面按需中英翻译，校验逐句 ID，在本机保存与文档内容、目标语言及模型连接相关的缓存。
- 翻译与 AI 解读按任务切换，避免默认三栏压缩正文。

翻译只处理可提取文字，不包含 OCR 或整本文档后台翻译。PDF 沿用当前解析粒度；精确匹配的句子可以联动，其他内容通过段落或页码核对。未提供流式输出的兼容服务会显示完整结果。

## 后续界面预案：Reading Studio

参考 NeoRead 已核对的源码版本 `751f778d129c4b471b5e4a4676ccdbfa4cfa6e96` 与官方阅读画面，结合 Apple Design、Emil Design Engineering、Animate 和 UI/UX Pro Max。数据库中的 News Editorial 字体建议支持正文与工具分开设置；不采用面向营销页的布局与配色建议。

| Before | After | Why |
| --- | --- | --- |
| 常驻的两层工具与提示 | 阅读模式集中在顶部；聚焦、返回时才显示上下文行 | 减少正文外的视觉噪声 |
| 多段引用持续占据输入区 | 引用数量作为可展开摘要，逐项查看与移除 | 让回答与输入得到更多空间 |
| 问题、答案和出处靠相似文本区分 | 问题使用低对比底色，回答保留自然段，出处提供独立的小入口 | 明确问答关系与核对路径 |
| 高频局部按钮持续显示 | 悬停与键盘聚焦时显现，已引用内容保留入口 | 减少重复图标，保持可发现性 |
| 纸张与辅助面板边界较硬 | 保留有边界的纸张，辅助面板使用较柔和的轮廓和轻阴影 | 保持纸本特征，改善层次 |

延续正文优先、词旁短释义、向右移动后展开解读栏的流程。预案使用本地预置译文和示例回答，未替换正式 App 的视觉风格。

参考：[NeoRead](https://github.com/cynicalight/NeoRead)、[翻译布局源码](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/apps/web/src/translation/translation.css)、[阅读同步与状态](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/apps/web/src/translation/PDFReadingView.tsx)。
