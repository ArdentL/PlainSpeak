先查 VS Code 实际用的是哪个 Python 解释器，而不是先重装 numpy。终端里 `python` 和 VS Code 选中的解释器很可能不是同一个环境。

按这个顺序排查：

1. **看 VS Code 选中的解释器**
   - 打开命令面板（Ctrl+Shift+P）→ `Python: Select Interpreter`。
   - 看当前勾选的是哪个路径。如果它指向 Conda base、系统 Python 或别的 `.venv`，而 numpy 装在另一个环境里，就会报这个错。
   - 选中项目里的 `.venv\Scripts\python.exe`（Windows）后重跑。

2. **确认 `.venv` 里到底有没有 numpy**
   - 在 VS Code 终端里执行：
     ```
     .venv\Scripts\python.exe -c "import sys; print(sys.executable); import numpy; print(numpy.__version__)"
     ```
   - 如果此处出现错误，说明 numpy 没有在 `.venv` 中安装。请进行安装：
     ```
     .venv\Scripts\python.exe -m pip install numpy
     ```
   - 注意用 `python -m pip`，不要直接 `pip`，避免装到别的环境。

3. **对比终端里的 `python` 是哪个**
   - 在报错的那个终端执行 `where python` 和 `python -c "import sys; print(sys.executable)"`。
   - 如果它指向 Conda 环境或全局 Python，就解释了为什么终端正常、VS Code 不正常：两者不是同一个解释器。

4. **检查 VS Code 终端是否激活了 `.venv`**
   - 看终端提示符前有没有 `(.venv)`。
   - 没有的话，VS Code 的“运行 Python 文件”可能仍用选中解释器，但终端里手动跑的命令会用另一个。统一到同一个解释器最省事。

5. **检查工作区设置是否写死了解释器**
   - 看 `.vscode/settings.json` 里有没有 `python.defaultInterpreterPath` 指向旧路径（比如 Conda 的 python）。
   - 有的话改成 `.venv` 的路径，或删掉让 VS Code 重新选。

6. **最后才考虑环境损坏**
   - 如果第 2 步在 `.venv` 里能导入 numpy，但 VS Code 运行仍报错，重启 VS Code 窗口（`Developer: Reload Window`），再看运行配置里有没有指定别的 `pythonPath`。

最可能的根因是第 1 或第 3 步：VS Code 选中的解释器和终端里的 `python` 不是同一个。先确认这一点，通常不用重装任何东西。