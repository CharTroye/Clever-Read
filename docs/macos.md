# Mac 使用说明

## 启动与停止

1. 在访达中打开 Clever Read 项目文件夹，双击 `Start-CleverRead.command`。
2. 浏览器自动打开 `http://127.0.0.1:4173`。启动终端退出后，阅读服务仍可在后台运行。
3. 用完后双击 `Stop-CleverRead.command`。重复启动不会重复创建服务。

需要 Node.js 22 或更高版本。启动器依次检查 PATH、Apple Silicon / Intel 的常见安装位置及 Codex 自带运行环境。项目目录可以包含空格与中文，无需执行 npm install，也无需安装 Xcode。

若下载工具丢失可执行权限，可在项目目录运行：

```sh
chmod +x Start-CleverRead.command Stop-CleverRead.command scripts/mac-entry.sh
```

macOS 因下载来源阻止执行时，通过系统提供的打开方式处理；不要关闭系统安全保护。

## 文档与模型

- PDF、Word `.docx`、TXT、Markdown 仍在浏览器内解析。
- PPT/PPTX 使用 macOS 的 Quick Look 预览引擎和本机 Chrome、Chromium 或 Edge 完成本地转换，再生成可框选的幻灯片。日常阅读仍可使用 Safari 等浏览器。
- PPT 转换不依赖 Keynote 的脚本控制权限，不需要安装 WPS Windows 版。使用临时浏览器配置，关闭转换进程后删除临时文件。
- 超过 300 张的课件、超过 30 万字符的文字、超过 80 MB 的转换结果或图片会被拒绝；取消后不保存半份文档。
- 系统字体和预览支持范围与 Windows 不同。复杂版式、预览失败或字体缺失时，在演示软件中导出 PDF 后导入。
- 模型库使用本机 AES-GCM 加密，解锁文件权限仅向当前用户开放。旧 Windows 账户的 DPAPI 加密库需要回到原账户解密；在 Mac 上重新配置即可使用。

文档、阅读记录和模型配置保存在当前 Mac。复制项目代码不会自动迁移其他设备浏览器中的阅读数据。

## 故障排查

- **提示端口被占用**：先关闭原服务。启动器只停止自己有记录、且服务标识匹配的进程，不会按端口强行结束其他应用。
- **启动失败**：查看 `.runtime/server-error.log`。成功启动后可访问 `/api/health` 检查版本。
- **首页出现 EPERM / operation not permitted**：后台进程无法读取项目文件，可能与 macOS 的“文稿”目录访问权限或 Node 运行环境更新有关。重新双击启动入口，启动器会检查首页并替换异常的本项目进程；若仍被拒绝，在“系统设置 → 隐私与安全性 → 文件与文件夹”中允许启动所用终端访问“文稿”文件夹，然后重启。
- **PPT 导入不可用**：确认 Chrome、Chromium 或 Edge 位于 `/Applications` 或用户的 `Applications` 中，然后重新打开导入窗口。
- **更新代码后仍是旧版本**：使用停止入口关闭后台服务，再重新启动并刷新网页。
- **换了浏览器后文档库为空**：IndexedDB 按浏览器隔离，请回到原浏览器及原本机地址。

源码和 Windows 启动入口共用，Mac 适配版为 0.12.0。
