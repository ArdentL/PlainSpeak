# PlainSpeak

[GitHub](https://github.com/ArdentL/PlainSpeak) · [下载 / Releases](https://github.com/ArdentL/PlainSpeak/releases)

[English](README.en.md) · 中文

**为 DeepSeek Harness 的回答加一层更好读的本地译文。** 默认保留原文，每个完整助手段落下显示较浅的译文；默认注入清晰表达规则，减少初稿中的套话和重复免责。

v0.7.0 面向 **Windows + DeepSeek Harness 公开预览**，提供网页 profile 与桌面 profile 安装入口。本轮联调使用已安装的 `@deepseek-ai/dsh 0.2.1-rc.5` 桌面 Host 及其网页前端；具体范围见下方。发布进度见[发布说明](docs/publishing.md)。安装方式是源码 ZIP 加本地安装脚本，尚无宿主市场条目或已发布的 npm 插件。

## 安装并启动

准备已经可用的 Harness 和 Python 3.10+（也可使用 Harness 自带的 Python）。解压源码 ZIP。安装到桌面版时，先启动 Harness 一次，初始化桌面 profile，再在源码目录运行：

```powershell
.\install-harness.ps1 --client desktop
```

安装器将原生 bundle 加入桌面 profile，保留其 JSON 中的其他字段及已有用户 YAML 的原始字节。完成后关闭并重启 Harness 桌面版即可加载，不需要额外传入 patch。

安装到网页版时，默认命令仍为：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-harness.ps1
```

这会安装经过哈希核验的 llama.cpp 运行时和默认 **Hy-MT2 1.8B Q4_K_M，模型约 1.13 GB**。不需要 Ollama、pip、npm、管理员权限或改 PATH。默认数据目录是 `%LOCALAPPDATA%\PlainSpeak`；安装器只添加自己的插件文件，保留原有 Harness 设置、凭据和会话。

安装器不会启动宿主。网页版安装完成后运行：

```powershell
dsh --profile web --patch "$env:LOCALAPPDATA\PlainSpeak\harness.patch.yml"
```

已有官方 GGUF 可用 `--source` 复用，其他安装位置和 profile 可用参数指定；见[安装说明](docs/harness-install.md)。首次翻译自动启动本机模型，后续打开界面不重复下载。

## 使用

会话标题旁的 **PlainSpeak 设置** 提供自动译文、隐藏原文、语言、清晰表达规则和保存记录设置。默认中文，也可选择英语、日语、韩语、法语、德语、西班牙语。清晰表达的调整从下一条助手回复生效。

插件保留 Harness 原始渲染，译文也复用宿主 Markdown 组件。正文、标题和简单表格单元格中的说明文字可翻译，加粗、链接、行内代码与公式按 Markdown 显示；代码块、纯技术值、工具输出、用户消息和思考过程保留原样。复杂嵌套单元格及含未支持图片、SVG、音视频等媒体的块保留原样，避免隐藏媒体。流式回复的最后一块等到完成再处理。局部保留原文和请求失败会显示状态。

回译默认携带同一条助手回答的邻近原文：前文最多 1600、后文最多 700 个 UTF-16 单位，中文→中转语言→中文两次翻译均使用这份背景。思考、工具、代码、媒体、其他回答及宿主隐藏内容不作为背景。回复生成中不因邻段变化反复翻译，完成后最多补一次最终背景；仍逐段显示。背景不同不会复用旧译文。本地 1.8B Q4 实测改善了“末班车”和地名，但仍把“不下（车）”误解为“不坐车”，上下文功能不能补足模型所有理解错误。

普通正文中的数字、百分比、科学计数法及数字出现次数不做保护检查，中文数字与阿拉伯数字可以互换。代码、链接和公式仍按整体内容保护。

普通段落上下对照，完全相同的内容只显示一次。表格默认只显示译文，用表格上方“译文 / 原文”整张切换，单元格不再上下重复；这项切换不重新翻译。

开启“隐藏原文”后，译文就绪的段落只显示译文，表格切换按钮也收起；翻译中或失败时保留原文。默认关闭，设置保存在本地；关闭隐藏恢复段落对照，关闭自动翻译恢复全部原文，不改写 Harness 会话。

设置与最多 1000 条段落记录保存在本机 `ui/records.sqlite3`，刷新、重启后保留。记录含原文、输出、语言、模型、时间和处理报告；相同原文、背景、路线和模型可复用通过保护检查的结果。面板支持查看、导出 JSON、两步确认清空；关闭保存会停止持久写入和历史复用，已有记录可单独清空。这些记录不改写 Harness 会话、不进入其模型上下文、不上传，也不随源码分发。

清空会取消当前页面的旧段落定时器与请求，保留已显示译文，新文本继续处理。禁用翻译、切换语言或卸载时也会取消旧工作；已开始的单次模型调用等待返回，之后停止后续调用。清空和淘汰记录使用 SQLite `secure_delete`，并回收旧数据库空闲页；这处理当前数据库文件，不擦除备份、快照或存储介质。

## 模型管理

```powershell
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models list
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models install hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models use hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models status
```

[模型库](docs/models.md)提供腾讯官方 1.8B / 7B 的 Q4、Q6、Q8 六个选项，固定版本、大小和 SHA-256。默认小模型已实际运行，升级模型尚未做本项目质量对比。

## 预览版范围

- 本轮在 Windows `0.2.1-rc.5` 桌面 Host 及其网页前端完成 12/12 段 Hy-MT2 Q4 实际回译；保存隐藏原文设置并刷新后，12 份译文仍就绪、12 个原文块隐藏，Python 代码 `print("hello")` 不变，记录面板显示 12 条。接口返回 200，未见控制台错误。Electron 原生外壳 GUI 受工具限制，尚未验收。
- Linux/macOS 尚未运行验收；更早版本的运行记录保留在验证文档中。
- 已复用本地权重完成安装与推理，尚未跑完干净机器上的全量网络下载安装。
- 译文可能改变含义，代码和字面量保护不能替代内容核对。

真实结果见[验证记录](docs/verification.md)，本版变化见 [CHANGELOG](CHANGELOG.md)。后续计划适配其他宿主；现有 Codex / Claude skill 与 MCP 代码保留为[开发者实验入口](docs/clients.md#advanced-experimental-skill--mcp)，不属于首发界面支持范围。

## 开发与许可

自有代码与 skill 使用 [MIT](LICENSE)。原生适配复用宿主官方插槽及组件，没有复制宿主组件源码。模型、运行时与第三方资料各自保留许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。源码包不包含模型、运行时二进制或本地记录。

[客户端与开发入口](docs/clients.md) · [收集的 skill](docs/skill-catalog.md) · [发布流程](docs/publishing.md)
