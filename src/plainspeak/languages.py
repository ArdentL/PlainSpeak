"""Language labels from the upstream Hy-MT2 model card, not quality guarantees."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    code: str
    name: str
    prompt_name: str


_ROWS = [
    ('zh-CN', 'Simplified Chinese', '简体中文'), ('en', 'English', '英语'),
    ('zh-Hant', 'Traditional Chinese', '繁体中文'), ('fr', 'French', '法语'),
    ('pt', 'Portuguese', '葡萄牙语'), ('es', 'Spanish', '西班牙语'),
    ('ja', 'Japanese', '日语'), ('tr', 'Turkish', '土耳其语'),
    ('ru', 'Russian', '俄语'), ('ar', 'Arabic', '阿拉伯语'),
    ('ko', 'Korean', '韩语'), ('th', 'Thai', '泰语'),
    ('it', 'Italian', '意大利语'), ('de', 'German', '德语'),
    ('vi', 'Vietnamese', '越南语'), ('ms', 'Malay', '马来语'),
    ('id', 'Indonesian', '印尼语'), ('tl', 'Filipino', '菲律宾语'),
    ('hi', 'Hindi', '印地语'), ('pl', 'Polish', '波兰语'),
    ('cs', 'Czech', '捷克语'), ('nl', 'Dutch', '荷兰语'),
    ('km', 'Khmer', '高棉语'), ('my', 'Burmese', '缅甸语'),
    ('fa', 'Persian', '波斯语'), ('gu', 'Gujarati', '古吉拉特语'),
    ('ur', 'Urdu', '乌尔都语'), ('te', 'Telugu', '泰卢固语'),
    ('mr', 'Marathi', '马拉地语'), ('he', 'Hebrew', '希伯来语'),
    ('bn', 'Bengali', '孟加拉语'), ('ta', 'Tamil', '泰米尔语'),
    ('uk', 'Ukrainian', '乌克兰语'), ('bo', 'Tibetan', '藏语'),
    ('kk', 'Kazakh', '哈萨克语'), ('mn', 'Mongolian', '蒙古语'),
    ('ug', 'Uyghur', '维吾尔语'), ('yue', 'Cantonese', '粤语'),
]
LANGUAGES = {code: Language(code, name, prompt) for code, name, prompt in _ROWS}
ALIASES = {'zh': 'zh-CN', 'zh-cn': 'zh-CN', 'zh-hans': 'zh-CN', 'zh-hant': 'zh-Hant',
           'zh-tw': 'zh-Hant', 'zh-hk': 'zh-Hant', 'en-us': 'en', 'en-gb': 'en',
           'pt-br': 'pt', 'pt-pt': 'pt', 'fil': 'tl'}


def language(value: str) -> Language:
    code = ALIASES.get(value.lower(), value.lower())
    if code not in LANGUAGES:
        raise ValueError(f'Unsupported language: {value}. Run plainspeak languages.')
    return LANGUAGES[code]


def resolve_route(source: str, pivot: str | None) -> tuple[Language, Language]:
    original = language(source)
    intermediate = language(pivot) if pivot else LANGUAGES['zh-CN' if original.code == 'en' else 'en']
    if intermediate.code == original.code:
        raise ValueError('The pivot language must differ from the output language.')
    return original, intermediate
