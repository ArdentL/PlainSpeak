`forEach`不会等待回调中的`await`操作完成。它只是同步执行每个回调；回调返回的Promise会被丢弃，因此`forEach`会立即结束，在数据保存完成之前就会执行`console.log('done')`。

各个元素之间没有顺序依赖关系；可以使用`Promise.all`来实现并发保存。

```javascript
async function saveAll(items) {
  await Promise.all(items.map((item) => save(item)));
  console.log('done');
}
```

`map`会同步生成一组 Promise；`Promise.all`会等待所有 Promise 都成功后才会继续操作；如果有一个 Promise 失败，它就会立即被拒绝，而 `done` 事件则不会被打印出来。

如果你不希望某个失败影响其他操作，并且希望在最后统一处理错误，可以使用 `Promise.allSettled`：

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

如果需要逐个保存它们，请使用 `for...of` 循环：

```javascript
async function saveAll(items) {
  for (const item of items) {
    await save(item);
  }
  console.log('done');
}
```

注意不要使用 `forEach` 与 `await` 结合使用，也不要使用 `map` 与 `await` 结合使用来按顺序执行操作——这两种方式都不会按预期等待。