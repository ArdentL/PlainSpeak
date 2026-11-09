import importlib.util
import json
import os
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer

from test_backend_cli import Handler


@unittest.skipUnless(importlib.util.find_spec('mcp'), 'Install .[mcp] for official SDK integration tests.')
class McpTests(unittest.IsolatedAsyncioTestCase):
    async def test_stdio_discovery_and_real_rewrite_tool(self):
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            parameters = StdioServerParameters(command=sys.executable,
                args=['-m', 'plainspeak.mcp_server'],
                env={**os.environ, 'PLAINSPEAK_BASE_URL': f'http://127.0.0.1:{server.server_port}'})
            async with stdio_client(parameters) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    self.assertEqual({t.name for t in tools.tools}, {'rewrite_text', 'list_languages', 'writing_guidance'})
                    result = await session.call_tool('rewrite_text', {'text': '你好', 'language': 'zh-CN'})
                    self.assertFalse(result.isError)
                    payload = json.loads(next(c.text for c in result.content if c.type == 'text'))
                    self.assertEqual(payload['text'], '你好')
                    self.assertEqual(payload['report']['retained_chunks'], 0)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
