`Graph` 决定预设流程，`Agent` 根据模型输出决定下一步。下面的代码示例应保持不变。

```python
def run(task):
    return task["input"]
```

不要把完整句子拆成几个片段分别翻译，否则行内代码两边的意思可能接不上。
