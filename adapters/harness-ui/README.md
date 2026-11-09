# PlainSpeak — DeepSeek Harness 原生 UI 插件

v0.6.0 提供 Windows 网页与桌面 profile 安装入口，本轮联调使用已安装的 `@deepseek-ai/dsh 0.2.1-rc.5` 桌面 Host 及其网页前端。插件使用原生 `dsh.client` 客户端入口、`conversation.chat.node` 的 `assistant-step` 插槽和 `webServer.register` API；不修改 Harness 安装文件。桌面 profile 由原生 bundle 激活，网页版仍使用外置 patch。

默认通过 `systemPrompt.section` 注入中文清晰表达规则。助手正文仍由 Harness 原始组件渲染，译文复用宿主 MarkdownText 与共享 ReactDOM portal，显示标题、加粗、链接、行内代码及公式。正文、标题与简单表格说明可翻译；代码块、纯技术值、复杂嵌套单元格、含未支持图片/SVG/音视频等媒体的块、用户消息、工具输出和思考过程保留原样。流式生成时，最后一块等到下一块出现或生成结束后再翻译，安静 350 毫秒后提交。译文不改写 Harness 原始会话，不进入模型上下文或工具调用；PlainSpeak 可另存本地段落记录。

会话标题旁提供可见的 **PlainSpeak 设置** 入口。面板控制自动译文、语言、清晰表达规则和保存记录。默认中文，也可选择英语、日语、韩语、法语、德语、西班牙语；清晰表达规则的变化从下一条助手回复生效。页面排队串行翻译；文字变更、禁用、切换语言或卸载时取消旧请求。已开始的单次 provider 调用等待返回后停止后续调用，不承诺立即中断在途推理。

## 持久设置与记录

普通段落上下对照，完全相同的输出不重复显示；表格默认显示译文，用表格上方“译文 / 原文”切换整张表。关闭自动翻译时移除切换按钮并恢复全部原文。切换仅影响展示，不重新翻译。

宿主通过 Python SQLite 标准库将设置与记录保存到 `<dataHome>/ui/records.sqlite3`。设置字段为 `enabled`、`language`、`clearWriting`、`saveHistory`、`hideOriginal`，刷新、重启后保留，访问同一安装的浏览器读取同一套设置。隐藏原文时，成功译文以正文方式展示，不增加引用装饰。旧版 localStorage 偏好不自动迁移；新设置不依赖 localStorage。

默认最多保存 1000 条段落记录，字段包含原文、输出、输出语言、中间语言、模型、时间与处理报告。相同原文、语言路线和模型可复用通过保护检查的结果，刷新或重启后仍有效；保留原段或失败的结果不作为成功译文复用。`saveHistory: false` 禁止新增持久记录及历史结果复用，不删除已有记录。

面板提供记录查看、JSON 导出和两步确认清空。清空针对 PlainSpeak 记录，不改动 Harness 原始会话。记录包含用户段落，只保存在本机，不上传、不加入模型上下文，也不随插件源码包发布。

清空会通知当前页面所有段落 controller，取消未入队的 debounce 和旧请求，不因 observer 刷新重交未改变的旧块；已显示译文保留，新文本继续处理。SQLite 每个连接开启 `secure_delete`，旧数据库空闲页在迁移时回收；作用范围是当前数据库文件，不包含备份、快照或物理介质擦除。

## 配置

桌面版先启动 Harness 一次初始化 profile，再运行 `.\install-harness.ps1 --client desktop` 并重启宿主。安装器将包复制到所选 profile 的 `node_modules/@plainspeak/harness-ui`，将包名合并到 `package.json` 的 `dsh.profile.bundles`，保留其他 JSON 字段和已有用户 YAML 原始字节。原生 bundle 加载自有 `cordis.patch.yml`，无需附加 `--patch`。

网页版默认安装到 web profile，仍使用独立 `harness.patch.yml` 作为启动 overlay，不改写 profile 的 `package.json`。patch 使用 `name: '@plainspeak/harness-ui'` 注册；不要使用 Windows 绝对目录作为模块名。初次创建宿主设置时使用以下配置默认值，之后由设置面板保存的值控制：

```yaml
pythonCommand: C:/path/to/python.exe
projectRoot: C:/path/to/plainspeak-project
dataHome: C:/path/to/plainspeak-data
clearWriting: true
translationEnabled: true
language: zh-CN
saveHistory: true
```

`pythonCommand` 是可执行文件，不接受 shell 命令；需要固定前置参数时使用 `pythonArgs` 数组。`projectRoot` 是 Python 工作目录，`pythonCwd` 是其兼容别名。源码布局自动追加 `<projectRoot>/src` 到 `PYTHONPATH`；已安装布局也可从工作目录直接导入 `plainspeak`。`translationEnabled` 对应持久设置的 `enabled`；配置只提供数据库首次创建时的默认值，已有持久设置优先。

插件通过宿主拥有的 `python -m plainspeak.bridge --port 0 --token <random> --exit-on-stdin-close` 读取持久设置与记录，强制 `PLAINSPEAK_PROVIDER=managed`；首次翻译再启动托管模型运行时。客户端通过宿主 `/api/plainspeak/` 接口访问设置、记录和回译，随机 Bearer 密钥留在宿主。自有接口校验严格 loopback Host、可用的远端地址、Fetch-Site 和同源 HTTP(S) Origin；静态 `X-PlainSpeak` 标记不作为身份凭据。桌面代理的无 Origin 请求仍需通过本机地址检查。请求 ID 用于尽力取消，取消传输独立于已中止的翻译请求。卸载插件时注销自有路由并关闭桥接进程 stdin，2 秒后仍存活则终止该进程。模型安装、模型选择与运行时由 Python managed backend 管理。

## 构建与验证

```powershell
node scripts/build.mjs
node --test tests/*.test.mjs
```

构建不需要 npm 安装：生成 Harness 原生模块表格式，复用宿主 React。Node 测试检验桥接进程生命周期、认证代理、同源约束、系统提示注入和浏览器入口结构。测试 fixture 不执行模型推理，不能作为真实 Harness UI 或翻译质量通过的证据。真实 UI 需在独立 profile 启动 Harness 后检查。

当前实现通过 DOM 段落观察器增强原始助手组件；它依赖此版本的标准 `p`/叶子 `li` 结构与思考行 `data-variant="think"` 标记。升级 Harness 后应重新核查插槽和段落结构。

本轮在 Windows `0.2.1-rc.5` 桌面 Host 的网页前端完成 12/12 段 Hy-MT2 Q4 实际回译。通过设置保存 `hideOriginal=true` 并刷新后，12 个输出仍为 ready、12 个原文块隐藏，Python 代码 `print("hello")` 不变，记录面板显示 12 条。接口返回 200，未见控制台错误。Electron 原生外壳 GUI 受工具限制尚未验收；Linux/macOS 也未执行验收。
