# 问题原因

`forEach` **不会等待**回调里的 `async` 函数。它只是同步地把每个回调调用一遍，然后立刻返回。每个回调返回的 Promise 被丢弃了，所以 `console.log('done')` 会在所有 `save` 完成之前就执行。

# 修改方案

因为 items 之间没有顺序依赖，推荐用 `Promise.all` + `map`，让所有保存**并发**执行：

```javascript
async function saveAll(items) {
  await Promise.all(items.map(item => save(item)));
  console.log('done');
}
```

# 其他可选写法

**1. 需要限制并发数**（比如避免同时打太多请求）：

```javascript
async function saveAll(items, limit = 5) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await save(item);
    }
  });
  await Promise.all(workers);
  console.log('done');
}
```

**2. 需要顺序执行**（虽然你说不需要，但作为对比）：

```javascript
async function saveAll(items) {
  for (const item of items) {
    await save(item);
  }
  console.log('done');
}
```

注意：`for...of` 里 `await` 是有效的，因为 `for` 循环本身在 async 函数里，会正确等待；而 `forEach` 的回调是独立函数，`await` 只作用于回调内部，外层不会等。

# 补充：错误处理

`Promise.all` 是"快速失败"——任一 `save` reject 就整体 reject。如果希望**全部跑完再汇总错误**，用 `Promise.allSettled`：

```javascript
async function saveAll(items) {
  const results = await Promise.allSettled(items.map(item => save(item)));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    console.error(`${failed.length} 项保存失败`, failed);
  }
  console.log('done');
}
```

# 一句话总结

`forEach` 不感知 async；要等全部完成，用 `await Promise.all(items.map(...))`。