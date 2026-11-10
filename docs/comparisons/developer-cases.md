# DeepSeek 回答对比：10 个常用场景

左边是 DeepSeek 的原始回答，右边是加入清晰表达规则后生成、再经过本地回译的回答。点击下面的场景查看全文。

这批案例中，回答缩短主要发生在加入写作规则之后；回译反而让每篇回答都变长了，也出现了误译。例如，实验设计中的“置信区间跨零”变成了“置信区间为零”，交接说明变成了“切换说明”。环境排错有两段因行内代码检查失败而保留了回译前的原稿。各页附有具体问题和中间稿。

## 场景

1. [修复 Python 函数第二次调用时混入旧数据的问题](01-debug.md)
2. [排查终端能导入 NumPy、编辑器却报错的原因](02-environment.md)
3. [审查权限缓存是否会返回过期数据](03-review.md)
4. [用一个例子讲清 PPO 为什么要裁剪概率比](04-paper-explanation.md)
5. [设计实验，检查第二轮提供检索证据是否有用](05-experiment-design.md)
6. [判断实验中的小幅提升是否支持继续投入](06-result-interpretation.md)
7. [确认桌面插件第一版需要做什么](07-requirements.md)
8. [安排两个人在两周内完成第一版](08-project-plan.md)
9. [汇报今天的进度，说明能否交给别人试用](09-status-report.md)
10. [整理卡顿排查记录，交给下一个 Agent](10-handoff.md)

## 测试条件

<details>
<summary>模型、参数和复现方法</summary>

测试于2026年11月10日进行，使用了10个虚构的中文问题。每个问题都启动了两次对话；DeepSeek API被调用了20次，第一次成功的回应被作为答案使用。

左侧只发送用户问题。右侧则添加了PlainSpeak 0.7.0中的`CLEAR_WRITING`系统指令。该指令与 Harness 插件注入的写作规则相同，随后进行本地翻译。完整的指令被存储在协议文件中。

双方均使用模型`deepseek-v4-flash`；服务返回的标识符均为`deepseek-flash`。参数设置为`temperature=0`、`thinking.type=disabled`和`max_tokens=8192`。所有回复都以`stop`结尾。测试中未使用任何工具，答案中的命令也没有被执行。

翻译过程使用了腾讯的`Hy-MT2-1.8B-Q4_K_M`模型，并使用了项目中的`plainspeak.core.rewrite`函数。每段文字最多包含750个字符。中文文本先被翻译成英文，再翻译回中文，而代码和现有保护机制则被保留下来。普通数字则未经过一致性检查。

在这种情况下，整个Markdown文档均使用core/CLI处理，没有提供上下文参数。Harness界面根据DOM段落收集相关上下文；本次没有测试 Harness 的这条路径，也没有执行完整的 Agent 工具流程。

双方的两种回应都是独立生成的。要查看翻译实际发生了什么变化，可以对比每页上提供的skill 原稿和最终版本。

完整写作指令见 [protocol.json](data/protocol.json)。本地模型文件 SHA-256：

```text
dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699
```

### 重新运行

每个场景的数据文件都保留了发送给模型的消息、参数、结果以及使用量。使用你自己的DeepSeek凭证，分别发送这两组消息。每次开始新的对话时，你都可以再次进行对比。

将只加 skill 的回答保存为 UTF-8 Markdown。安装好默认模型后，运行以下命令。本轮中，使用相同的核心库来处理文本；原始代码块则不会交给翻译模型处理。每页上的观察结果既反映了原始回复中的问题，也反映了翻译带来的新问题。

20次DeepSeek调用的总使用量如下：输入部分使用3394个标记，输出部分使用13710个标记，总计17104个标记。本地翻译模型所花费的时间则被记录在每个场景中。

```powershell
plainspeak rewrite skill-answer.md --language zh-CN --pivot en --output rewritten.md
```

</details>

[问题清单](data/cases.json) · [测试协议](data/protocol.json) · [用量与文件哈希](data/summary.json) · [项目首页](../../README.md)
