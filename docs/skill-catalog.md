# Writing skill source catalog / 写作技能目录

Checked 2026-11-09. This is a curated inventory of 14 distinct source locations, not an exhaustive survey. Twelve repositories have pinned tree and skill reads; one gist has a page-linked revision; one repository remains partly verified. Similar Chinese humanizers are related variants, not independent evidence of effectiveness. No writing-quality benchmark was run.

已核对 14 个来源位置，按仓库或 gist 去重；其中 12 个仓库核到固定提交、文件树和技能正文。3 个文字技能随包保存，均为手动启用。其他条目只提供链接。目录中的规则用途来自原文审阅，不能当作实际改写效果排名。

| Source | Main use / language | License evidence | Delivery |
|---|---|---|---|
| [blader/humanizer](https://github.com/blader/humanizer) | AI-sounding prose; repetitive framing; verbosity / en, multilingual | MIT | vendored |
| [Kiterlin/anti-defensive-writing](https://github.com/Kiterlin/anti-defensive-writing) | defensive caveats; stacked hedges; scientific prose / en, zh-CN | MIT | vendored |
| [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | AI-sounding Chinese; translation-like prose; empty jargon / zh-CN | MIT | vendored |
| [ai-zixun/humanizer-zh](https://github.com/ai-zixun/humanizer-zh) | translation-like prose; Chinese paragraph rhythm; AI-sounding prose / zh-CN | MIT | link-only |
| [leoluyi/skills](https://github.com/leoluyi/skills) | preserving meaning; translation-like prose; AI-sounding prose / zh-TW, en | MIT | link-only |
| [ZeddYu/humanizer_zh](https://github.com/ZeddYu/humanizer_zh) | empty jargon; formulaic Chinese; technical prose / zh-CN | MIT | link-only |
| [iizcm/stop-slop-skill](https://github.com/iizcm/stop-slop-skill) | stock phrases; forced structures; AI-sounding prose / en | unlicensed-or-not-found | link-only |
| [obra/the-elements-of-style](https://github.com/obra/the-elements-of-style) | verbosity; abstract language; composition / en | Public-Domain-declared; packaging-unclear | link-only |
| [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) | verbosity; jargon; AI patterns / en | MIT | link-only |
| [mlwelles/technical-writing-density](https://github.com/mlwelles/technical-writing-density) | technical precision; needless words; information density / en | MIT | link-only |
| [AlexBybye/humanizer-CN](https://github.com/AlexBybye/humanizer-CN) | AI-sounding Chinese; conditional editing modes / zh-CN | upstream-MIT-only | link-only |
| [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | stock phrases; formulaic structures; empty prose / en | MIT | link-only |
| [goldengrape/1e271b01520bc9c60da3f35c91021d6f](https://gist.github.com/goldengrape/1e271b01520bc9c60da3f35c91021d6f) | defensive caveats; jargon; verbosity / zh-CN | not-established | link-only |
| [hogansteven449/Gpt-anti-defensive](https://github.com/hogansteven449/Gpt-anti-defensive) | defensive writing; document workflow / en, zh-CN | not-established | link-only |

## Selection and deduplication

- **blader/humanizer:** English-first structural editing; covers repetition, inflated claims, jargon and needless caveats. Vendored single SKILL.md plus exact MIT license.
- **Kiterlin/anti-defensive-writing:** English/Chinese treatment of unnecessary disclaimers with explicit protection for necessary qualifications. Its root and installable mirror count once. Vendored single SKILL.md plus exact MIT license.
- **op7418/Humanizer-zh:** Chinese editing with fact, scope, attribution, technical-token and author-voice preservation. Exact repository name is verified. Vendored single SKILL.md, its MIT license, and supplemental MIT notices for credited humanizer/stop-slop sources.
- Humanizer-family derivatives are listed separately only when there is a distinct upstream repository or content adaptation; they share a lineage label in the JSON. Fork count, stars, and claims of “AI detection” are not selection criteria.
- Strunk-based skills form another related family. They emphasize concrete language and composition; technical-writing-density is an extension requiring writing-clearly-and-concisely, rather than an independent complete skill.

## Opt-in use

Only PlainSpeak's own skills belong in the auto-discovered root skills directory. The third_party directory is a source archive; the plugin manifests do not enable it. To use a third-party skill, intentionally copy one complete vendor directory to a client-specific skill directory outside this repository after reading its SKILL.md, license and notes. Keep all license files. Select one Chinese humanizer at a time to avoid conflicting output formats. Each client's skill loading and permissions still apply.

第三方技能不会随插件自动启用。需要时先读规则和许可，再把选中的完整目录复制到自己指定的客户端技能目录。不要只复制 SKILL.md 而漏掉 LICENSE 或附带许可；也不要同时叠加多个同类中文改写规则。

Upstream text was treated as untrusted source data during collection. No upstream installer, script, hook, example command or agent workflow was executed. The selected payloads need no local reference files, extra Python packages or network calls. Their external source links are background citations, retained as links. No Wikipedia page or full book was copied.

## Per-source evidence and limits

### blader/humanizer

- Revision: `0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0`; verification: pinned-tree-and-skill-read.
- Self-contained text; external Wikipedia link is background, not a required local file.
- [Pinned skill source](https://github.com/blader/humanizer/blob/0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0/SKILL.md); [license 1](https://github.com/blader/humanizer/blob/0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0/LICENSE).

### Kiterlin/anti-defensive-writing

- Revision: `f516147d017a3fe43ae99192cb89d8261b0c8679`; verification: pinned-tree-and-skill-read.
- Single-file skill; root and installable mirror share a repository. No installer or example assets needed.
- [Pinned skill source](https://github.com/Kiterlin/anti-defensive-writing/blob/f516147d017a3fe43ae99192cb89d8261b0c8679/SKILL.md); [license 1](https://github.com/Kiterlin/anti-defensive-writing/blob/f516147d017a3fe43ae99192cb89d8261b0c8679/LICENSE).

### op7418/Humanizer-zh

- Revision: `f4518a8eab97b8bfebc66a89d34320a89bef6930`; verification: pinned-tree-and-skill-read.
- Single-file skill; external source links retained. Includes supplemental MIT notices for credited humanizer and stop-slop upstreams.
- [Pinned skill source](https://github.com/op7418/Humanizer-zh/blob/f4518a8eab97b8bfebc66a89d34320a89bef6930/SKILL.md); [license 1](https://github.com/op7418/Humanizer-zh/blob/f4518a8eab97b8bfebc66a89d34320a89bef6930/LICENSE).

### ai-zixun/humanizer-zh

- Revision: `f75f1ac9735c4f10da1bba0148e0ea7228c5c3b3`; verification: pinned-tree-and-skill-read.
- Requires references/patterns.md, corpus files, and optional author-voice references; not bundled.
- [Pinned skill source](https://github.com/ai-zixun/humanizer-zh/blob/f75f1ac9735c4f10da1bba0148e0ea7228c5c3b3/SKILL.md); [license 1](https://github.com/ai-zixun/humanizer-zh/blob/f75f1ac9735c4f10da1bba0148e0ea7228c5c3b3/LICENSE).

### leoluyi/skills

- Revision: `8a85670f155490a413014065066ff46f3f37e103`; verification: pinned-tree-and-skill-read.
- Requires several workflow/routing/reference files; NOTICE describes multiple derivative sources. Full chain not vendored.
- [Pinned skill source](https://github.com/leoluyi/skills/blob/8a85670f155490a413014065066ff46f3f37e103/skills/humanizer-zh/SKILL.md); [license 1](https://github.com/leoluyi/skills/blob/8a85670f155490a413014065066ff46f3f37e103/LICENSE).

### ZeddYu/humanizer_zh

- Revision: `c743bc12f72fdf3a392035df139671bb539fc77a`; verification: pinned-tree-and-skill-read.
- GitHub identifies a fork of blader/humanizer. README links examples/zh-before-after.md and NOTICE.md absent from pinned tree; not bundled.
- [Pinned skill source](https://github.com/ZeddYu/humanizer_zh/blob/c743bc12f72fdf3a392035df139671bb539fc77a/SKILL.md); [license 1](https://github.com/ZeddYu/humanizer_zh/blob/c743bc12f72fdf3a392035df139671bb539fc77a/LICENSE).

### iizcm/stop-slop-skill

- Revision: `32e767117e20f9aceff05a2fde427b48d67d1825`; verification: pinned-tree-and-skill-read.
- No license file or GitHub license metadata found in pinned tree; do not redistribute.
- [Pinned skill source](https://github.com/iizcm/stop-slop-skill/blob/32e767117e20f9aceff05a2fde427b48d67d1825/SKILL.md).

### obra/the-elements-of-style

- Revision: `05fc4f0d2b97b7c042dd9949ad658568e4a1324e`; verification: pinned-tree-and-skill-read.
- Corrects seed obra/elements-of-style (404). README/package declare Public Domain for 1918 text; packaging has no standalone license. Requires elements-of-style.md.
- [Pinned skill source](https://github.com/obra/the-elements-of-style/blob/05fc4f0d2b97b7c042dd9949ad658568e4a1324e/skills/writing-clearly-and-concisely/SKILL.md).

### softaworks/agent-toolkit

- Revision: `3027f20f3181758385a1bb8c022d4041dfb4de84`; verification: pinned-tree-and-skill-read.
- Repository MIT verified. Requires five Strunk reference files and signs-of-ai-writing.md; reference-specific rights and content not fully audited.
- [Pinned skill source](https://github.com/softaworks/agent-toolkit/blob/3027f20f3181758385a1bb8c022d4041dfb4de84/skills/writing-clearly-and-concisely/SKILL.md); [license 1](https://github.com/softaworks/agent-toolkit/blob/3027f20f3181758385a1bb8c022d4041dfb4de84/LICENSE).

### mlwelles/technical-writing-density

- Revision: `55d9dc6ddb969eb24d4a8d99a64a4b423f18c72c`; verification: pinned-tree-and-skill-read.
- Repository MIT verified. Explicitly requires writing-clearly-and-concisely; dependency not bundled, so this extension is link-only.
- [Pinned skill source](https://github.com/mlwelles/technical-writing-density/blob/55d9dc6ddb969eb24d4a8d99a64a4b423f18c72c/skills/technical-writing-density/SKILL.md); [license 1](https://github.com/mlwelles/technical-writing-density/blob/55d9dc6ddb969eb24d4a8d99a64a4b423f18c72c/LICENSE).

### AlexBybye/humanizer-CN

- Revision: `b597875bbf4d7a424e4a837c45b094bc9cfb4d8e`; verification: pinned-tree-and-skill-read.
- UPSTREAM-LICENSE.txt preserves blader MIT; license for downstream additions not separately established. Requires references/conditional-modes.md.
- [Pinned skill source](https://github.com/AlexBybye/humanizer-CN/blob/b597875bbf4d7a424e4a837c45b094bc9cfb4d8e/SKILL.md); [license 1](https://github.com/AlexBybye/humanizer-CN/blob/b597875bbf4d7a424e4a837c45b094bc9cfb4d8e/UPSTREAM-LICENSE.txt).

### hardikpandya/stop-slop

- Revision: `8da1f030185bdfe8471220585162991eaeb970e9`; verification: pinned-tree-and-skill-read.
- MIT verified; skill has reference resources. Supplemental license only bundled as provenance for op7418, not this skill.
- [Pinned skill source](https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/SKILL.md); [license 1](https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/LICENSE).

### goldengrape/1e271b01520bc9c60da3f35c91021d6f

- Revision: `78eb9ebc7df2c97bbc5590161288f9a5f47f614a`; verification: public-gist-page-and-raw-link-revision.
- System prompt, not a packaged SKILL.md. Gist page read; revision extracted from its raw link. API endpoint unsupported by connector; direct API rate-limited. No license established; no text copied.

### hogansteven449/Gpt-anti-defensive

- Revision: unresolved; verification: README-page-only; unresolved-api-redirect.
- Public README describes Codex-authenticated multi-agent harness, not a single portable prompt. Commit and license unresolved: connector returned moved API endpoint, alternative connector authentication failed, direct public API rate-limited. Do not vendor or execute.

## Reproducibility

The machine-readable catalog records commit, skill path, language, problem tags, lineage, delivery choice, license evidence and upstream Git blob SHA for every bundled file. Git blob hashes can be recomputed from UTF-8 bytes with the standard Git blob header. THIRD_PARTY_NOTICES.md lists the bundled texts and attribution. The catalog intentionally records unresolved fields as null or “not established”; it does not silently replace them with a license guess.

Known collection limits: the gist/API path was unsupported by the connected repository reader; the alternative public API was rate-limited. The hogansteven449 repository's commit/license remain unresolved. The old obra/elements-of-style seed returns 404; the verified repository is obra/the-elements-of-style. License chains and reference completeness of link-only sources are not certified by inclusion in this list.
