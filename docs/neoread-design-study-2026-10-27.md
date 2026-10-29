# NeoRead 阅读体验研究

日期：2026-10-27。对照 Clever Read v0.9.0。研究结论与迭代建议，不包含 App 功能修改。

## 依据

- [用户提供的视频](https://www.bilibili.com/video/BV1pEpj6yEzy/)：公开视频约 30 秒，覆盖段落聚焦、原译文联动、引用提问和笔记。已检查完整时间线的抽样画面，并对约 10–16 秒的聚焦片段检查 0.4 秒间隔的连续画面。
- [NeoRead 仓库](https://github.com/cynicalight/NeoRead)，本次源码基准为 `751f778d129c4b471b5e4a4676ccdbfa4cfa6e96`。视频仍使用 Reader 名称；当前仓库的能力与界面已有后续变化。
- [官方阅读截图](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/website/assets/screenshots/pdf-bilingual-ai.webp)。画面研究与静态源码核对不等于已运行桌面版，也不能据此判断大文档下的帧率或模型响应速度。

## 关键结论

最值得迁移的是稳定的原文定位：聚焦段落、对照翻译、引用提问和答案回跳共同使用文档、块、句子和原生位置。视觉反馈由这些关系驱动，用户容易理解当前内容、操作结果以及返回路径。

视频中的大标题、柔光背景和整体画面推拉属于宣传编排；实际阅读界面的质量主要来自正文占比、稳定分区、局部操作和持续反馈。Clever Read 继续使用已确认的纸本与石墨等风格。

## 美学与交互

| Before：Clever Read 当前状态 | After：适合迁移的方向 | Why |
| --- | --- | --- |
| 已有宽幅正文和按需解读栏，侧栏变化仍可能触发正文重排或 PDF 重绘 | 在布局变化前记录当前内容的原生位置，完成后保持阅读中心；拖动期间优先保留画面，稳定后统一重绘 | 阅读位置比窗口移动本身更重要 |
| 单词有局部释义，段落和图表缺少统一的聚焦入口 | 悬停工具提供聚焦、复制和询问；点击词语继续保留短释义行为 | 统一局部操作，避免点击语义冲突 |
| 等待模型完整 JSON 后显示回答，生成时替换当前解读 | 真实流式显示；保留前文、问题和新草稿；向上阅读时停止自动滚底 | 用户能持续感知进展，也能控制注意力 |
| 已有来源过滤和原文跳转 | 细化到可靠的句子或区域；跳回后短暂标示，并提供返回刚才阅读位置的操作 | 缩短核对过程，不把未验证编号当作可点击出处 |
| PDF 原版与流式模式已具备 | 在稳定位置映射上增加按需翻译与原译文联动 | 翻译与原文一起核对，保留原图、表格及公式 |

NeoRead 的正文、译文与工具使用不同的排版层级；界面边界较轻，关联区域的背景变化更醒目。其默认多栏布局在窄窗口会压缩正文，Clever Read 应继续以全文阅读为初始状态，按任务切换翻译与 AI 辅助区域。

## 可验证的实现细节

### FocusBlock

[pdf-navigation.ts](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/apps/web/src/readers/pdf-navigation.ts#L148) 将缩放与水平、垂直定位放进同一段约 240 ms 的运动；在动画期间延后画布重绘，结束后统一刷新。新的操作身份会使旧定位失效。该效果依赖可靠的块边界，不能仅靠整页放大得到。

[PDFReadingView.tsx](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/apps/web/src/translation/PDFReadingView.tsx#L290) 让原文与译文分别按自身几何尺寸定位，避免译文长度变化带偏原文。高于视口的内容采用顶部对齐。[聚焦规则](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/docs/pdf-translation.md#L29) 还区分悬停、拖选、点击与普通滚动；悬停不主动滚动，用户滚轮或新点击可中断聚焦。

迁移时保留 Clever Read 的词语点击释义。整段聚焦使用独立的悬停工具入口；拖动选择文字不触发缩放。PPT 可先复用已有框选区域定位，再逐步完善 PDF 的段落、图表和公式边界。

### 原译文联动

[useSentenceMarks.ts](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/apps/web/src/translation/useSentenceMarks.ts) 和 [对照翻译规则](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/docs/pdf-translation.md#L29) 基于块与句子对应关系，保留浏览器原生选区，通过临时关联标示帮助核对。同步滚动按对应内容定位，避免简单采用两边全文的滚动百分比。

适合先实现当前段落或页面的按需翻译，保存原文到译文的对应关系与缓存，再扩展章节翻译。译文匹配不可靠时明确回退到段落，避免伪装成精确句子对应。

### 问答反馈与来源

[流式协议](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/docs/agent-streaming-contract.md) 区分读取状态、答案增量、失败与成功保存；断流不自动当作完成，停止后保留已收到的内容。源码中的 [useChatScroll.ts](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/apps/web/src/chat/useChatScroll.ts) 在用户向上滚动后停止跟随底部。

[SourceReferences.tsx](https://github.com/cynicalight/NeoRead/blob/751f778d129c4b471b5e4a4676ccdbfa4cfa6e96/apps/web/src/SourceReferences.tsx#L45) 在导航前验证来源；缺少直接位置时使用原始摘录查找，遇到多个候选交由用户选择。不会将模型改写后的句子当作精确原文定位。

## 核心功能迁移顺序

1. **问答连续性与准确回跳**：增加真正的流式响应；当前问题、已收到的回答、前文与新草稿独立保存。完善来源区域、临时标示与返回位置。Clever Read 已有相关片段检索与来源白名单，继续在这些基础上细化。
2. **聚焦阅读**：优先支持现有段落与 PPT 框选区域；提供当前区域适应宽度、居中及恢复视图。再补 PDF 版面结构化，处理双栏、图表与公式。聚焦不能占用词语解释或文本拖选的触发方式。
3. **按需双语对照**：当前段落或页面翻译、对应内容联动、翻译缓存及独立重试。默认保留单一辅助任务区域，控制窄窗口中的列数。
4. **扩展工作流**：按需求增加多文档标签、引用收集与经过验证的官方 CLI 接入。保留现有 API 模型库及 PDF / Word / PPT 支持；文件格式、桌面封装与书库迁移另行安排。

这些能力先建立可靠的原生定位，再叠加可见反馈。现有 blockId、页码与区域数据可以继续使用；按需补充句子范围、原译文对应和内容版本，避免因重排或重新解析使引用指向错误内容。沿用用户不增加页边批注的要求。

## 后续验收重点

- 放大、侧栏切换与返回后仍能找到刚才的词语或段落。
- 聚焦途中滚轮、拖选、新点击与切换文档均能打断旧动作。
- 原译文长度不同、对齐失败和公式解析失败时采用明确的回退。
- 问答停止、失败、重试与断流不会清除前文或新草稿，也不会串接其他模型的半截回答。
- 支持键盘与减少动态效果；长 PDF 和 WPS 课件需在实际使用设备上确认体验。
