"""Official SDK stdio server. Starting it makes no translation request."""

from .backend import create_backend
from .core import rewrite
from .languages import LANGUAGES, language as get_language


def build_server():
    try:
        from mcp.server.fastmcp import FastMCP
        from mcp.types import ToolAnnotations
    except ImportError:
        raise ImportError('MCP support requires: python -m pip install ".[mcp]"') from None
    server = FastMCP('PlainSpeak', instructions=(
        'PlainSpeak provides optional translation-only readability passes. Use the requested output language. '
        'Inspect retained chunk diagnostics. It does not fact-check, intercept client output, or write files.'))
    read_only = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)

    @server.tool(annotations=read_only)
    def list_languages() -> list[dict[str, str]]:
        """List configured language labels. Availability does not certify writing quality in every language."""
        return [{'code': item.code, 'name': item.name} for item in LANGUAGES.values()]

    @server.tool(annotations=read_only)
    def writing_guidance(language: str = 'en') -> dict[str, str]:
        """Return concise writing guidance in English or Chinese, adapted to the requested language."""
        resolved = get_language(language)
        chinese = resolved.code in ('zh-CN', 'zh-Hant', 'yue')
        guidance = ('先回答实际问题，用具体对象和动作解释。保留事实、数字、否定和必要的不确定性；'
            '只在影响判断处说明一次限制。删除重复免责、预告开场、空泛收尾和术语堆叠。'
            '按读者需要给出机制和例子，不把简洁变成省略解释。') if chinese else (
            'Answer the actual question first. Use concrete subjects and verbs. Preserve facts, numbers, '
            'negation and material uncertainty. State a relevant limitation once. Remove repeated caveats, '
            'staged openings and empty closers. Explain mechanisms with examples when needed. '
            'Apply this guidance in the requested language rather than copying English phrase bans.')
        return {'requested_language': resolved.code, 'guidance': guidance}

    @server.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=True))
    def rewrite_text(text: str, language: str, pivot: str | None = None,
                     protect_terms: list[str] | None = None) -> dict:
        """Round-trip complete prose through a configured translation model. Return text and diagnostics; retain original chunks on literal drift or provider failure. Not semantic verification."""
        if len(text) > 50_000:
            raise ValueError('MCP text limit is 50,000 characters; use the CLI for a longer document.')
        terms = tuple(protect_terms or [])
        if len(terms) > 100 or any(not term or len(term) > 200 for term in terms):
            raise ValueError('Use at most 100 nonempty protected terms, each at most 200 characters.')
        result = rewrite(text, create_backend(), language=language, pivot=pivot, protect_terms=terms)
        return {'text': result.text, 'report': result.report()}

    return server


def main() -> None:
    build_server().run(transport='stdio')


if __name__ == '__main__':
    main()
