# 日常、学习和工作：十组 PlainSpeak 对比

同一个问题，看看 PlainSpeak 改变了什么。

这里有十种常见用法：和朋友聊天、高中生学概率、本科生写读书报告、研究生读论文、讨论科研想法，以及写代码、发家长通知、回复顾客、介绍产品和协调会议。左侧是 DeepSeek 原版，右侧是启用写作规则、再经过本地回译的完整回答。

可以先看三个案例：给朋友的回复不再一次列出三套话术；条件概率的讲解保留抽球过程和公式，删去几段重复总结；客服回复直接说明现在做什么、几点给反馈，也保留尚不知道送达时间的事实。

## 找一个你会用的场景

1. 日常聊天：[周末只想休息，怎么拒绝朋友的邀请](everyday/01-everyday.md)
2. 高中生：[用抽球的例子理解条件概率](everyday/02-school.md)
3. 本科生：[看懂摘要里的相关性，写好读书报告](everyday/03-undergraduate.md)
4. 研究生读论文：[把论文里的消融实验讲明白](everyday/04-graduate-paper.md)
5. 研究人员：[讨论一个刚冒出来的想法，找到第一步实验](everyday/05-research-idea.md)
6. 程序员：[定位异步循环里漏掉 await 的问题](everyday/06-coding.md)
7. 教师：[把家长通知写得清楚、自然](everyday/07-teacher.md)
8. 客服：[回应包裹延误，说明今天会做什么](everyday/08-customer-support.md)
9. 产品运营：[把产品介绍里的黑话改成用户能看懂的话](everyday/09-product-writing.md)
10. 行政与团队协作：[协调撞期的会议，写清楚安排](everyday/10-office.md)

写作规则与回译功能可以分别开启或关闭。每页都保留了只加写作规则的中间稿，这样就能轻松看到每一步所发生的变化。不过，在回译过程中，姓名、时间方向和学术术语方面仍可能出现错误。这些错误会被记录在页面上，并在对应位置提供说明。

## 测试条件

<details>
<summary>模型、参数和复现方法</summary>

执行日期：2026-11-10。

这十个问题是为模拟不同使用者而编写的，论文摘要与实验数字也是虚构材料。回答来自实际的 DeepSeek API 调用，采用首次成功返回的结果，没有人工改写或挑选重抽。每个问题分别开两个新对话，左侧只发送问题，右侧增加插件实际注入的清晰表达系统规则，再用当前版本的本地模型回译。

两侧请求的模型均为 `deepseek-v4-flash`，服务返回的标识均为 `deepseek-flash`。生成参数为 `temperature=0`、`thinking.type=disabled`、`max_tokens=8192`，所有回答均以 `stop` 结束。测试未提供工具，回答中的命令和计划没有执行。

回译使用腾讯 `Hy-MT2-1.8B-Q4_K_M`，调用当前的 `plainspeak.core.rewrite`，中文译成英文后再译回中文，每段最多750字符，上下文参数为空。本次测试的是整篇 Markdown 的 core/CLI 路径；Harness 界面收集相邻段落上下文的路径未在本轮测试。

完整写作规则见[测试协议](everyday/data/protocol.json)。本地模型 SHA-256：

```text
dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699
```

### 重新运行

数据文件保留了用户问题、完整系统消息、生成参数、模型回复、英文中转、中文回译和保护检查。用自己的 DeepSeek 凭据分别发送相同消息，每次开启新对话；将启用写作规则后的回答保存为 UTF-8 Markdown，安装默认模型后运行下方命令即可重新比较。

```powershell
plainspeak rewrite skill-answer.md --language zh-CN --pivot en --output rewritten.md
```

</details>

[问题清单](everyday/data/cases.json) · [本轮调用与文件哈希](everyday/data/summary.json) · [第一批开发与研究案例](developer-cases.md) · [项目首页](../../README.md)
