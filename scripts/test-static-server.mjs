import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'public');
const port = Number(process.env.PORT || 4173);

const mimeByExt = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://localhost:${port}`);
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === '/') pathname = '/index.html';

    const fullPath = path.normalize(path.join(root, pathname));
    if (!fullPath.startsWith(root)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    fs.readFile(fullPath, (err, content) => {
        if (err) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        res.setHeader('Content-Type', mimeByExt[ext] || 'application/octet-stream');
        res.end(content);
    });
});

server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KEOS test server running on http://localhost:${port}`);
});
