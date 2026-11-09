# Harness 接入与开发入口

v0.7.0 面向 **Windows + DeepSeek Harness**，支持网页与桌面 profile 安装。本轮联调使用 `@deepseek-ai/dsh 0.2.1-rc.5` 桌面 Host 及其网页前端；Electron 原生外壳 GUI 尚未验收。其他宿主适配列入后续计划；本页后半保留早期 skill / MCP 的开发者实验用法。

## Harness 原生接入

桌面版先启动 Harness 一次以初始化 profile，再从源码 ZIP 解压目录运行：

```powershell
.\install-harness.ps1 --client desktop
```

安装完成后关闭并重启桌面版。安装器将自有包添加到 desktop profile 的 `dsh.profile.bundles`，通过原生 bundle 激活，不需要附加 `--patch`。它保留 profile JSON 的其他字段及已有用户 YAML 的原始字节。

网页版保留默认安装与外置 patch 启动方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-harness.ps1
dsh --profile web --patch "$env:LOCALAPPDATA\PlainSpeak\harness.patch.yml"
```

第一条命令准备独立应用、安装官方小模型和 llama.cpp 运行时；第二条启动 Harness。默认模型约 1.13 GB，无需 Ollama。完整参数、已有模型复用与升级见[安装说明](harness-install.md)和[模型库](models.md)。

安装器向所选 profile 的 `node_modules/@plainspeak/harness-ui` 添加自有包，用哈希清单和可恢复事务保护安装文件。web 模式用独立 patch 注册 `plainspeak-ui`，不改写宿主 profile 清单或用户 YAML；desktop 模式仅合并原生 bundle 激活字段。两种模式都保留凭据和会话。使用自定义 `DSH_HOME` 或 `--profile-dir` 时，启动要对应同一 profile。源码分发中的原生包不需要 npm 安装，也没有市场条目。

插件复用 `conversation.chat.node` 的原始助手组件与官方插槽，译文使用宿主 Markdown 组件。正文、标题与简单表格说明可翻译，代码块、纯技术值、含未支持媒体的块、用户消息、工具输出和思考过程保留原样。清晰表达规则通过 `systemPrompt.section` 注入，不依赖模型主动调用工具。

**PlainSpeak 设置** 控制自动译文、语言、清晰表达和保存记录。宿主将设置与最多 1000 条段落记录保存在 `<PlainSpeak 数据目录>/ui/records.sqlite3`；成功结果可在刷新或重启后复用。面板支持查看、导出 JSON 和两步清空；关闭保存停止新增持久记录及复用。原会话存储保持不变。

本轮在上述桌面 Host 的网页前端完成 12/12 段 Hy-MT2 Q4 实际回译。设置隐藏原文并刷新后，12 份译文仍就绪、12 个原文块隐藏，Python 代码 `print("hello")` 不变，记录面板显示 12 条。接口返回 200，未见控制台错误；这不包含 Electron 原生外壳 GUI 验收。证据见[验证记录](verification.md)。新机器的全量网络下载安装及 Linux/macOS 尚未验收。

## Advanced experimental skill / MCP

以下为开发者实验入口，保留在源码中，供后续宿主适配使用。Codex 与 Claude Code 当前没有 PlainSpeak 自动段落显示界面；首发推荐使用上面的 Harness 原生路径。

### CLI 与可选 MCP

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[mcp]"
.\.venv\Scripts\python.exe -m plainspeak setup
.\.venv\Scripts\python.exe -m plainspeak rewrite examples/research.zh-CN.md --language zh-CN --output .scratch/result.md --report .scratch/report.json
```

CLI 默认 `managed`；`setup` 显式下载运行时与模型，翻译时再启动。外部服务可明确选择 `PLAINSPEAK_PROVIDER=ollama` 或 `openai`，并设置 `PLAINSPEAK_BASE_URL`、`PLAINSPEAK_MODEL` 和可选 `PLAINSPEAK_API_KEY`。文字会发送到所选端点。Linux/macOS 的环境路径为 `.venv/bin/python`，此处保留用法而不代表实际平台验收。

MCP 启动不下载权重。它在 Agent 调用 `rewrite_text` 时处理传入文本，与 Harness 原生界面自动增强分别实现。仅使用写作 skill 无需模型。

### 生成待审阅片段

```powershell
$plainPython = (Resolve-Path .\.venv\Scripts\python.exe).Path
python scripts/client_setup.py --client codex --python $plainPython --output .scratch/codex-setup --dry-run
python scripts/client_setup.py --client codex --python $plainPython --output .scratch/codex-setup
```

可将 `codex` 换成 `claude` 或 `harness`。脚本生成片段和 skill，不修改全局配置、`AGENTS.md` 或 `CLAUDE.md`，已有目标文件会拒绝覆盖。`--extra-skill <slug>` 可明确添加 `third_party/` 中的附加来源并保留许可；默认只有两个自有 skill。目录与许可见[skill 目录](skill-catalog.md)。

| 实验入口 | Skill 位置 | 待合并配置 |
| --- | --- | --- |
| Codex | `.agents/skills/` | `plainspeak.codex.snippet.toml`，TOML MCP 表 |
| Claude Code | `.claude/skills/` | `plainspeak.claude.snippet.json`，项目 MCP JSON |
| Harness MCP | `.dsh/skills/` | Settings 单服务器条目或 Cordis MCP 插件行 |

Codex 原生清单和 Claude 插件清单仅包装 skill，不提供自动译文界面。需要 MCP 时先安装可选依赖，再将生成片段合入对应配置，保留其他服务器；用客户端 MCP 状态与 `list_languages` 检查加载。Harness 的 Settings 与静态 Cordis MCP 行二选一，避免重复注册。

已有日常指令和长文自动回译文件也是待采纳的 Agent 指令，不会自行启用。早期协议与片段检查记录见[验证记录](verification.md#earlier-checks-01)。

### 接口资料

- [Harness 原始项目](https://github.com/deepseek-ai/deepseek-harness)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code 插件](https://code.claude.com/docs/en/plugins-reference)
