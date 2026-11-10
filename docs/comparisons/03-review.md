# 审查权限缓存是否会返回过期数据

[返回场景列表](README.md) · [调用记录](data/03-review.json)

## 用户问题

请 review 下面这段服务端代码，优先指出真实影响行为的问题，再给修改建议。`load_user` 每次从数据库读取用户，角色可能在运行中被管理员修改。
```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_permissions(user_id):
    user = load_user(user_id)
    return user.permissions

def can_delete(user_id):
    return "delete" in get_permissions(user_id)
```

## 回答对比

左侧是未加写作规则的 DeepSeek 回答；右侧是在相同问题下加入清晰表达规则后生成、再经过本地回译的回答。两份回答均未人工修改。

<table>
<thead><tr><th align="left" width="50%">DeepSeek：无 skill、无回译</th><th align="left" width="50%">DeepSeek：skill + 本地回译</th></tr></thead>
<tbody><tr><td valign="top">
<h1>Code Review</h1>
<h2>真实影响行为的问题（按严重程度）</h2>
<h3>1. 权限缓存导致管理员修改无法生效（严重，安全相关）</h3>
<p><code>get_permissions</code> 被 <code>@lru_cache</code> 缓存，key 是 <code>user_id</code>。一旦某个用户被查询过，其权限列表就被永久缓存（直到进程重启或缓存被逐出）。</p>
<p>结合你给出的前提——<strong>&quot;角色可能在运行中被管理员修改&quot;</strong>——这意味着：</p>
<ul>
<li>管理员撤销了某用户的 <code>delete</code> 权限，但该用户仍能通过 <code>can_delete</code> 检查继续删除，<strong>直到进程重启或该条目被 LRU 逐出</strong>。</li>
<li>管理员授予权限同理，新权限也不会立即生效。</li>
<li>这是一个<strong>权限提升 / 权限撤销失效</strong>的安全问题，不只是&quot;数据陈旧&quot;。</li>
</ul>
<h3>2. <code>load_user</code> 每次读库，但缓存让它实际上只读一次</h3>
<p>注释说&quot;<code>load_user</code> 每次从数据库读取用户&quot;，但 <code>lru_cache</code> 让这个&quot;每次&quot;变成&quot;每个 user_id 一次&quot;。代码意图（实时读库）与实现（缓存）矛盾，容易误导后续维护者。</p>
<h3>3. 缓存的是可变对象引用</h3>
<p><code>user.permissions</code> 若是一个 list/set，缓存返回的是<strong>同一个对象引用</strong>。任何调用方若原地修改它（如 <code>perms.append(...)</code>），会污染缓存，影响所有后续调用。即使当前 <code>can_delete</code> 只做 <code>in</code> 判断，这也是隐患。</p>
<h3>4. 无失效机制 / 无 TTL</h3>
<p><code>lru_cache</code> 没有 TTL，也没有主动失效接口。管理员改权限后无法让缓存失效，只能等逐出或重启。</p>
<h3>5. 缓存 key 不含版本/时间</h3>
<p>即使将来想加失效，<code>user_id</code> 作为唯一 key 也无法区分&quot;同一用户的不同权限版本&quot;。</p>
<hr />
<h2>修改建议</h2>
<h3>方案 A：直接去掉缓存（最简单、最正确）</h3>
<p>既然 <code>load_user</code> 本来就每次读库，且权限需要实时，最直接的做法是不缓存：</p>
<pre><code class="language-python">def get_permissions(user_id):
    user = load_user(user_id)
    return frozenset(user.permissions)  # 返回不可变副本，防污染

def can_delete(user_id):
    return &quot;delete&quot; in get_permissions(user_id)
</code></pre>
<p>如果担心性能，应在 <code>load_user</code> 层做<strong>带 TTL 的缓存</strong>，而不是在权限层做永久缓存。</p>
<h3>方案 B：带 TTL 的缓存（需要容忍短暂陈旧）</h3>
<pre><code class="language-python">from cachetools import TTLCache
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
</code></pre>
<p>注意：TTL 意味着管理员改权限后最多有 <code>ttl</code> 秒的延迟窗口，需与业务/安全要求对齐。若撤销权限必须立即生效，用方案 A。</p>
<h3>方案 C：主动失效（管理员改权限时调用）</h3>
<pre><code class="language-python">def invalidate_user_permissions(user_id):
    get_permissions.cache_clear()  # lru_cache 只能全清，粒度粗
