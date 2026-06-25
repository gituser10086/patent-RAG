"""
Simple Flask proxy server for the PatentRAG frontend.

This server:
1. Serves the static frontend HTML
2. Proxies API requests to the Hashtag AI backend (handles CORS & API key server-side)
"""

import os
import sys
import json
import requests
from flask import Flask, request, jsonify, send_from_directory

# Add parent directory to path for config import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import API_KEY, BASE_URL

app = Flask(__name__, static_folder=".")

HEADERS = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
}


@app.route("/")
def index():
    """Serve the main frontend page."""
    return send_from_directory(".", "index.html")


@app.route("/api/search", methods=["POST"])
def search_prior_art():
    """
    Proxy endpoint: accept a technical document and search for prior art.
    
    Uses the Hashtag AI /query endpoint which performs similarity search
    against the patent knowledge graph.
    
    Expects JSON: { "text": "the document content" }
    Returns: {
        "results": [
            {
                "patent_id": "...",
                "title": "...",
                "similarity": 0.95,
                "snippet": "..."
            }
        ],
        "answer": "...",
        "total_results": N
    }
    """
    try:
        data = request.get_json()
        if not data or "text" not in data:
            return jsonify({"error": "Missing 'text' field in request body"}), 400

        document_text = data["text"]

        # Build payload for the Hashtag AI /query endpoint
        # The 'question' field is used as the search query against the patent DB
        payload = {
            "question": document_text
        }

        # Send request to the backend API
        resp = requests.post(
            f"{BASE_URL}/query",
            headers=HEADERS,
            json=payload,
            timeout=120  # Allow up to 2 minutes for processing
        )

        if resp.status_code != 200:
            return jsonify({
                "error": f"Backend API returned status {resp.status_code}",
                "detail": resp.text
            }), resp.status_code

        # Parse the response from the API
        result_data = resp.json()

        # Extract similarity results from the response
        info = result_data.get("info", {})
        nodedetails = info.get("nodedetails", {})
        chunk_details = nodedetails.get("chunkdetails", [])
        sources = info.get("sources", [])
        answer = result_data.get("answer", "")

        # Build a structured results list
        results = []
        for chunk in chunk_details:
            results.append({
                "patent_id": chunk.get("id", "unknown"),
                "title": f"Patent Document (chunk: {chunk.get('id', '')[:12]}...)",
                "similarity": chunk.get("score", 0),
                "snippet": ""
            })

        # Sort by similarity score descending
        results.sort(key=lambda x: x["similarity"], reverse=True)

        return jsonify({
            "results": results,
            "answer": answer,
            "sources": sources,
            "total_results": len(results)
        })

    except requests.exceptions.Timeout:
        return jsonify({"error": "Request to backend API timed out"}), 504
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Could not connect to backend API"}), 502
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """Simple health check endpoint."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"Starting PatentRAG frontend server on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)