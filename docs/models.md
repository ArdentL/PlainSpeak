# 模型库

先用默认的 **Hy-MT2 1.8B Q4_K_M**：下载约 1.13 GB，已在本项目本地试用。需要比较其他版本时，再按需安装；升级选项尚未做 PlainSpeak 回译质量对比，模型更大或量化精度更高不代表已经证实回译效果更好。

| 模型 ID | 参数量 / 量化 | 下载量（GB） | 内存估算（GB） | 项目验证状态 |
| --- | --- | ---: | ---: | --- |
| `hy-mt2-1.8b-q4` | 1.8B / Q4_K_M | 1.13 | 4 | 默认；本地试用过 |
| `hy-mt2-1.8b-q6` | 1.8B / Q6_K | 1.47 | 4.5 | 未做回译对比 |
| `hy-mt2-1.8b-q8` | 1.8B / Q8_0 | 1.91 | 5 | 未做回译对比 |
| `hy-mt2-7b-q4` | 7B / Q4_K_M | 4.62 | 8 | 未做回译对比 |
| `hy-mt2-7b-q6` | 7B / Q6_K | 6.16 | 10 | 未做回译对比 |
| `hy-mt2-7b-q8` | 7B / Q8_0 | 7.98 | 12 | 未做回译对比 |

GB 按十进制计算。内存列是模型进程的粗略预算，包含权重和运行开销；这些值不是实测峰值，也不包含操作系统及其他应用。托管运行时当前使用 8192 token 上下文，实际占用随文本长度和运行时变化。安装时另需相应的磁盘空间。

## 查看、安装与切换

```powershell
# 查看内置目录及当前状态
plainspeak models list
plainspeak models status

# 安装并使用默认小模型
plainspeak models install hy-mt2-1.8b-q4
plainspeak models use hy-mt2-1.8b-q4

# 按需下载一个升级候选，然后切换
plainspeak models install hy-mt2-7b-q4
plainspeak models use hy-mt2-7b-q4

# 随时切回小模型
plainspeak models use hy-mt2-1.8b-q4
```

`install` 获取指定模型，`use` 选择已经安装的模型；查看或切换不应触发其他模型的下载。翻译前完成一次安装，后续可使用本地权重。

## 来源与核验

目录保存在 `src/plainspeak/data/models.json`。2026-11-09 直接查询腾讯官方 Hugging Face 仓库 API，核对了以下固定版本的文件名、字节数、LFS SHA-256 和完整 `LICENSE.txt`：

- **1.8B**：版本 `a0c709d9fac510f2c807aa3af52872340dc37a4a`。[文件清单](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/tree/a0c709d9fac510f2c807aa3af52872340dc37a4a)、[机器可读元数据](https://huggingface.co/api/models/tencent/Hy-MT2-1.8B-GGUF/tree/a0c709d9fac510f2c807aa3af52872340dc37a4a?recursive=true)、[实际许可文本](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/blob/a0c709d9fac510f2c807aa3af52872340dc37a4a/LICENSE.txt)。
- **7B**：版本 `ab8472660ac61fac25f1af43fac2599d52a8a775`。[文件清单](https://huggingface.co/tencent/Hy-MT2-7B-GGUF/tree/ab8472660ac61fac25f1af43fac2599d52a8a775)、[机器可读元数据](https://huggingface.co/api/models/tencent/Hy-MT2-7B-GGUF/tree/ab8472660ac61fac25f1af43fac2599d52a8a775?recursive=true)、[实际许可文本](https://huggingface.co/tencent/Hy-MT2-7B-GGUF/blob/ab8472660ac61fac25f1af43fac2599d52a8a775/LICENSE.txt)。

所有条目的下载 URL 都固定到上述版本；`sha256` 来自 API 的 `lfs.oid`，不是 Git 文件对象的 `oid` 或 `xetHash`。安装器应同时核对下载后的字节数与 SHA-256。7B 的 Q6/Q8 文件名前缀为 `HY-`，Q4 前缀为 `Hy-`，目录保留了上游大小写。

两个固定版本的实际许可文本均为 **Apache-2.0**，模型许可独立于 PlainSpeak 的软件许可。上游[模型说明中的语言表](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/blob/a0c709d9fac510f2c807aa3af52872340dc37a4a/README.md#supported-languages)是语言支持来源；目录中的 `languages: ["see-supported-language-registry"]` 表示由应用语言注册表统一列出，避免把未核准的语言代码写入下载元数据。

目前只收录腾讯官方常规 GGUF 的这六个选项。专用 2bit / 1.25bit 版本需要另核运行时兼容性，未加入自动安装目录。本次只查询元数据与许可文本，没有批量下载升级模型或测量其速度、内存与回译质量。
