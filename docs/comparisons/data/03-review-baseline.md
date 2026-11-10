# Code Review

## 真实影响行为的问题（按严重程度）

### 1. 权限缓存导致管理员修改无法生效（严重，安全相关）

`get_permissions` 被 `@lru_cache` 缓存，key 是 `user_id`。一旦某个用户被查询过，其权限列表就被永久缓存（直到进程重启或缓存被逐出）。

结合你给出的前提——**"角色可能在运行中被管理员修改"**——这意味着：

- 管理员撤销了某用户的 `delete` 权限，但该用户仍能通过 `can_delete` 检查继续删除，**直到进程重启或该条目被 LRU 逐出**。
- 管理员授予权限同理，新权限也不会立即生效。
- 这是一个**权限提升 / 权限撤销失效**的安全问题，不只是"数据陈旧"。

### 2. `load_user` 每次读库，但缓存让它实际上只读一次

注释说"`load_user` 每次从数据库读取用户"，但 `lru_cache` 让这个"每次"变成"每个 user_id 一次"。代码意图（实时读库）与实现（缓存）矛盾，容易误导后续维护者。

### 3. 缓存的是可变对象引用

`user.permissions` 若是一个 list/set，缓存返回的是**同一个对象引用**。任何调用方若原地修改它（如 `perms.append(...)`），会污染缓存，影响所有后续调用。即使当前 `can_delete` 只做 `in` 判断，这也是隐患。

### 4. 无失效机制 / 无 TTL

`lru_cache` 没有 TTL，也没有主动失效接口。管理员改权限后无法让缓存失效，只能等逐出或重启。

### 5. 缓存 key 不含版本/时间

即使将来想加失效，`user_id` 作为唯一 key 也无法区分"同一用户的不同权限版本"。

---

## 修改建议

### 方案 A：直接去掉缓存（最简单、最正确）

既然 `load_user` 本来就每次读库，且权限需要实时，最直接的做法是不缓存：

```python
def get_permissions(user_id):
    user = load_user(user_id)
    return frozenset(user.permissions)  # 返回不可变副本，防污染

def can_delete(user_id):
    return "delete" in get_permissions(user_id)
```

如果担心性能，应在 `load_user` 层做**带 TTL 的缓存**，而不是在权限层做永久缓存。

### 方案 B：带 TTL 的缓存（需要容忍短暂陈旧）

```python
from cachetools import TTLCache
import threading

_perm_cache = TTLCache(maxsize=1000, ttl=30)  # 30 秒
_lock = threading.Lock()

def get_permissions(user_id):
    with _lock:
        perms = _perm_cache.get(user_id)
    if perms is None:
        user = load_user(user_id)
        perms = frozenset(user.permissions)
        with _lock:
            _perm_cache[user_id] = perms
    return perms
```

注意：TTL 意味着管理员改权限后最多有 `ttl` 秒的延迟窗口，需与业务/安全要求对齐。若撤销权限必须立即生效，用方案 A。

### 方案 C：主动失效（管理员改权限时调用）

```python
def invalidate_user_permissions(user_id):
    get_permissions.cache_clear()  # lru_cache 只能全清，粒度粗
```

`lru_cache` 不支持按 key 失效，只能 `cache_clear()` 全清，粒度太粗。若需要按用户失效，应改用 `cachetools` 的 `LRUCache` 并手动 `pop(user_id)`，或在权限变更事件里调用。

### 其他建议

- **返回不可变副本**：`frozenset(user.permissions)`，避免调用方原地修改污染缓存。
- **明确缓存语义**：如果保留缓存，在函数 docstring 里写清"权限变更最多延迟 N 秒生效"，避免维护者误以为实时。
- **考虑把权限判断下沉**：`can_delete` 这类检查若用于安全边界，最好在数据层/网关层也做一次校验，不要只依赖应用层缓存结果。
- **`load_user` 返回 None 的处理**：当前代码假设 `load_user` 一定返回用户，若用户被删除会 `AttributeError`。建议显式处理：

```python
def get_permissions(user_id):
    user = load_user(user_id)
    if user is None:
        return frozenset()
    return frozenset(user.permissions)
```

---

## 小结

| 问题 | 影响 | 优先级 |
|---|---|---|
| `lru_cache` 永久缓存权限 | 管理员改权限不生效，安全风险 | 🔴 高 |
| 缓存可变对象引用 | 调用方可能污染缓存 | 🟡 中 |
| 无失效/TTL 机制 | 无法响应权限变更 | 🔴 高 |
| 未处理 `load_user` 返回 None | 用户删除后报错 | 🟡 中 |

**核心结论**：在"权限可能运行中被修改"的前提下，`@lru_cache` 是错误的选择。优先去掉缓存（方案 A），或改用带 TTL/主动失效的缓存并明确延迟语义。