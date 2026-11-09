"""Minimal Ollama and OpenAI-compatible clients; no API keys are logged."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from .languages import Language


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # API endpoints are configured explicitly. Never resend bearer keys or
        # paragraph content to a redirect target, even on the same origin.
        return None


@dataclass(frozen=True)
class Settings:
    provider: str = 'ollama'
    model: str = 'plainspeak-hy'
    base_url: str = 'http://127.0.0.1:11434'
    api_key: str = ''
    timeout: float = 180.0

    @classmethod
    def from_env(cls) -> 'Settings':
        # An explicit legacy endpoint keeps its old Ollama meaning. A fresh
        # installation uses the managed model without another background app.
        provider = os.environ.get('PLAINSPEAK_PROVIDER',
                                  'ollama' if 'PLAINSPEAK_BASE_URL' in os.environ else 'managed')
        default_url = 'http://127.0.0.1:11434' if provider == 'ollama' else 'http://127.0.0.1:8080/v1'
        return cls(provider, os.environ.get('PLAINSPEAK_MODEL',
                   'hy-mt2-1.8b-q4' if provider == 'managed' else 'plainspeak-hy'),
                   os.environ.get('PLAINSPEAK_BASE_URL', default_url),
                   os.environ.get('PLAINSPEAK_API_KEY', ''),
                   float(os.environ.get('PLAINSPEAK_TIMEOUT', '180')))


class Backend:
    def __init__(self, settings: Settings):
        if settings.provider not in ('ollama', 'openai'):
            raise ValueError('Provider must be ollama or openai.')
        parsed = urllib.parse.urlsplit(settings.base_url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Base URL must be http(s) without embedded credentials, query or fragment.')
        if settings.timeout <= 0 or not settings.model:
            raise ValueError('A model and positive timeout are required.')
        self.settings = settings
        # Local model traffic never goes through an inherited web proxy.
        handlers = [_NoRedirect()]
        if parsed.hostname in ('127.0.0.1', 'localhost', '::1'):
            handlers.append(urllib.request.ProxyHandler({}))
        self.opener = urllib.request.build_opener(*handlers)

    def _request(self, path: str, body: dict | None = None) -> dict:
        headers = {'Content-Type': 'application/json'}
        if self.settings.api_key:
            headers['Authorization'] = 'Bearer ' + self.settings.api_key
        request = urllib.request.Request(self.settings.base_url.rstrip('/') + path,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8'), headers=headers)
        try:
            with self.opener.open(request, timeout=self.settings.timeout) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            raise RuntimeError('Translation provider unavailable or returned invalid JSON; check plainspeak doctor.') from None

    def translate(self, text: str, target: Language, *, context: str = '') -> str:
        if not isinstance(context, str) or len(context) > 2400:
            raise ValueError('Background must be a string of at most 2,400 characters.')
        if context.strip():
            # Natural labels avoid Hy-MT2 sometimes translating the decorative
            # target label itself. Reuse the original background on both passes.
            prompt = (f'背景信息（仅供理解，不要翻译）：\n{context}\n\n'
                      f'结合上述背景，将下面这段文本翻译为{target.prompt_name}，'
                      '人名、地名按背景中的写法保持一致，只输出这段文本的译文：\n'
                      f'{text}')
        else:
            prompt = f'将以下文本翻译为{target.prompt_name}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}'
        messages = [{'role': 'user', 'content': prompt}]
        if self.settings.provider == 'ollama':
            data = self._request('/api/chat', {'model': self.settings.model, 'stream': False,
                'messages': messages, 'keep_alive': '5m',
                'options': {'temperature': 0, 'seed': 42, 'num_ctx': 8192,
                            'num_predict': 3072, 'repeat_penalty': 1.05}})
            if data.get('done_reason') == 'length':
                raise RuntimeError('Provider output was truncated.')
            output = data.get('message', {}).get('content')
        else:
            data = self._request('/chat/completions', {'model': self.settings.model,
                'stream': False, 'messages': messages, 'temperature': 0, 'max_tokens': 3072})
            choices = data.get('choices', [])
            if not choices or choices[0].get('finish_reason') in ('length', 'content_filter'):
                raise RuntimeError('Provider returned no complete translation.')
            output = choices[0].get('message', {}).get('content')
        if not isinstance(output, str) or not output.strip():
            raise RuntimeError('Provider returned an empty translation.')
        return output

    def doctor(self) -> dict:
        data = self._request('/api/tags' if self.settings.provider == 'ollama' else '/models')
        values = data.get('models', []) if self.settings.provider == 'ollama' else data.get('data', [])
        names = [v.get('name', v.get('id', '')) for v in values]
        return {'reachable': True, 'provider': self.settings.provider, 'model': self.settings.model,
                'model_found': self.settings.model in names or self.settings.model + ':latest' in names}


def create_backend(settings: Settings | None = None) -> Backend:
    """Start an already-installed managed model only when translation is requested."""
    resolved = settings or Settings.from_env()
    if resolved.provider == 'managed':
        from .managed import get_managed_backend
        return get_managed_backend()
    return Backend(resolved)
