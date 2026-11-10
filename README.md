# PlainSpeak

[GitHub](https://github.com/ArdentL/PlainSpeak) · [下载 / Releases](https://github.com/ArdentL/PlainSpeak/releases) · [English](README.en.md) · 中文

**[查看 10 个真实对比案例 →](docs/comparisons/README.md)**：左边是 DeepSeek 原始输出，右边是 skill + 本地回译。完整展示结果，并标注回译变长、误译和部分保留原文的案例。

**让 DeepSeek Harness 的回答更好读。**

大模型回复常带有冗长铺垫、防御性免责声明和生硬套话。PlainSpeak 从两方面改善阅读体验：

1. **默认注入清晰表达规则**：减少初稿中的套话与重复免责，从下一次助手回复起生效。
2. **本地模型逐段回译**：利用本地小模型并结合同一条回复的相邻段落上下文，先译成另一种语言，再译回目标语言，例如「中文 → 英文 → 中文」。

当前公开预览版 **v0.7.0** 首发支持 **Windows + DeepSeek Harness**，提供桌面（desktop）与网页（web）两种 profile 安装入口。目前已在实际环境中验收桌面 Host 的网页前端（Electron 原生窗口尚未完成实际验收）。Codex 与 Claude Code 仅作为实验性 skill / MCP 入口保留（见[客户端说明](docs/clients.md)），不包含自动显示译文的界面。

## 界面效果与工作原理

- **段落上下对照**：默认保留原文，在每个完整的助手段落下方显示浅色译文。开启“隐藏原文”后，已就绪的段落只显示译文（翻译中或失败时仍保留原文）。
- **表格与代码处理**：表格默认展示译文，可通过表格上方的“译文 / 原文”按钮整表切换；代码块、行内代码、链接、公式、工具输出、思考过程及含复杂媒体的内容保持原样，不作翻译。
- **不改写原始会话**：所有译文与显示切换仅作用于前端展示层和本地缓存，不会修改 Harness 保存的原始聊天记录，也不进入后续对话的模型上下文。
- **托管本地推理**：默认使用腾讯 **Hy-MT2 1.8B Q4_K_M** 模型（约 1.13 GB），由内置脚本自动配置 `llama.cpp` 托管启动，无需手动安装 Ollama、pip 或 npm 包。模型与运行时仅在首次安装时下载，默认模式下后续推理均在本机完成（若单独配置外部 provider，则会按所选服务发起网络请求）。

> **注意**：回译可能改变局部含义。PlainSpeak 是改善阅读体验的辅助层，不能保证修复原回答中的事实或理解错误。处理技术细节或关键数据时，请随时对照原文。

## 安装与启动（Windows）

**前置条件**：

- 已安装并可正常运行的 DeepSeek Harness
- Python 3.10+（安装脚本可自动发现系统 Python 或 Harness 自带的 Python，无需管理员权限或修改系统 PATH）

目前通过源码包安装（尚未发布到 PyPI、npm 或宿主插件市场）。请先从 [Releases](https://github.com/ArdentL/PlainSpeak/releases) 下载源码 ZIP 并解压，在解压后的源码目录中打开 PowerShell：

### 方式一：桌面版（Desktop Profile）

1. 先启动一次 Harness 桌面版以初始化 desktop profile，然后**关闭宿主**。
2. 在源码目录执行安装脚本：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-harness.ps1 --client desktop
   ```
3. 等待脚本完成插件部署、运行时与默认模型下载。完成后**重新启动 Harness 桌面版**即可自动加载。

### 方式二：网页版（Web Profile）

1. 在源码目录执行默认安装脚本：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-harness.ps1
   ```
2. 安装器不会自动启动宿主。安装完成后，携带生成的 patch 启动 Harness 网页版：
   ```powershell
   dsh --profile web --patch "$env:LOCALAPPDATA\PlainSpeak\harness.patch.yml"
   ```

默认数据与模型保存在 `%LOCALAPPDATA%\PlainSpeak`。如需复用已下载的官方 GGUF 文件或自定义路径，请参阅[详细安装说明](docs/harness-install.md)。

## 日常使用与设置

启动后，点击会话标题旁的 **PlainSpeak 设置** 即可打开控制面板：

- **显示控制**：随时开关“自动译文”与“隐藏原文”。关闭后立即恢复显示原始段落。
- **目标输出语言**：面板支持选择简体中文（默认）、英语、日语、韩语、法语、德语、西班牙语作为译文输出语言。
- **清晰表达规则**：开启或关闭写作规则，变更从下一条助手回复生效。
- **本地记录管理**：默认在本地最多保存 1000 条段落翻译记录，刷新或重启后可直接复用已翻译结果。你可以在面板中关闭记录保存、导出 JSON 或确认清空。

## 模型管理

内置模型库收录了腾讯官方 Hy-MT2 的 1.8B 与 7B（各含 Q4、Q6、Q8 量化）共六款模型。目前仅默认款 `hy-mt2-1.8b-q4` 已在本项目实际试用，其余升级款尚未做回译质量对比。可通过命令行查看或按需切换（详见[模型库文档](docs/models.md)）：

```powershell
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models list
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models install hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models use hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models status
```

## 致谢与第三方组件

PlainSpeak 的实现受益于以下上游开源项目、模型与写作规则库。完整声明、固定版本号与哈希记录请参阅根目录的 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及各技能目录下的原始许可文件。

| 上游项目 | 项目中用途 | 归属、许可与启用方式 |
| --- | --- | --- |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | 原生插件宿主、官方插槽及宿主 Markdown 组件 | 调用官方公开接口，未复制宿主组件源码；宿主保留其原有许可 |
| [tencent/Hy-MT2-1.8B-GGUF](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF) 与 [tencent/Hy-MT2-7B-GGUF](https://huggingface.co/tencent/Hy-MT2-7B-GGUF) | 默认本地翻译小模型（1.8B Q4）及可选升级模型 | 腾讯；固定版本实际 [LICENSE.txt](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/blob/a0c709d9fac510f2c807aa3af52872340dc37a4a/LICENSE.txt) 为 Apache-2.0；安装时另行下载，不在源码包内 |
| [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) | 本地 GGUF 模型托管推理运行时 | MIT；安装时另行下载官方运行时压缩包，包内附带依赖的许可随解压目录保留 |
| [blader/humanizer](https://github.com/blader/humanizer) | 收录的英文优先写作 skill | MIT（[许可文本](third_party/blader--humanizer/LICENSE)）；位于 `third_party/`，需手动启用 |
| [Kiterlin/anti-defensive-writing](https://github.com/Kiterlin/anti-defensive-writing) | 收录的反防御性写作 skill | MIT（[许可文本](third_party/Kiterlin--anti-defensive-writing/LICENSE)）；位于 `third_party/`，需手动启用 |
| [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | 收录的中文改写 skill | MIT（[许可文本](third_party/op7418--Humanizer-zh/LICENSE)）；位于 `third_party/`，需手动启用，并保留其[补充来源许可](third_party/op7418--Humanizer-zh/licenses/) |
| [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) | 实验性可选 MCP 接口支持 | MIT；不包含在源码包内，仅在开发者手动安装 MCP 可选依赖时使用 |

此外，[技能目录](docs/skill-catalog.md)整理了其他外部写作规则的参考链接（仅收录来源链接，并未打包或集成全部技能；例如 goldengrape 相关指令因许可尚未确认，仅提供外部介绍链接，未包含在仓库内）。

## 许可与更多文档

PlainSpeak 自有代码与自有 skill 采用 [MIT 许可证](LICENSE)。第三方模型、宿主、运行时及 `third_party/` 下的收录材料各自适用其独立许可，不统一归入 PlainSpeak 的 MIT 许可。完整第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

- [安装与数据细节](docs/harness-install.md) · [模型库说明](docs/models.md) · [客户端与实验性 MCP](docs/clients.md)
- [验证与验收记录](docs/verification.md) · [外部技能目录](docs/skill-catalog.md) · [更新日志](CHANGELOG.md)
