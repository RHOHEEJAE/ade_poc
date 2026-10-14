// serve.mjs — fixture/ 를 정적으로 내보내는 최소 서버. Playwright 가 시험 전에 띄운다.
//
//   /ade-collect/* 로 오는 요청은 여기 닿기 전에 Playwright 가 가로챈다.
//   혹시 새면 404 가 아니라 200 을 준다 — 4xx 를 받으면 SDK 가 그 배치를
//   영구 삭제해서(수집 계약 §3) 시험이 「수집 안 됨」으로 잘못 실패한다.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'fixture');
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.map': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname.startsWith('/ade-collect/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"status":1,"error":null}');
  }

  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(ROOT, rel);
  try {
    await stat(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`[tests/browser] fixture http://127.0.0.1:${PORT}`));
