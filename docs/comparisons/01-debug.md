# 修 Bug：找出可变默认参数的问题

[返回十场景总览](README.md) · [完整调用与回译证据](data/01-debug.json)

## 同一个问题

帮我看这段 Python 为什么第二次调用会带上上一次的数据，并给出修改后的代码和原因：
```python
def add_item(item, items=[]):
    items.append(item)
    return items

print(add_item("a"))
print(add_item("b"))
```

## 左右对照：完整输出

左：DeepSeek 原始输出，不加 PlainSpeak 系统规则，不做回译。右：另一次相同问题的 DeepSeek 调用，加入项目实际注入的清晰表达规则，再运行当前 core/CLI 回译。两边均为第一次成功响应，未人工改写。

| 原版字符数 | skill 原稿字符数 | skill + 回译字符数 | 回译保留原文块数 |
| ---: | ---: | ---: | ---: |
| 810 | 671 | 705 | 0 |

<table>
<thead><tr><th align="left" width="50%">DeepSeek：无 skill、无回译</th><th align="left" width="50%">DeepSeek：skill + 本地回译</th></tr></thead>
<tbody><tr><td valign="top">
<h2>问题原因</h2>
<p>这是 Python 中非常经典的<strong>可变默认参数陷阱</strong>。</p>
<p>在 Python 中，函数的默认参数值<strong>只在函数定义时求值一次</strong>，而不是每次调用时重新创建。所以 <code>items=[]</code> 这个空列表在函数定义时就被创建了，之后所有调用都共享<strong>同一个列表对象</strong>。</p>
<p>执行过程：</p>
<ol>
<li>定义 <code>add_item</code> 时，创建了一个空列表 <code>[]</code>，绑定到 <code>items</code> 的默认值上</li>
<li>第一次调用 <code>add_item(&quot;a&quot;)</code>：往这个列表里 append <code>&quot;a&quot;</code> → <code>[&quot;a&quot;]</code></li>
<li>第二次调用 <code>add_item(&quot;b&quot;)</code>：<strong>还是同一个列表</strong>，append <code>&quot;b&quot;</code> → <code>[&quot;a&quot;, &quot;b&quot;]</code></li>
</ol>
<p>所以输出是：</p>
<pre><code>['a']
['a', 'b']
</code></pre>
<h2>修改后的代码</h2>
<pre><code class="language-python">def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items

print(add_item(&quot;a&quot;))  # ['a']
print(add_item(&quot;b&quot;))  # ['b']
</code></pre>
<h2>修改原因</h2>
<ul>
<li>用 <code>None</code> 作为默认值（<code>None</code> 是不可变对象，不存在共享问题）</li>
<li>在函数体内部判断：如果调用者没传 <code>items</code>，才新建一个空列表</li>
<li>这样每次调用都会得到<strong>独立的列表</strong>，不会互相污染</li>
</ul>
<h2>补充说明</h2>
<ul>
<li>如果确实想利用&quot;共享&quot;特性（比如做缓存/累加器），可以保留原写法，但一定要清楚这是有意为之，并加注释说明</li>
<li>同样的坑也适用于 <code>{}</code>、<code>set()</code> 等可变默认参数</li>
<li>判断时用 <code>is None</code> 而不是 <code>== None</code>，这是 Python 的惯用写法</li>
</ul>

</td><td valign="top">
<p><strong>结论：</strong> 第二次调用会包含上一次调用的数据，因为默认参数 <code>items=[]</code> 在函数定义时只创建一次，而在每次后续调用中都会重复使用同一个列表对象。</p>
<p><strong>原因：</strong> 在定义函数时，Python 会评估默认参数，并将结果存储在函数对象中。<code>items=[]</code> 中的空列表只创建一次；<code>add_item(&quot;a&quot;)</code> 会将 <code>&quot;a&quot;</code> 添加到该列表中。在第二次调用时，<code>items</code> 仍然指向同一个列表，因此添加 <code>&quot;b&quot;</code> 后结果为 <code>['a', 'b']</code>。</p>
<p><strong>修改后的代码：</strong></p>
<pre><code class="language-python">def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items

print(add_item(&quot;a&quot;))  # ['a']
print(add_item(&quot;b&quot;))  # ['b']
</code></pre>
<p>**为何进行此更改：**将 <code>None</code> 作为默认值意味着，在每次调用时如果没有提供 <code>items</code>，则会在函数内部创建一个空列表。这两次调用不会相互影响。使用 <code>is None</code> 而不是 <code>== None</code> 来检查条件，以避免与空列表的相等性比较产生混淆。</p>
<p>如果需要在多次调用中使用同一个列表，则应该显式传递该列表。</p>
<pre><code class="language-python">shared = []
print(add_item(&quot;a&quot;, shared))  # ['a']
print(add_item(&quot;b&quot;, shared))  # ['a', 'b']
</code></pre>

</td></tr></tbody>
</table>

## 观察

代码块逐字保留。回译增加了“为何进行此更改”等较正式的说法；从 skill 原稿 671 字符变为 705 字符，不能把整体缩短都归功于回译。

字符数含空白、Markdown 和代码，按 Unicode 字符统计，只反映篇幅；不代表可读性或正确性评分。

## 核对中间阶段

- [DeepSeek 原始输出，未编辑](data/01-debug-baseline.md)
- [只加 skill，尚未回译](data/01-debug-skill.md)
- [skill + 回译，完整最终输出](data/01-debug-final.md)
- [实际两阶段翻译输入、英文中转、返回中文、保护报告和调用用量](data/01-debug.json)

共同设置、完整写作指令与执行边界见[总览的测试条件](README.md#测试条件)。源回答内容是生成的演示文本，不是已经执行的操作或审定的技术指导。
