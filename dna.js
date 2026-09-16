"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const START_PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function safeFilePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const relativePath = decodedPath === "/" ? "/dna/index.html" : decodedPath;
  const filePath = path.resolve(ROOT, `.${relativePath}`);
  const rootWithSeparator = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;
  if (filePath !== ROOT && !filePath.startsWith(rootWithSeparator)) {
    return null;
  }
  return filePath;
}

function requestHandler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  let requestPath = requestUrl.pathname;
  if (requestPath === "/dna" || requestPath === "/dna/") {
    requestPath = "/dna/index.html";
  }

  let filePath;
  try {
    filePath = safeFilePath(requestPath);
  } catch {
    filePath = null;
  }

  if (!filePath) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": stats.size,
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
}

function startServer(port) {
  const server = http.createServer(requestHandler);
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`Port ${port} is busy. Trying port ${port + 1}...`);
      startServer(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, () => {
    console.log(`Academic DNA dashboard: http://localhost:${port}/dna/`);
    console.log("Press Ctrl+C to stop the server.");
  });
}

startServer(START_PORT);