</code></pre>
<p><code>lru_cache</code> 不支持按 key 失效，只能 <code>cache_clear()</code> 全清，粒度太粗。若需要按用户失效，应改用 <code>cachetools</code> 的 <code>LRUCache</code> 并手动 <code>pop(user_id)</code>，或在权限变更事件里调用。</p>
<h3>其他建议</h3>
<ul>
<li><strong>返回不可变副本</strong>：<code>frozenset(user.permissions)</code>，避免调用方原地修改污染缓存。</li>
<li><strong>明确缓存语义</strong>：如果保留缓存，在函数 docstring 里写清&quot;权限变更最多延迟 N 秒生效&quot;，避免维护者误以为实时。</li>
<li><strong>考虑把权限判断下沉</strong>：<code>can_delete</code> 这类检查若用于安全边界，最好在数据层/网关层也做一次校验，不要只依赖应用层缓存结果。</li>
<li><strong><code>load_user</code> 返回 None 的处理</strong>：当前代码假设 <code>load_user</code> 一定返回用户，若用户被删除会 <code>AttributeError</code>。建议显式处理：</li>
</ul>
<pre><code class="language-python">def get_permissions(user_id):
    user = load_user(user_id)
    if user is None:
        return frozenset()
    return frozenset(user.permissions)
</code></pre>
<hr />
<h2>小结</h2>
<table>
<thead>
<tr>
<th>问题</th>
<th>影响</th>
<th>优先级</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>lru_cache</code> 永久缓存权限</td>
<td>管理员改权限不生效，安全风险</td>
<td>🔴 高</td>
</tr>
<tr>
<td>缓存可变对象引用</td>
<td>调用方可能污染缓存</td>
<td>🟡 中</td>
</tr>
<tr>
<td>无失效/TTL 机制</td>
<td>无法响应权限变更</td>
<td>🔴 高</td>
</tr>
<tr>
<td>未处理 <code>load_user</code> 返回 None</td>
<td>用户删除后报错</td>
<td>🟡 中</td>
</tr>
</tbody>
</table>
<p><strong>核心结论</strong>：在&quot;权限可能运行中被修改&quot;的前提下，<code>@lru_cache</code> 是错误的选择。优先去掉缓存（方案 A），或改用带 TTL/主动失效的缓存并明确延迟语义。</p>

</td><td valign="top">
<p>关于对行为影响的真实影响的问题：当<code>get_permissions</code>被<code>lru_cache</code>缓存后，同一<code>user_id</code>的权限在整个系统运行过程中不再被重新读取。如果管理员在系统运行时更改角色，那么<code>can_delete</code>的值仍会基于旧权限来确定，这可能会让被撤销权限的用户能够删除文件，或者让刚刚获得权限的用户无法执行操作。缓存键仅为<code>user_id</code>，没有机制可以使其失效。</p>
<p>改进建议：</p>
<ol>
<li>移除<code>lru_cache</code>；改为在调用<code>load_user</code>时每次获取当前权限。这是最直接且正确的方法，前提是数据库性能允许这样做。</li>
<li>如果必须使用缓存，应提供明确的失效机制：在角色发生变化时调用<code>get_permissions.cache_clear()</code>，或者根据<code>user_id</code>专门使缓存失效。需要注意的是，在多进程部署中，每个进程都有自己的缓存；仅清除单个进程的缓存是不够的。需要广播失效信息，或者使用带有版本号/TTL的共享缓存。</li>
<li>更安全的做法是为缓存设置较短的TTL时间，并允许在权限方面延迟达到整个TTL时间。这要求应用程序能够容忍这种延迟。</li>
</ol>
<p>此外，当<code>load_user</code>返回<code>None</code>时，会引发<code>AttributeError</code>；建议妥善处理用户不存在的情况。</p>

</td></tr></tbody>
</table>

## 阅读时留意

skill 删去了原版反复讨论缓存失效的文字。回译后的开头“关于对行为影响的真实影响的问题”更绕了。

## 原始记录

- [DeepSeek 原始回答](data/03-review-baseline.md)
- [只加 skill 的中间稿](data/03-review-skill.md)
- [skill + 回译的最终稿](data/03-review-final.md)
- [翻译过程和保护检查](data/03-review.json)

各页保留了只加 skill 的中间稿、英文中转和返回中文的记录。案例中的操作和计划均为生成文本，未实际执行。

[测试条件与复现方法](README.md#测试条件)
