import { defineConfig } from 'vite';
import pkg from './package.json' assert { type: 'json' };
import fs from 'fs';
import path from 'path';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeSidecar(kind: string, generated: string, suffix = '') {
  const cleanKind = kind.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'generic';
  const cleanSuffix = suffix ? '-' + suffix.replace(/[^a-z0-9-]/gi, '').toLowerCase() : '';
  const file = path.join(process.cwd(), `last-editor-apply-${cleanKind}${cleanSuffix}-${timestamp()}.txt`);
  fs.writeFileSync(file, generated, 'utf8');
  return file;
}

function latestLevelSidecar(index: string) {
  const prefix = `last-editor-apply-level-${index}-`;
  const files = fs.readdirSync(process.cwd()).filter(file => file.startsWith(prefix) && file.endsWith('.txt'));
  files.sort((a, b) => b.localeCompare(a));
  return files[0] ? path.join(process.cwd(), files[0]) : null;
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
      },
    },
  },
  plugins: [
    {
      name: 'vibeeditor-dev-tools',
      configureServer(server) {
        server.middlewares.use('/__editor-apply', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('POST only');
            return;
          }

          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const kind = String(payload.kind || payload.type || 'generic');
              const generated = String(payload.generatedCode || payload.code || '');
              if (!generated.trim()) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, message: 'No code to apply.' }));
                return;
              }

              const suffix = kind === 'level' || kind === 'lvl' ? String(payload.index ?? payload.lvlIndex ?? 'unknown') : '';
              const sidecarKind = kind === 'lvl' ? 'level' : kind;
              const target = writeSidecar(sidecarKind, generated, suffix);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                ok: true,
                message: `Wrote editor output to ${path.basename(target)}.`,
                target,
              }));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, message: 'Bad request: ' + (e?.message || e) }));
            }
          });
        });

        server.middlewares.use('/__editor-snippet', (req, res) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, message: 'GET only' }));
            return;
          }
          const q = (req.url || '').split('?')[1] || '';
          const params = new URLSearchParams(q);
          const kind = params.get('kind') || 'generic';
          const id = params.get('id') || params.get('warrior') || '';
          const snippet = kind === 'builder'
            ? '// Standalone seed does not bind builder snippets back to a game runtime yet.'
            : '// Standalone seed does not bind pose snippets back to a game runtime yet.';
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, kind, id, snippet }));
        });

        server.middlewares.use('/__last-level-editor-apply', (req, res) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, message: 'GET only' }));
            return;
          }
          const q = (req.url || '').split('?')[1] || '';
          const params = new URLSearchParams(q);
          const index = params.get('index') || params.get('level') || 'unknown';
          const file = latestLevelSidecar(index);
          res.setHeader('Content-Type', 'application/json');
          if (!file) {
            res.end(JSON.stringify({ ok: true, code: '', target: null }));
            return;
          }
          res.end(JSON.stringify({ ok: true, code: fs.readFileSync(file, 'utf8'), target: file }));
        });
      },
    },
  ],
});
