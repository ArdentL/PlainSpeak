# 排查终端能导入 NumPy、编辑器却报错的原因

[返回场景列表](README.md) · [调用记录](data/02-environment.json)

## 用户问题

我的 Windows 终端里 `python -c "import numpy"` 正常，但 VS Code 运行同一个脚本提示 `ModuleNotFoundError: No module named 'numpy'`。项目里有 `.venv`，我也装过 Conda。你建议先查哪里？给我可执行的排查顺序。

## 回答对比

左侧是未加写作规则的 DeepSeek 回答；右侧是在相同问题下加入清晰表达规则后生成、再经过本地回译的回答。两份回答均未人工修改。

<table>
<thead><tr><th align="left" width="50%">DeepSeek：无 skill、无回译</th><th align="left" width="50%">DeepSeek：skill + 本地回译</th></tr></thead>
<tbody><tr><td valign="top">
<h1>排查顺序（从最可能到最不可能）</h1>
<p>核心问题几乎总是：<strong>VS Code 用的解释器 ≠ 你终端里 <code>python</code> 指向的解释器</strong>。按下面顺序查，基本 3 步内能定位。</p>
<h2>第 1 步：确认 VS Code 实际用的是哪个解释器</h2>
<p>在 VS Code 里打开那个脚本，然后：</p>
<ol>
<li><code>Ctrl+Shift+P</code> → 输入 <strong>Python: Select Interpreter</strong> → 看当前选中的是哪个路径。</li>
<li>或者看 VS Code 右下角状态栏显示的 Python 版本/路径。</li>
<li>更直接：在脚本顶部临时加一行运行，看它到底是谁：</li>
</ol>
<pre><code class="language-python">import sys
print(sys.executable)
print(sys.path)
</code></pre>
<p>对比一下：<strong>这个 <code>sys.executable</code> 和你终端里 <code>python -c &quot;import sys; print(sys.executable)&quot;</code> 打印的是不是同一个</strong>。大概率不是。</p>
<h2>第 2 步：确认终端里的 <code>python</code> 到底是谁</h2>
<p>在 Windows 终端里跑：</p>
<pre><code class="language-powershell">where python
python -c &quot;import sys; print(sys.executable)&quot;
python -c &quot;import numpy; print(numpy.__file__)&quot;
</code></pre>
<ul>
<li>如果 <code>where python</code> 列出多个（比如 Conda 的、Windows Store 的、<code>.venv</code> 的），说明 PATH 顺序决定了你终端里命中的是哪一个。</li>
<li>你终端能 import numpy，说明<strong>那个</strong>解释器装了 numpy。VS Code 只要指向同一个就没事。</li>
</ul>
<h2>第 3 步：检查 <code>.venv</code> 里到底有没有 numpy</h2>
<p>项目里有 <code>.venv</code> 不代表 numpy 装在它里面。用 <code>.venv</code> 的解释器直接验证：</p>
<pre><code class="language-powershell">.\.venv\Scripts\python.exe -c &quot;import numpy; print(numpy.__file__)&quot;
</code></pre>
<ul>
<li><strong>报错</strong> → <code>.venv</code> 里没装 numpy。要么激活后 <code>pip install numpy</code>，要么让 VS Code 改用你终端里那个能用的解释器。</li>
<li><strong>成功</strong> → 那问题就是 VS Code 没选 <code>.venv</code>，回到第 1 步把它选成 <code>.\.venv\Scripts\python.exe</code>。</li>
</ul>
<h2>第 4 步：Conda 与 <code>.venv</code> 的冲突</h2>
<p>你同时有 Conda 和 <code>.venv</code>，这是最常见的坑：</p>
<ul>
<li>如果 VS Code 选的是 <strong>Conda base</strong> 或某个 conda env，而 numpy 只装在 <code>.venv</code>（或反之），就会报错。</li>
<li>检查 VS Code 是否选中了 Conda 环境：<code>Ctrl+Shift+P</code> → Python: Select Interpreter，列表里会同时出现 <code>.venv</code> 和 conda 的项，<strong>别选错</strong>。</li>
<li>终端里如果先 <code>conda activate</code> 了某环境，<code>python</code> 就指向 conda 的，和 <code>.venv</code> 无关——这也解释了&quot;终端正常、VS Code 不正常&quot;。</li>
</ul>
<h2>第 5 步：确认 VS Code 的终端 vs 运行方式</h2>
<p>区分两种&quot;运行&quot;：</p>
<ul>
<li><strong>在 VS Code 集成终端里敲 <code>python script.py</code></strong>：用的是终端 PATH 里的 python，通常和外部终端一致。</li>
<li><strong>点右上角 ▶ Run / Code Runner / F5 调试</strong>：用的是 <strong>Select Interpreter 选中的那个</strong>，和终端 PATH 无关。</li>
</ul>
<p>如果你是用 ▶ 按钮跑的，问题 100% 在第 1 步。如果是集成终端里跑也报错，那多半是 VS Code 启动时继承了不同的环境变量（比如没激活 conda），检查 <code>Terminal: Integrated: Env</code> 或重启 VS Code。</p>
<h2>第 6 步：兜底验证</h2>
<p>选定解释器后，在 VS Code 集成终端里：</p>
<pre><code class="language-powershell"># 确认当前 python 就是 VS Code 选的那个
python -c &quot;import sys; print(sys.executable)&quot;
python -c &quot;import numpy&quot;
</code></pre>
<p>两者一致且能 import，问题解决。</p>
<hr />
<p><strong>一句话总结</strong>：先跑 <code>print(sys.executable)</code> 对比 VS Code 和终端，90% 的情况是解释器不一致；再用 <code>.\.venv\Scripts\python.exe -c &quot;import numpy&quot;</code> 确认 <code>.venv</code> 里到底装没装。</p>

