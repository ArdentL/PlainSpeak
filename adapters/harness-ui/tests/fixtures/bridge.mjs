import { createServer } from 'node:http';
const token = process.argv[process.argv.indexOf('--token') + 1];
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403); return res.end('{}'); }
  if (req.url === '/health') return res.end(JSON.stringify({ ok: true, modelReady: false }));
  if (req.url === '/busy') { res.writeHead(429); return res.end(JSON.stringify({ error: 'Translation is busy' })); }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  res.end(JSON.stringify({ text: `${body.language}:${body.text}`, report: { fixture: true } }));
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ host: '127.0.0.1', port: server.address().port, service: 'plainspeak' })));
process.stdin.resume();
process.stdin.once('end', () => server.close());
