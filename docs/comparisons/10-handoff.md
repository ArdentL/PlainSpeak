# 整理卡顿排查记录，交给下一个 Agent

[返回场景列表](README.md) · [调用记录](data/10-handoff.json)

## 用户问题

请把这份虚构排查记录整理成给下一个 Agent 的交接说明：用户说应用偶发变卡，重启能恢复；今天只做了只读检查，没有改驱动或网络设置；卡顿时CPU约18%，内存占用22GB/32GB，GPU利用率5%；还没采集卡顿期间的进程级记录，所以没定位原因；日志保存在项目的 `logs/slow-session.log`；下一步希望复现一次并对齐时间戳。交接里写清做过什么、没确定什么、接下来做什么。

## 回答对比

左侧是未加写作规则的 DeepSeek 回答；右侧是在相同问题下加入清晰表达规则后生成、再经过本地回译的回答。两份回答均未人工修改。

<table>
<thead><tr><th align="left" width="50%">DeepSeek：无 skill、无回译</th><th align="left" width="50%">DeepSeek：skill + 本地回译</th></tr></thead>
<tbody><tr><td valign="top">
<h1>交接说明：应用偶发卡顿排查</h1>
<h2>一、背景与现象</h2>
<ul>
<li>用户反馈：应用<strong>偶发变卡</strong>，<strong>重启后可恢复</strong>。</li>
<li>本次会话仅做了<strong>只读检查</strong>，未修改驱动、未调整网络设置。</li>
</ul>
<h2>二、已做过的检查与观测数据</h2>
<ul>
<li>卡顿发生时资源概况：
<ul>
<li>CPU 约 <strong>18%</strong></li>
<li>内存占用 <strong>22GB / 32GB</strong></li>
<li>GPU 利用率约 <strong>5%</strong></li>
</ul>
</li>
<li>已保存日志：<code>logs/slow-session.log</code>（项目内路径）。</li>
</ul>
<h2>三、尚未确定 / 未做的事</h2>
<ul>
<li><strong>未采集卡顿期间的进程级记录</strong>（如各进程 CPU/内存/IO、线程栈等），因此<strong>卡顿根因尚未定位</strong>。</li>
<li>现有数据（CPU 18%、GPU 5%、内存 22/32GB）不足以指向具体瓶颈，不能据此下结论。</li>
<li>未验证驱动、网络配置是否相关（本次未改动，也未做对比测试）。</li>
</ul>
<h2>四、下一步建议</h2>
<ol>
<li><strong>复现一次卡顿</strong>，并在复现期间采集<strong>进程级记录</strong>（进程/线程级 CPU、内存、IO、必要时抓栈）。</li>
<li><strong>对齐时间戳</strong>：将进程级采集记录与 <code>logs/slow-session.log</code> 的时间轴对齐，确认卡顿窗口内哪些进程/操作异常。</li>
<li>基于对齐结果再判断是否与驱动、网络或其他因素相关，避免在无证据前改动配置。</li>
</ol>
<h2>五、注意事项</h2>
<ul>
<li>保持只读排查原则，未定位前<strong>不要随意改驱动或网络设置</strong>。</li>
<li>复现时请记录卡顿起止时间点，便于与日志时间戳比对。</li>
</ul>

</td><td valign="top">
<p><strong>切换说明</strong></p>
<p>今天仅进行了只读检查，没有修改任何驱动或网络设置。用户报告称应用程序偶尔出现延迟现象，通过重启设备即可解决该问题。</p>
<p>已确认的问题：在延迟期间，CPU使用率约为18%，内存使用量为22GB/32GB，GPU使用率为5%。这些数据表明，在延迟期间，CPU和GPU均没有处于忙碌状态，但内存几乎被使用了70%，因此无法排除内存压力或进程相关问题的可能性。</p>
<p>未解决的问题：延迟的原因尚未确定。在延迟期间没有收集到任何进程层面的数据，因此无法判断是哪种进程或资源导致了问题。</p>
<p>日志位置：<code>logs/slow-session.log</code>。</p>
<p>下一步：再次重现延迟现象，将进程层面的数据与日志时间戳进行比对，然后分析结果。</p>

</td></tr></tbody>
</table>

## 阅读时留意

回译把“交接说明”改成了“切换说明”，把“重启能恢复”改成了“重启设备”，擅自确定了重启的对象。只读检查和未定位根因的主要信息仍在。

## 原始记录

- [DeepSeek 原始回答](data/10-handoff-baseline.md)
- [只加 skill 的中间稿](data/10-handoff-skill.md)
- [skill + 回译的最终稿](data/10-handoff-final.md)
- [翻译过程和保护检查](data/10-handoff.json)

各页保留了只加 skill 的中间稿、英文中转和返回中文的记录。案例中的操作和计划均为生成文本，未实际执行。

[测试条件与复现方法](README.md#测试条件)
