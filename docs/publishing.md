# v0.7.0 公开预览发布

当前范围是 **Windows + DeepSeek Harness 网页与桌面 profile**，本轮使用已安装的 `@deepseek-ai/dsh 0.2.1-rc.5` 桌面 Host 及其网页前端。用户获取源码 ZIP，解压后运行根目录 `install-harness.ps1`；桌面版先启动 Harness 初始化 profile，再使用 `--client desktop` 安装并重启，网页版默认仍使用外置 `--patch`。其他宿主代码保留为开发者实验。

## 当前发布状态

公开源码仓库：[ArdentL/PlainSpeak](https://github.com/ArdentL/PlainSpeak)。当前版本为 **v0.7.0 公开预览**；源码和安装脚本见仓库，版本包与 SHA-256 见 [Releases](https://github.com/ArdentL/PlainSpeak/releases)。

| 项目 | 当前范围 |
| --- | --- |
| 版本 | `v0.7.0`，公开预览版 |
| 源码仓库 | [ArdentL/PlainSpeak](https://github.com/ArdentL/PlainSpeak) |
| 安装方式 | 下载源码包，解压并运行根目录安装脚本 |
| 版本下载 | [GitHub Releases](https://github.com/ArdentL/PlainSpeak/releases)；具体发布状态以该页面为准 |
| Harness 市场 / npm 包 | 未发布 |
| CI | 由 GitHub Actions 运行；实际状态见仓库 Actions 页面 |

本地验证结果见[验证记录](verification.md)。旧版本文档中保留的连接器失败和未上传说明属于当时的状态。

## 发布包内容

源码 ZIP 应保留：

- 根目录安装脚本、README、CHANGELOG、LICENSE、第三方声明和项目配置。
- `scripts/`、`src/`、`adapters/harness-ui/`，包括已构建的 `lib/client.js`。
- 文档与合成验收证据；skill 目录和随附的第三方许可证。
- CI 与插件清单等点目录；浏览器手动上传可能漏掉它们。

排除 `.scratch/`、虚拟环境、缓存、模型、运行时下载包、本地 SQLite 数据库、真实会话、凭据、个人路径和生成配置。安装器在用户明确运行后才下载并核验外部运行时与模型，源码 ZIP 本身不包含它们。

## 发布前核对

1. 构建原生浏览器入口，运行适用的 Python / Node 检查；把实际结果写入[验证记录](verification.md)，不要将配置好的 CI 当作已运行。
2. 检查安装脚本、已构建入口、许可和本地链接都在导出的源码包中，记录包的 SHA-256。
3. 核验 README、[安装说明](harness-install.md)、[CHANGELOG](../CHANGELOG.md)中的平台、版本和限制一致。
4. 使用已经确认的账号与真实仓库地址推送，再核对远程提交。创建 `v0.7.0` 标签及 **prerelease**，附源码 ZIP 和校验值。
5. 验证远程仓库可访问、标签指向正确提交、Release 附件可取，再更新上面的状态表及链接。

远程上传与发布需要相应授权和实际回执；此文档本身不会创建仓库、推送或发布。发布地址使用已创建的 ArdentL/PlainSpeak 仓库。

## 用户需要知道的范围

本轮在 Windows `0.2.1-rc.5` 桌面 Host 及其网页前端完成 12/12 段 Hy-MT2 Q4 实际回译；保存隐藏原文并刷新后，12 份译文就绪、12 个原文块隐藏，代码不变，记录面板显示 12 条，未见控制台错误。Electron 原生外壳 GUI 受工具限制尚未验收。安装验收复用了已有 GGUF；干净机器的全量网络下载安装、Linux/macOS 执行及其他宿主适配尚未验收。译文可能改变含义，字面量保护不等于语义正确性检查。

自有内容采用 MIT；第三方文件和外部模型、运行时分别保留其许可。见[第三方声明](../THIRD_PARTY_NOTICES.md)。
