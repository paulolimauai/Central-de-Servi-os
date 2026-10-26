const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const chatFile = path.join(root, 'chat-messages.json');
const statusFile = path.join(root, 'technician-status.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const readJson = (file, fallback) => {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) || fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[Erro] Falha ao persistir dados em ${file}:`, err);
  }
};

const sendJson = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
};

const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const server = http.createServer((req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost:3002'}`);
  const pathname = url.pathname;

  // Endpoint de status dos técnicos
  if (pathname === '/api/status') {
    if (req.method === 'GET') {
      return sendJson(res, 200, readJson(statusFile, {}));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 20000) req.destroy();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const allowed = ['Online', 'Offline', 'Ocupado', 'Ausente', 'Muito ocupado'];
          if (!data.name || !allowed.includes(data.status)) {
            return sendJson(res, 400, { error: 'Payload ou status inválido.' });
          }
          const statuses = readJson(statusFile, {});
          const normalizedName = String(data.name).trim();
          statuses[normalizedName] = {
            status: data.status,
            at: new Date().toISOString()
          };
          writeJson(statusFile, statuses);
          return sendJson(res, 201, { ok: true, statuses });
        } catch {
          return sendJson(res, 400, { error: 'Estrutura JSON inválida.' });
        }
      });
      return;
    }
  }

  // Endpoint do Chat Corporativo
  if (pathname === '/api/chat') {
    if (req.method === 'GET') {
      const messages = readJson(chatFile, []);
      return sendJson(res, 200, messages.slice(-500));
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 50000) req.destroy();
      });
      req.on('end', () => {
        try {
          const msg = JSON.parse(body);
          const text = String(msg.text || '').trim();
          const sender = String(msg.sender || '').trim();
          const recipient = String(msg.recipient || 'Todos os técnicos').trim();

          if (!sender || !text) {
            return sendJson(res, 400, { error: 'Remetente e mensagem são obrigatórios.' });
          }

          const list = readJson(chatFile, []);
          list.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            sender: sender.slice(0, 120),
            recipient: recipient.slice(0, 120),
            text: text.slice(0, 2000),
            at: new Date().toISOString()
          });
          writeJson(chatFile, list.slice(-1000));
          return sendJson(res, 201, { ok: true });
        } catch {
          return sendJson(res, 400, { error: 'Estrutura JSON inválida.' });
        }
      });
      return;
    }
  }

  // Servidor de arquivos estáticos seguro
  const requestedFile = pathname === '/' ? 'helpdesk-crm 01.html' : decodeURIComponent(pathname.slice(1));
  const safePath = path.normalize(path.join(root, requestedFile));

  if (!safePath.startsWith(root)) {
    res.statusCode = 403;
    return res.end('Acesso não autorizado.');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      return res.end('Arquivo não encontrado.');
    }
    const ext = path.extname(safePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    fs.createReadStream(safePath).pipe(res);
  });
});

const PORT = 3002;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Central de Serviços CRM - IPASGO Saúde] Servidor ativo em http://127.0.0.1:${PORT}`);
});
