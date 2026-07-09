import { createServer } from "node:http";

export type FixtureServer = {
  baseUrl: string;
  port: number;
  getHits: () => ReadonlyMap<string, number>;
  resetHits: () => void;
  close: () => Promise<void>;
};

const HOME_HTML = `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="/style.css">
    <link rel="preload" href="/font.woff2" as="font" crossorigin>
    <link rel="modulepreload" href="/module.js">
    <script src="/app.js"></script>
  </head>
  <body>
    <img src="/photo.jpg" alt="photo">
    <img srcset="/photo-small.jpg 1x, /photo-large.jpg 2x" alt="responsive">
    <a href="/page2">next</a>
  </body>
</html>`;

const PAGE2_HTML = `<!DOCTYPE html>
<html>
  <body>
    page2
    <script src="/page2.js"></script>
  </body>
</html>`;

export function createFixtureHandler(hits = new Map<string, number>()) {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const path = req.url?.split("?")[0] ?? "/";
    hits.set(path, (hits.get(path) ?? 0) + 1);

    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(HOME_HTML);
      return;
    }

    if (path === "/page2") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGE2_HTML);
      return;
    }

    if (path === "/style.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end('@font-face{font-family:"Fixture";src:url("/font-from-css.woff2") format("woff2")}body{color:black}');
      return;
    }

    if (path === "/app.js" || path === "/page2.js" || path === "/module.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end("console.log('ok')");
      return;
    }

    if (path === "/font.woff2" || path === "/font-from-css.woff2") {
      res.writeHead(200, { "content-type": "font/woff2" });
      res.end("woff2");
      return;
    }

    if (path === "/photo.jpg" || path === "/photo-small.jpg" || path === "/photo-large.jpg") {
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end("jpeg");
      return;
    }

    res.writeHead(404);
    res.end("not found");
  };
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const hits = new Map<string, number>();
  const server = createServer(createFixtureHandler(hits));

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Invalid server address");

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    port: address.port,
    getHits: () => hits,
    resetHits: () => hits.clear(),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
