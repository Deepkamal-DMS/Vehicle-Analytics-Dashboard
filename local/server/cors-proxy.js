/*
 * PostgREST (the "api" service in docker-compose.yml) answers CORS
 * preflights with Access-Control-Allow-Origin but no
 * Access-Control-Allow-Headers - so a browser's preflight for the
 * Range/Range-Unit headers fetchPage() sends on every paginated
 * request (see script.js) gets rejected before the real request ever
 * goes out, even though PostgREST itself would have answered it.
 * This sits in front of port 3003 purely to add that one missing
 * header; every request is otherwise passed through unchanged.
 *
 * Supabase's own REST endpoint needs no such proxy - this is a
 * PostgREST-direct quirk this project only meets locally.
 *
 * Usage:  node cors-proxy.js
 */

import http from "http";

const TARGET_HOST = "localhost";
const TARGET_PORT = 3003;
const LISTEN_PORT = 3004;

function corsHeaders(req) {

    const requestedHeaders =
        req.headers["access-control-request-headers"] ||
        "range, range-unit, content-type, prefer, authorization, apikey";

    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": requestedHeaders,
        "Access-Control-Expose-Headers": "Content-Range, Range-Unit"
    };
}

const server = http.createServer((req, res) => {

    if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders(req));
        res.end();
        return;
    }

    const proxyReq = http.request(
        {
            host: TARGET_HOST,
            port: TARGET_PORT,
            path: req.url,
            method: req.method,
            headers: req.headers
        },
        proxyRes => {
            res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, ...corsHeaders(req) });
            proxyRes.pipe(res);
        }
    );

    proxyReq.on("error", error => {
        res.writeHead(502);
        res.end(`proxy error: ${error.message}`);
    });

    req.pipe(proxyReq);
});

server.listen(LISTEN_PORT, () => {
    console.log(`CORS proxy listening on http://localhost:${LISTEN_PORT} -> PostgREST on :${TARGET_PORT}`);
});
