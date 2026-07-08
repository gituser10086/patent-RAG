const baseUrl = 'https://kg-api.hashtag.ai/patentrag';

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

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const apiKey = process.env.HASHTAG_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'HASHTAG_API_KEY not found in environment variables' });
        return;
    }

    if (!req.body || typeof req.body.text !== 'string') {
        res.status(400).json({ error: "Missing 'text' field in request body" });
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
            body: JSON.stringify({ question: req.body.text }),
            signal: controller.signal
        });

        const responseText = await response.text();
        if (!response.ok) {
            res.status(response.status).json({
                error: `Backend API returned status ${response.status}`,
                detail: responseText
            });
            return;
        }

        res.status(200).json(processQueryResponse(JSON.parse(responseText)));
    } catch (error) {
        if (error.name === 'AbortError') {
            res.status(504).json({ error: 'Request to backend API timed out' });
            return;
        }
        res.status(502).json({ error: `Could not connect to backend API: ${error.message}` });
    } finally {
        clearTimeout(timeout);
    }
};
