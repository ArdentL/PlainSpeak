# Harness 公开预览版安装（Windows）

v0.6.0 面向 Windows，提供网页与桌面 profile 安装入口。本轮联调使用已安装的 `@deepseek-ai/dsh 0.2.1-rc.5` 桌面 Host 及其网页前端。先准备可用的 Harness，再解压 PlainSpeak 源码 ZIP。

## 桌面版

先启动 Harness 桌面版一次，初始化它的 desktop profile。关闭宿主后，在 PlainSpeak 源码目录运行：

```powershell
.\install-harness.ps1 --client desktop
```

默认目标为 `~/.dsh/profiles/desktop`。设置了 `DSH_HOME` 时沿用该目录，也可使用 `--profile-dir` 指定已初始化的桌面 profile。若缺少可识别的 profile `package.json`，安装器会提示先启动 Harness，不会创建猜测的宿主配置。

安装器将自有包放入该 profile 的 `node_modules/@plainspeak/harness-ui`，并将包名加入 `package.json` 的 `dsh.profile.bundles`，保留其他 JSON 字段及值。原生 bundle 自动加载自己的 `cordis.patch.yml`；已有用户 YAML 文件保持原始字节不变。安装完成后关闭并重启 Harness 桌面版即可，无需外置 `--patch` 参数。

## 网页版

默认安装仍使用 web profile：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-harness.ps1
```

安装器选择本机 Python 3.10+；也可使用 Harness 自带的 Python。它将应用、原生界面插件和独立 patch 放入 `%LOCALAPPDATA%\PlainSpeak`，然后下载默认的 1.13 GB 小模型与匹配的 llama.cpp 运行时。已有 `PLAINSPEAK_HOME` 时使用该目录。无需 Ollama、pip、npm、管理员权限或修改 PATH。`ExecutionPolicy Bypass` 仅作用于这次 PowerShell 进程。

若已有默认模型的官方 GGUF，可复用它；仍会核对大小与 SHA-256，运行时缺失时单独下载：

```powershell
.\install-harness.ps1 --source 'D:\Models\Hy-MT2-1.8B-Q4_K_M.gguf'
```

可用 `-Python 'C:\path\python.exe'` 指定解释器，`--home 'D:\PlainSpeak'` 指定安装位置，`--model hy-mt2-7b-q4` 选择其他目录模型。网页版插件副本安装到 `~/.dsh/profiles/web/node_modules/@plainspeak/harness-ui`；设置了 `DSH_HOME` 时沿用它，也可用 `--profile-dir` 指定其他 profile 目录。web 模式只写自己的插件包与独立 patch，不修改 profile 的 `package.json` 或用户 YAML。只检查计划用 `--dry-run`；只准备文件而不下载用 `--prepare-only`，此时翻译要等后续 setup 完成才能使用。这些参数也可与 `--client desktop` 组合。

安装完成后输出启动参数，保存在安装目录 `harness-launch.json`。手动启动 Harness 时附加该 patch，例如默认目录：

```powershell
dsh --profile web --patch "$env:LOCALAPPDATA\PlainSpeak\harness.patch.yml"
```

若 `dsh` 不在 PATH，请用本机 Harness CLI 启动入口加同样参数；安装器不修改宿主入口，也不自动启动 Harness。web 模式每次要启用插件的启动都附加 patch；去掉参数即可启动原配置。

patch 只插入 `plainspeak-ui` 一行，使用包名 `@plainspeak/harness-ui`，让宿主从所选 profile 的 `node_modules` 解析；保留原有 profile、凭据、工作区和插件设置。启动时的 `DSH_HOME`、profile 必须与安装所选目录一致。默认开启清晰表达指令、中文翻译界面。插件通过私有本地 Python bridge 使用托管运行时；翻译发生在本机。

## 设置与本地记录

启动后从会话标题旁的 **PlainSpeak 设置** 打开面板，调整自动译文、隐藏原文、输出语言、清晰表达规则和保存记录。清晰表达规则从下一条助手回复生效。默认输出简体中文，另可选择英语、日语、韩语、法语、德语、西班牙语。

“隐藏原文”默认关闭。开启后，译文就绪的段落只显示译文；翻译中或失败时仍显示原文。关闭该选项或关闭自动翻译都会恢复原文；设置保存在本机，不改动 Harness 原始会话。

设置与记录由宿主保存在 `<PlainSpeak 数据目录>/ui/records.sqlite3`，默认 Windows 路径为 `%LOCALAPPDATA%\PlainSpeak\ui\records.sqlite3`；设置了 `PLAINSPEAK_HOME` 时随之改变。刷新页面或重启 Harness 后保留，访问同一安装的浏览器使用同一份宿主设置，不依赖浏览器 localStorage；旧版浏览器偏好不自动迁移。

“保存记录”默认开启，最多保留 1000 条段落记录，包含原文、输出、语言、模型、时间与处理报告。原段落、语言路线和模型相同时，可复用通过保护检查的已保存结果，减少刷新与重启后的重复推理。面板可查看记录、导出 JSON，并通过“清空—确认”两步删除。关闭保存会停止持久写入与历史复用，已有记录不会因此删除。

这些记录只在本机保存，不写回 Harness 原始会话、不进入模型上下文，也不上传或包含在插件源码包中。面板确认清空后，当前页面已有旧段落的定时器与请求被取消，已显示译文保留，新文本继续处理。禁用、切换语言及卸载也会取消旧工作；已开始的单次模型调用等待返回后停止后续调用。

SQLite 连接显式开启 `secure_delete`，清空和记录淘汰覆盖对应数据库内容；旧数据库空闲页在迁移时回收。这只处理当前数据库文件，不保证擦除备份、快照或存储介质。

安装目录内的模型命令入口：

```powershell
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models list
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models install hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models use hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models status
```

安装器记录自己拥有的文件和哈希，并通过可恢复事务提交应用、profile 插件及激活信息。中断后使用相同 `--client`、`--home` 和 `--profile-dir` 重试，会先恢复未完成事务。再次运行会更新自有文件，保留模型、应用设置和其他用户文件；遇到未知文件、用户改过的已安装文件或链接目录会停止，避免覆盖。不要手动修改生成的 patch；web 模式需要自定义时复制成另一个文件并在启动时使用副本。Python 入口使用所选解释器的绝对路径，移动或删除解释器后需要重新运行安装器。

安装器及应用使用 Python 标准库；发布包必须包含已构建的 `adapters/harness-ui/lib/client.js`。当前范围先完成 Harness 体验验证，其他宿主后续复用托管模型与界面逻辑。

## 验收范围

本轮在 Windows `0.2.1-rc.5` 桌面 Host 及其网页前端完成 12/12 段 Hy-MT2 Q4 实际回译；通过设置保存隐藏原文并刷新后，12 份译文仍就绪、12 个原文块隐藏，Python 代码 `print("hello")` 不变，本地记录面板显示 12 条。接口返回 200，未见控制台错误。Electron 原生外壳 GUI 受工具限制尚未验收，详见[验证记录](verification.md)。安装过程复用了已有 GGUF，干净机器的全量网络下载安装尚未跑完；Linux/macOS 尚未执行验收。译文可能改变含义，可关闭隐藏原文进行对照。

公开仓库、源码 ZIP 与预览 Release 的远程状态见[发布说明](publishing.md)。本版没有 Harness 市场条目或已发布 npm 包。
