import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { handleRequest } from '../server/api.js';
const base = resolve(import.meta.dirname, '../public');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};
http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const request = new Request(`http://localhost:${port}${req.url}`, {
          method: req.method,
          headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
          duplex: 'half',
        });
        const response = await handleRequest(request, process.env);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
      const target = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(base + sep) || pathname.includes('/.')) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(target);
      res.writeHead(200, {
        'Content-Type': `${types[extname(target)] || 'text/plain'}; charset=utf-8`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Não encontrado');
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(
      `Local: http://localhost:${port} — use Explorar com dados fictícios. Para autenticação real, use Pages em HTTPS.`,
    ),
  );
