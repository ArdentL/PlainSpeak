import unittest

from plainspeak.core import rewrite, RewriteCancelled
from plainspeak.languages import resolve_route
from plainspeak.markdown import segment_markdown


class Translator:
    def __init__(self, outputs):
        self.outputs = iter(outputs)

    def translate(self, text, target):
        value = next(self.outputs)
        if isinstance(value, Exception):
            raise value
        return value


class CoreTests(unittest.TestCase):
    def test_same_background_reaches_both_translation_passes(self):
        calls = []
        class ContextTranslator:
            def translate(self, text, target, *, context=''):
                calls.append((text, target.code, context))
                return 'I am staying on the bus today.' if target.code == 'en' else '今天我不下车。'
        background = '她坐在公交车上。车到站后，她没有起身。'
        result = rewrite('今天不下。', ContextTranslator(), language='zh-CN', context=background)
        self.assertEqual(result.text, '今天我不下车。')
        self.assertEqual([call[2] for call in calls], [background, background])
        self.assertEqual(calls[1][0], 'I am staying on the bus today.')

    def test_context_is_bounded_before_any_model_call(self):
        for context in (None, [], 1, 'x' * 2401):
            with self.subTest(context_type=type(context).__name__), self.assertRaises(ValueError):
                rewrite('hello', Translator([]), language='en', context=context)

    def test_chunking_keeps_every_character_and_bounds_prose(self):
        source = ('这是第一句。第二句解释为什么。\n\n' * 80) + '最后一行'
        segments = segment_markdown(source, 100)
        self.assertEqual(''.join(s.text for s in segments), source)
        self.assertTrue(all(len(s.text) <= 100 for s in segments if not s.protected))

    def test_fenced_and_unclosed_code_are_never_translated(self):
        source = '解释\n\n```go\nx := 42\n```\n\n~~~python\nprint(1)\n'
        result = rewrite(source, Translator(['Explanation', '说明']), language='zh-CN')
        self.assertEqual(result.text, '说明\n\n```go\nx := 42\n```\n\n~~~python\nprint(1)\n')

    def test_frontmatter_is_preserved(self):
        source = '---\ntitle: Test\ncount: 10\n---\n正文'
        result = rewrite(source, Translator(['Body', '新正文']), language='zh-CN')
        self.assertEqual(result.text, '---\ntitle: Test\ncount: 10\n---\n新正文')

    def test_plain_numeric_changes_do_not_trigger_fallback(self):
        source = '成功率为54%，基线为48%。'
        result = rewrite(source, Translator(['54% vs 48%', '成功率为64%，基线为48%。']), language='zh-CN')
        self.assertEqual(result.text, '成功率为64%，基线为48%。')
        self.assertEqual(result.chunks[0].status, 'rewritten')
        self.assertEqual(result.chunks[0].warnings, [])

    def test_plain_scientific_notation_changes_are_allowed(self):
        for before, after in [('1e3', '1e9'), ('1E+3', '1E-3'), ('1.2e-10', '1.2e-11')]:
            with self.subTest(before=before):
                source = f'The limit is {before} tokens.'
                result = rewrite(source, Translator(['Intermediate', source.replace(before, after)]), language='en')
                self.assertEqual(result.text, source.replace(before, after))
                self.assertEqual(result.chunks[0].status, 'rewritten')

    def test_chinese_numbers_can_become_arabic_digits(self):
        source, output = '老周开27路末班车，开了十一年。', '老周开27路末班车，已经开了11年。'
        result = rewrite(source, Translator(['Intermediate', output]), language='zh-CN')
        self.assertEqual(result.text, output)
        self.assertEqual(result.report()['retained_chunks'], 0)

    def test_numbers_inside_code_and_formulas_remain_protected(self):
        for source, output, warning in [('使用 `limit=27`。', '使用 `limit=28`。', 'inline_code_changed'),
                                       ('公式 $x = 27$。', '公式 $x = 28$。', 'math_changed')]:
            with self.subTest(source=source):
                result = rewrite(source, Translator(['Intermediate', output]), language='zh-CN')
                self.assertEqual(result.text, source)
                self.assertIn(warning, result.chunks[0].warnings)

    def test_unchanged_scientific_notation_allows_prose_rewrite(self):
        source, output = 'The limit is 1E-3 tokens.', 'Use 1E-3 tokens.'
        self.assertEqual(rewrite(source, Translator(['Intermediate', output]), language='en').text, output)

    def test_cancelled_roundtrip_never_starts_remaining_provider_calls(self):
        for cancel_after in (1, 2):
            with self.subTest(cancel_after=cancel_after):
                calls = []
                class CancellingTranslator:
                    def translate(self, text, target):
                        calls.append(text)
                        return text
                with self.assertRaises(RewriteCancelled):
                    rewrite('A synthetic sentence for chunk cancellation. ' * 20,
                            CancellingTranslator(), language='en', chunk_size=80,
                            cancelled=lambda: len(calls) >= cancel_after)
                self.assertEqual(len(calls), cancel_after)

    def test_inline_code_drift_keeps_original_whole_sentence(self):
        source = '使用 `*bot`，然后调用 `Greet`。'
        result = rewrite(source, Translator(['Use `*bot` then `Greet`.', '使用 `bot`，然后调用 `Greet`。']), language='zh-CN')
        self.assertEqual(result.text, source)
        self.assertIn('inline_code_changed', result.chunks[0].warnings)

    def test_url_drift_is_not_shipped(self):
        source = '参考 https://example.org/docs。'
        result = rewrite(source, Translator(['See https://example.org/docs.', '参考 https://evil.example/docs。']), language='zh-CN')
        self.assertEqual(result.text, source)
        self.assertIn('urls_changed', result.chunks[0].warnings)

    def test_backend_failure_keeps_source_and_reports_it(self):
        result = rewrite('原文', Translator([RuntimeError('down')]), language='zh-CN')
        self.assertEqual(result.text, '原文')
        self.assertEqual(result.chunks[0].status, 'retained')
        self.assertIn('translation_failed', result.chunks[0].warnings)

    def test_math_symbol_drift_retains_source_even_when_numbers_match(self):
        for formula in ('$x + y = 1$', '$$x + y = 1$$', r'\(x + y = 1\)', r'\[x + y = 1\]'):
            with self.subTest(formula=formula):
                source = '公式为 ' + formula + '。'
                changed = source.replace('x + y', 'x - y')
                result = rewrite(source, Translator(['A formula.', changed]), language='zh-CN')
                self.assertEqual(result.text, source)
                self.assertIn('math_changed', result.chunks[0].warnings)

    def test_unchanged_formula_and_code_allow_prose_rewrite(self):
        source = r'使用 `solve(x)` 计算 $x + y = 1$，保持公式。'
        output = r'用 `solve(x)` 求解 $x + y = 1$，公式不变。'
        result = rewrite(source, Translator(['Intermediate.', output]), language='zh-CN')
        self.assertEqual(result.text, output)
        self.assertEqual(result.chunks[0].status, 'rewritten')

    def test_valid_roundtrip_preserves_layout(self):
        result = rewrite('\n  原文\n\n', Translator(['Source', '译文']), language='zh-CN')
        self.assertEqual(result.text, '\n  译文\n\n')

    def test_plain_number_occurrence_counts_are_not_checked(self):
        source = '第一组100人，第二组100人。'
        result = rewrite(source, Translator(['100 and 100', '共有100人。']), language='zh-CN')
        self.assertEqual(result.text, '共有100人。')

    def test_english_default_pivot_differs_from_source(self):
        language, pivot = resolve_route('en-US', None)
        self.assertEqual((language.code, pivot.code), ('en', 'zh-CN'))

    def test_non_english_language_and_script_aliases(self):
        self.assertEqual(resolve_route('ja', None)[1].code, 'en')
        self.assertEqual(resolve_route('zh-TW', None)[0].code, 'zh-Hant')
        with self.assertRaises(ValueError):
            resolve_route('en', 'en')

    def test_rejects_unknown_language_before_translation(self):
        with self.assertRaises(ValueError):
            rewrite('hello', Translator([]), language='unknown')


if __name__ == '__main__':
    unittest.main()
