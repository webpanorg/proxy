import http from 'http';
import net from 'net';
import { URL } from 'url';

const USERNAME = process.env.PROXY_USER || 'user';
const PASSWORD = process.env.PROXY_PASS || 'password';
const PORT = Number(process.env.PROXY_PORT) || 3128;
const AUTH_REALM = 'Proxy';

function parseBasicAuth(headers) {
  const auth = headers['proxy-authorization'];
  if (!auth || !auth.startsWith('Basic ')) return null;

  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const [user, pass] = decoded.split(':');
  if (!user || pass === undefined) return null;
  return { user, pass };
}

function isAuthorized(headers) {
  const creds = parseBasicAuth(headers);
  return !!creds && creds.user === USERNAME && creds.pass === PASSWORD;
}

function sendAuthRequired(res) {
  res.writeHead(407, {
    'Proxy-Authenticate': `Basic realm="${AUTH_REALM}"`,
  });
  res.end();
}

function writeAuthRequired(socket) {
  socket.write(
    'HTTP/1.1 407 Proxy Authentication Required\r\n' +
      `Proxy-Authenticate: Basic realm="${AUTH_REALM}"\r\n\r\n`
  );
}

function sanitizeHeaders(headers) {
  const cleaned = { ...headers };
  delete cleaned['proxy-authorization'];
  delete cleaned['proxy-connection'];
  return cleaned;
}

function parseHttpTarget(rawUrl) {
  if (!rawUrl) return null;
  try {
    const target = new URL(rawUrl);
    return {
      hostname: target.hostname,
      port: target.port || '80',
      path: target.pathname + target.search,
    };
  } catch {
    return null;
  }
}

function parseConnectTarget(rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('[')) {
    const match = rawUrl.match(/^\[([^\]]+)\]:(\d+)$/);
    if (!match) return null;
    return { host: match[1], port: match[2] };
  }

  const [host, port] = rawUrl.split(':');
  if (!host) return null;
  return { host, port: port || '443' };
}

/* ================= HTTP ================= */

const server = http.createServer((req, res) => {
  if (!isAuthorized(req.headers)) {
    sendAuthRequired(res);
    return;
  }

  const target = parseHttpTarget(req.url);
  if (!target) {
    res.writeHead(400);
    res.end();
    return;
  }

  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      method: req.method,
      headers: sanitizeHeaders(req.headers),
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.on('error', () => proxyReq.destroy());

  req.pipe(proxyReq);
});

/* ================= HTTPS (CONNECT) ================= */

server.on('connect', (req, clientSocket, head) => {
  if (!isAuthorized(req.headers)) {
    writeAuthRequired(clientSocket);
    clientSocket.destroy();
    return;
  }

  const target = parseConnectTarget(req.url);
  if (!target) {
    clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    clientSocket.destroy();
    return;
  }

  const serverSocket = net.connect(target.port, target.host);

  serverSocket.on('connect', () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    if (head?.length) serverSocket.write(head);

    clientSocket.pipe(serverSocket);
    serverSocket.pipe(clientSocket);
  });

  serverSocket.on('error', () => {
    clientSocket.destroy();
  });

  clientSocket.on('error', () => serverSocket.destroy());
  clientSocket.on('close', () => serverSocket.destroy());
});

/* 🔴 Глобально, чтобы процесс не падал */
server.on('clientError', (err, socket) => {
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`HTTP(S) forward proxy with auth listening on ${PORT}`);
});
