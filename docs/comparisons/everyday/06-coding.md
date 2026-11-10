# 程序员：定位异步循环里漏掉 await 的问题

[返回场景列表](../README.md) · [完整调用记录](data/06-coding.json)

## 用户问题

这段 JavaScript 为什么有时在保存结束前就打印 done？我想等所有数据保存完再往下走，该怎么改？
```javascript
async function saveAll(items) {
  items.forEach(async (item) => {
    await save(item);
  });
  console.log('done');
}
```
`save` 返回 Promise，items 之间没有顺序依赖。

## 回答对比

左侧是 DeepSeek 提供的原始版本；右侧是另一次对话的回复。在应用该插件的语言规则后，进行了本地中文→英文→中文回译。这两种版本均代表了实际返回的完整文本。

<table>
<thead><tr><th align="left" width="50%">DeepSeek 原版</th><th align="left" width="50%">PlainSpeak：写作规则 + 本地回译</th></tr></thead>
<tbody><tr><td valign="top">
<h1>问题原因</h1>
<p><code>forEach</code> <strong>不会等待</strong>回调里的 <code>async</code> 函数。它只是同步地把每个回调调用一遍，然后立刻返回。每个回调返回的 Promise 被丢弃了，所以 <code>console.log('done')</code> 会在所有 <code>save</code> 完成之前就执行。</p>
<h1>修改方案</h1>
<p>因为 items 之间没有顺序依赖，推荐用 <code>Promise.all</code> + <code>map</code>，让所有保存<strong>并发</strong>执行：</p>
<pre><code class="language-javascript">async function saveAll(items) {
  await Promise.all(items.map(item =&gt; save(item)));
  console.log('done');
}
</code></pre>
<h1>其他可选写法</h1>
<p><strong>1. 需要限制并发数</strong>（比如避免同时打太多请求）：</p>
<pre><code class="language-javascript">async function saveAll(items, limit = 5) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () =&gt; {
    while (queue.length) {
      const item = queue.shift();
      await save(item);
    }
  });
  await Promise.all(workers);
  console.log('done');
}
</code></pre>
<p><strong>2. 需要顺序执行</strong>（虽然你说不需要，但作为对比）：</p>
<pre><code class="language-javascript">async function saveAll(items) {
  for (const item of items) {
    await save(item);
  }
  console.log('done');
}
</code></pre>
<p>注意：<code>for...of</code> 里 <code>await</code> 是有效的，因为 <code>for</code> 循环本身在 async 函数里，会正确等待；而 <code>forEach</code> 的回调是独立函数，<code>await</code> 只作用于回调内部，外层不会等。</p>
<h1>补充：错误处理</h1>
<p><code>Promise.all</code> 是&quot;快速失败&quot;——任一 <code>save</code> reject 就整体 reject。如果希望<strong>全部跑完再汇总错误</strong>，用 <code>Promise.allSettled</code>：</p>
<pre><code class="language-javascript">async function saveAll(items) {
  const results = await Promise.allSettled(items.map(item =&gt; save(item)));
  const failed = results.filter(r =&gt; r.status === 'rejected');
  if (failed.length) {
    console.error(`${failed.length} 项保存失败`, failed);
  }
  console.log('done');
}
</code></pre>
<h1>一句话总结</h1>
<p><code>forEach</code> 不感知 async；要等全部完成，用 <code>await Promise.all(items.map(...))</code>。</p>

</td><td valign="top">
<p><code>forEach</code>不会等待回调中的<code>await</code>操作完成。它只是同步执行每个回调；回调返回的Promise会被丢弃，因此<code>forEach</code>会立即结束，在数据保存完成之前就会执行<code>console.log('done')</code>。</p>
<p>各个元素之间没有顺序依赖关系；可以使用<code>Promise.all</code>来实现并发保存。</p>
<pre><code class="language-javascript">async function saveAll(items) {
  await Promise.all(items.map((item) =&gt; save(item)));
  console.log('done');
}
</code></pre>
<p><code>map</code>会同步生成一组 Promise；<code>Promise.all</code>会等待所有 Promise 都成功后才会继续操作；如果有一个 Promise 失败，它就会立即被拒绝，而 <code>done</code> 事件则不会被打印出来。</p>
<p>如果你不希望某个失败影响其他操作，并且希望在最后统一处理错误，可以使用 <code>Promise.allSettled</code>：</p>
<pre><code class="language-javascript">async function saveAll(items) {
  const results = await Promise.allSettled(items.map((item) =&gt; save(item)));
  const failed = results.filter((r) =&gt; r.status === 'rejected');
  if (failed.length) {
    throw new AggregateError(failed.map((r) =&gt; r.reason), `${failed.length} 项保存失败`);
  }
  console.log('done');
}
</code></pre>
<p>如果需要逐个保存它们，请使用 <code>for...of</code> 循环：</p>
<pre><code class="language-javascript">async function saveAll(items) {
  for (const item of items) {
    await save(item);
  }
  console.log('done');
}
</code></pre>
<p>注意不要使用 <code>forEach</code> 与 <code>await</code> 结合使用，也不要使用 <code>map</code> 与 <code>await</code> 结合使用来按顺序执行操作——这两种方式都不会按预期等待。</p>

</td></tr></tbody>
</table>

## 这组有什么变化

右侧先解释forEach为什么不等回调，再给出Promise.all写法，代码块保持原样。它仍补充了错误汇总和顺序保存，写作规则没有把回答压成只有一段代码。

<details>
<summary>查看中间稿与原始记录</summary>

- [DeepSeek 原版全文](data/06-coding-baseline.md)
- [只加写作规则，尚未回译](data/06-coding-skill.md)
- [写作规则 + 回译，最终全文](data/06-coding-final.md)
- [完整请求、回复与翻译过程](data/06-coding.json)

</details>

[本轮测试条件](../README.md#测试条件)
