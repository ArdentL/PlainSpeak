`forEach` 不会等待回调里的 `await`。它只是同步地把每个回调调用一遍，回调返回的 Promise 被丢掉，所以 `forEach` 立刻结束，`console.log('done')` 在保存完成前就执行了。

items 之间没有顺序依赖，用 `Promise.all` 并发保存即可：

```javascript
async function saveAll(items) {
  await Promise.all(items.map((item) => save(item)));
  console.log('done');
}
```

`map` 同步生成一组 Promise，`Promise.all` 等它们全部成功后才继续；任意一个失败会立即 reject，`done` 不会打印。

如果希望某个失败不影响其他保存，并且最后统一处理错误，可以用 `Promise.allSettled`：

```javascript
async function saveAll(items) {
  const results = await Promise.allSettled(items.map((item) => save(item)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    throw new AggregateError(failed.map((r) => r.reason), `${failed.length} 项保存失败`);
  }
  console.log('done');
}
```

如果确实需要逐个顺序保存，用 `for...of`：

```javascript
async function saveAll(items) {
  for (const item of items) {
    await save(item);
  }
  console.log('done');
}
```

注意不要用 `forEach` 配 `await`，也不要用 `map` 配 `await` 来试图串行——后者同样不会按预期等待。