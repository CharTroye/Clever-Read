# Paper Continuity

2026-10-26 的交互与阅读背景预案。此目录不修改正式 App。

- `source.html`：会话内预览。
- `index.html`：独立预览。
- `reading-preview.png`：阅读状态截图。

参考 [Parallax Editorial](https://luckymaomi.github.io/ui/styles/parallax-editorial/) 的公开介绍数据与[展示页源码](https://github.com/luckymaomi/ui/blob/master/src/components/showcases/styles/parallax-editorial.tsx)。参考站点未能直接打开，设计细节通过其公开仓库核对。

## 阅读背景

UI 风格与阅读材质分开。暖纸使用 `#F5F0E6` 纸面、`#EBE3D3` 衬底和 `#1A1712` 正文；另提供雾灰与石墨。流式正文采用所选纸面；PDF / PPT 原版保留文件颜色，仅调整页外背景。导航和解读栏不随阅读材质变色。

## 连续运动

文档库和阅读页共用一个纸页对象，等比展开，不再将封面横纵拉伸后淡出。位置、缩放与解读栏位移采用临界阻尼，响应参数 0.3 秒；反向操作保留当前速度与位置。响应参数不是固定完成时长，末段允许自然收敛。

设置退出后立即释放输入，视觉尾帧单独完成 140 ms 退出。提问转移 220 ms。外围景深不超过 8 px；正文不做视差。键盘操作即时响应，系统减少动态效果或关闭动效时取消空间运动，保留短暂颜色反馈。

预览问答为明确标记的本地示例，不调用模型、不读取用户文档或密钥。已检查文档进出与反向操作、解读栏开合、背景独立切换、原版模式、鼠标与 Enter 提问。具体动效质感仍需在用户常用设备上体验确认。
