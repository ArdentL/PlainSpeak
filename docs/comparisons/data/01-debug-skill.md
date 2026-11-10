**结论：** 第二次调用会带上上一次的数据，因为默认参数 `items=[]` 只在函数定义时创建一次，之后每次调用都复用同一个列表对象。

**原因：** Python 在定义函数时就会求值默认参数，并把结果保存在函数对象上。`items=[]` 里的空列表只创建一次，`add_item("a")` 往这个列表里追加了 `"a"`，第二次调用时 `items` 仍指向同一个列表，所以再追加 `"b"` 就得到 `['a', 'b']`。

**修改后的代码：**

```python
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items

print(add_item("a"))  # ['a']
print(add_item("b"))  # ['b']
```

**为什么这样改：** 用 `None` 作为默认值，函数每次调用时如果没传 `items`，就在函数体内新建一个空列表，两次调用互不影响。判断用 `is None` 而不是 `== None`，避免和空列表等值比较混淆。

如果确实需要多次调用共享同一个列表，就显式传入：

```python
shared = []
print(add_item("a", shared))  # ['a']
print(add_item("b", shared))  # ['a', 'b']
```