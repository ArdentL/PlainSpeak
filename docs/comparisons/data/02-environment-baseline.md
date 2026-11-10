# 排查顺序（从最可能到最不可能）

核心问题几乎总是：**VS Code 用的解释器 ≠ 你终端里 `python` 指向的解释器**。按下面顺序查，基本 3 步内能定位。

## 第 1 步：确认 VS Code 实际用的是哪个解释器

在 VS Code 里打开那个脚本，然后：

1. `Ctrl+Shift+P` → 输入 **Python: Select Interpreter** → 看当前选中的是哪个路径。
2. 或者看 VS Code 右下角状态栏显示的 Python 版本/路径。
3. 更直接：在脚本顶部临时加一行运行，看它到底是谁：

```python
import sys
print(sys.executable)
print(sys.path)
```

对比一下：**这个 `sys.executable` 和你终端里 `python -c "import sys; print(sys.executable)"` 打印的是不是同一个**。大概率不是。

## 第 2 步：确认终端里的 `python` 到底是谁

在 Windows 终端里跑：

```powershell
where python
python -c "import sys; print(sys.executable)"
python -c "import numpy; print(numpy.__file__)"
```

- 如果 `where python` 列出多个（比如 Conda 的、Windows Store 的、`.venv` 的），说明 PATH 顺序决定了你终端里命中的是哪一个。
- 你终端能 import numpy，说明**那个**解释器装了 numpy。VS Code 只要指向同一个就没事。

## 第 3 步：检查 `.venv` 里到底有没有 numpy

项目里有 `.venv` 不代表 numpy 装在它里面。用 `.venv` 的解释器直接验证：

```powershell
.\.venv\Scripts\python.exe -c "import numpy; print(numpy.__file__)"
```

- **报错** → `.venv` 里没装 numpy。要么激活后 `pip install numpy`，要么让 VS Code 改用你终端里那个能用的解释器。
- **成功** → 那问题就是 VS Code 没选 `.venv`，回到第 1 步把它选成 `.\.venv\Scripts\python.exe`。

## 第 4 步：Conda 与 `.venv` 的冲突

你同时有 Conda 和 `.venv`，这是最常见的坑：

- 如果 VS Code 选的是 **Conda base** 或某个 conda env，而 numpy 只装在 `.venv`（或反之），就会报错。
- 检查 VS Code 是否选中了 Conda 环境：`Ctrl+Shift+P` → Python: Select Interpreter，列表里会同时出现 `.venv` 和 conda 的项，**别选错**。
- 终端里如果先 `conda activate` 了某环境，`python` 就指向 conda 的，和 `.venv` 无关——这也解释了"终端正常、VS Code 不正常"。

## 第 5 步：确认 VS Code 的终端 vs 运行方式

区分两种"运行"：

- **在 VS Code 集成终端里敲 `python script.py`**：用的是终端 PATH 里的 python，通常和外部终端一致。
- **点右上角 ▶ Run / Code Runner / F5 调试**：用的是 **Select Interpreter 选中的那个**，和终端 PATH 无关。

如果你是用 ▶ 按钮跑的，问题 100% 在第 1 步。如果是集成终端里跑也报错，那多半是 VS Code 启动时继承了不同的环境变量（比如没激活 conda），检查 `Terminal: Integrated: Env` 或重启 VS Code。

## 第 6 步：兜底验证

选定解释器后，在 VS Code 集成终端里：

```powershell
# 确认当前 python 就是 VS Code 选的那个
python -c "import sys; print(sys.executable)"
python -c "import numpy"
```

两者一致且能 import，问题解决。

---

**一句话总结**：先跑 `print(sys.executable)` 对比 VS Code 和终端，90% 的情况是解释器不一致；再用 `.\.venv\Scripts\python.exe -c "import numpy"` 确认 `.venv` 里到底装没装。