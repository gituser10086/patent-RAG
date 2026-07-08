import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);
const port = Number(process.env.PORT || 3000);
const baseUrl = 'https://kg-api.hashtag.ai/patentrag';

loadDotEnv(path.join(rootDir, '.env'));
loadDotEnv(path.join(__dirname, '.env'));

function loadDotEnv(filePath) {
    if (!existsSync(filePath)) {
        return;
    }

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
            continue;
        }

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) {
            process.env[key.trim()] = value;
        }
    }
}

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

async function sendFile(res, filePath, contentType) {
    const body = await readFile(filePath);
    res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': body.length
    });
    res.end(body);
}

async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    return body ? JSON.parse(body) : {};
}

function extractChunkDetails(responseData) {
    const chunkDetails = responseData?.info?.nodedetails?.chunkdetails;
    return Array.isArray(chunkDetails) ? chunkDetails : [];
}

function extractSources(responseData) {
    const sources = responseData?.info?.sources;
    return Array.isArray(sources) ? sources : [];
}

function buildPatentTitle(chunkId, maxChars = 12) {
    const truncated = chunkId ? String(chunkId).slice(0, maxChars) : 'unknown';
    return `Patent Document (chunk: ${truncated}...)`;
}

function processQueryResponse(responseData) {
    const results = extractChunkDetails(responseData)
        .map((chunk) => {
            const chunkId = chunk.id || 'unknown';
            return {
                patent_id: chunkId,
                title: buildPatentTitle(chunkId),
                similarity: Number(chunk.score || 0),
                snippet: chunk.text || ''
            };
        })
        .sort((a, b) => b.similarity - a.similarity);

    return {
        results,
        answer: responseData?.answer || '',
        sources: extractSources(responseData),
        total_results: results.length
    };
}

async function handleSearch(req, res) {
    const apiKey = process.env.HASHTAG_API_KEY;
    if (!apiKey) {
        sendJson(res, 500, { error: 'HASHTAG_API_KEY not found in environment variables' });
        return;
    }

    let data;
    try {
        data = await readJsonBody(req);
    } catch {
        sendJson(res, 400, { error: 'Invalid JSON request body' });
        return;
    }

    if (!data || typeof data.text !== 'string') {
        sendJson(res, 400, { error: "Missing 'text' field in request body" });
        return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
        const response = await fetch(`${baseUrl}/query`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question: data.text }),
            signal: controller.signal
        });

        const responseText = await response.text();
        if (!response.ok) {
            sendJson(res, response.status, {
                error: `Backend API returned status ${response.status}`,
                detail: responseText
            });
            return;
        }

        const parsed = processQueryResponse(JSON.parse(responseText));
        sendJson(res, 200, parsed);
    } catch (error) {
        if (error.name === 'AbortError') {
            sendJson(res, 504, { error: 'Request to backend API timed out' });
            return;
        }
        sendJson(res, 502, { error: `Could not connect to backend API: ${error.message}` });
    } finally {
        clearTimeout(timeout);
    }
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);

        if (req.method === 'GET' && url.pathname === '/') {
            await sendFile(res, path.join(__dirname, 'index.html'), 'text/html; charset=utf-8');
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/health') {
            sendJson(res, 200, { status: 'ok' });
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/search') {
            await handleSearch(req, res);
            return;
        }

        sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
        sendJson(res, 500, { error: `Internal server error: ${error.message}` });
    }
});

server.listen(port, '0.0.0.0', () => {
    console.log(`PatentRAG frontend server running at http://localhost:${port}`);
});
