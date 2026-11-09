import unittest

from plainspeak.core import rewrite
from plainspeak.markdown import segment_markdown


class Mutator:
    def translate(self, text, target):
        return text.replace('SecretToken', 'AlteredToken')


class MarkdownRegressions(unittest.TestCase):
    def assert_literal_whole(self, source, literal, limit=32):
        segments = segment_markdown(source, limit)
        self.assertEqual(''.join(s.text for s in segments), source)
        self.assertTrue(any(literal in s.text for s in segments))
        self.assertTrue(all(s.protected or len(s.text) <= limit for s in segments))

    def test_inline_span_is_not_split_at_whitespace(self):
        literal = '`one SecretToken two`'
        self.assert_literal_whole('Introductory words before ' + literal + ' after.', literal)

    def test_url_and_number_are_not_split_at_chunk_boundary(self):
        for literal in ['https://example.org/a', '-1234567890.123456e+20']:
            with self.subTest(literal=literal):
                self.assert_literal_whole('x' * 25 + literal + ' after.', literal)

    def test_default_bound_keeps_literal_intact(self):
        literal = '`one SecretToken two`'
        self.assert_literal_whole('x' * 740 + literal + ' afterwards.', literal, 750)

    def test_math_literals_remain_whole_across_chunk_boundaries(self):
        for literal in ('$x + y = 1$', r'\(x + y = 1\)', r'\[x + y = 1\]'):
            self.assert_literal_whole('Introductory prose before ' + literal + ' afterwards.', literal)
        literal = '$$' + 'SecretToken + ' * 20 + 'x$$'
        source = 'Before.\nFormula ' + literal + ' after.\nEnd.'
        self.assertTrue(any(s.protected and literal in s.text for s in segment_markdown(source, 32)))

    def test_shorter_or_wrong_container_fence_does_not_close_block(self):
        source = 'Before.\n> ````python\n> ```\n```\nSecretToken\n'
        result = rewrite(source, Mutator(), language='en')
        self.assertEqual(result.text, source)
        self.assertTrue(segment_markdown(source)[-1].protected)

    def test_oversized_literals_protect_entire_line(self):
        for literal in ['`' + 'x' * 20 + ' SecretToken ' + 'y' * 30 + '`',
                        'https://example.org/' + 'x' * 60,
                        '1234567890' * 8]:
            source = 'First prose.\r\nUse ' + literal + ' now.\r\nLast prose.'
            segments = segment_markdown(source, 32)
            self.assertEqual(''.join(s.text for s in segments), source)
            self.assertTrue(any(s.protected and 'Use ' + literal + ' now.\r\n' in s.text for s in segments))

    def test_oversized_inline_span_cannot_be_silently_mutated(self):
        source = 'Run `' + 'x' * 20 + ' SecretToken ' + 'y' * 30 + '` now.'
        result = rewrite(source, Mutator(), language='en', chunk_size=32)
        self.assertEqual(result.text, source)

    def test_multiline_inline_code_remains_whole(self):
        literal = '`first\nSecretToken`'
        self.assert_literal_whole('An introduction before ' + literal + ' afterwards.', literal)

    def test_nested_fences_and_indented_code_are_protected(self):
        for block in ['> ```python\r\n> SecretToken = True\r\n> ```\r\n',
                      '- sample:\n\n    ```python\n    SecretToken = True\n    ```\n',
                      '> - ~~~python\n>   SecretToken = True\n>   ~~~\n',
                      '    SecretToken = True\n', '\tSecretToken = True\n']:
            with self.subTest(block=block):
                source = 'Before.\n' + block + '\nAfter.'
                result = rewrite(source, Mutator(), language='en')
                self.assertEqual(result.text, source)
                self.assertTrue(any(s.protected and 'SecretToken' in s.text for s in segment_markdown(source)))

    def test_unclosed_nested_fence_protects_through_end(self):
        source = 'Before.\n> ```python\n> SecretToken = True\nOutside SecretToken\n'
        result = rewrite(source, Mutator(), language='en')
        self.assertEqual(result.text, source)
        segments = segment_markdown(source)
        self.assertTrue(segments[-1].protected)
        self.assertTrue(segments[-1].text.endswith('Outside SecretToken\n'))

    def test_ordinary_prose_remains_eligible_and_bounded(self):
        source = ('Ordinary words explain the mechanism.\n' * 20) + 'Last sentence.'
        segments = segment_markdown(source, 64)
        self.assertEqual(''.join(s.text for s in segments), source)
        self.assertTrue(all(not s.protected and len(s.text) <= 64 for s in segments))


if __name__ == '__main__':
    unittest.main()