</td><td valign="top">
<p>先查 VS Code 实际用的是哪个 Python 解释器，而不是先重装 numpy。终端里 <code>python</code> 和 VS Code 选中的解释器很可能不是同一个环境。</p>
<p>按这个顺序排查：</p>
<ol>
<li>
<p><strong>看 VS Code 选中的解释器</strong></p>
<ul>
<li>打开命令面板（Ctrl+Shift+P）→ <code>Python: Select Interpreter</code>。</li>
<li>看当前勾选的是哪个路径。如果它指向 Conda base、系统 Python 或别的 <code>.venv</code>，而 numpy 装在另一个环境里，就会报这个错。</li>
<li>选中项目里的 <code>.venv\Scripts\python.exe</code>（Windows）后重跑。</li>
</ul>
</li>
<li>
<p><strong>确认 <code>.venv</code> 里到底有没有 numpy</strong></p>
<ul>
<li>在 VS Code 终端里执行：<pre><code>.venv\Scripts\python.exe -c &quot;import sys; print(sys.executable); import numpy; print(numpy.__version__)&quot;
</code></pre>
</li>
<li>如果此处出现错误，说明 numpy 没有在 <code>.venv</code> 中安装。请进行安装：<pre><code>.venv\Scripts\python.exe -m pip install numpy
</code></pre>
</li>
<li>注意用 <code>python -m pip</code>，不要直接 <code>pip</code>，避免装到别的环境。</li>
</ul>
</li>
<li>
<p><strong>对比终端里的 <code>python</code> 是哪个</strong></p>
<ul>
<li>在报错的那个终端执行 <code>where python</code> 和 <code>python -c &quot;import sys; print(sys.executable)&quot;</code>。</li>
<li>如果它指向 Conda 环境或全局 Python，就解释了为什么终端正常、VS Code 不正常：两者不是同一个解释器。</li>
</ul>
</li>
<li>
<p><strong>检查 VS Code 终端是否激活了 <code>.venv</code></strong></p>
<ul>
<li>看终端提示符前有没有 <code>(.venv)</code>。</li>
<li>没有的话，VS Code 的“运行 Python 文件”可能仍用选中解释器，但终端里手动跑的命令会用另一个。统一到同一个解释器最省事。</li>
</ul>
</li>
<li>
<p><strong>检查工作区设置是否写死了解释器</strong></p>
<ul>
<li>看 <code>.vscode/settings.json</code> 里有没有 <code>python.defaultInterpreterPath</code> 指向旧路径（比如 Conda 的 python）。</li>
<li>有的话改成 <code>.venv</code> 的路径，或删掉让 VS Code 重新选。</li>
</ul>
</li>
<li>
<p><strong>最后才考虑环境损坏</strong></p>
<ul>
<li>如果第 2 步在 <code>.venv</code> 里能导入 numpy，但 VS Code 运行仍报错，重启 VS Code 窗口（<code>Developer: Reload Window</code>），再看运行配置里有没有指定别的 <code>pythonPath</code>。</li>
</ul>
</li>
</ol>
<p>最可能的根因是第 1 或第 3 步：VS Code 选中的解释器和终端里的 <code>python</code> 不是同一个。先确认这一点，通常不用重装任何东西。</p>

</td></tr></tbody>
</table>

## 阅读时留意

两段正文因行内代码发生变化而未通过检查，保留了回译前的 skill 原稿，其他段落照常处理。这里展示的是部分回退的结果。

## 原始记录

- [DeepSeek 原始回答](data/02-environment-baseline.md)
- [只加 skill 的中间稿](data/02-environment-skill.md)
- [skill + 回译的最终稿](data/02-environment-final.md)
- [翻译过程和保护检查](data/02-environment.json)

各页保留了只加 skill 的中间稿、英文中转和返回中文的记录。案例中的操作和计划均为生成文本，未实际执行。

[测试条件与复现方法](README.md#测试条件)
