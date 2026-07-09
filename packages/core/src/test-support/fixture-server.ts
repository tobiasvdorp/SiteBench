import { createServer } from "node:http";

export type FixtureServer = {
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
};

export function createFixtureHandler() {
  return (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const path = req.url ?? "/";

    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end('<html><a href="/page2">next</a><link rel="stylesheet" href="/style.css"></html>');
      return;
    }

    if (path === "/page2") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end('<html><body>page2<script src="/app.js"></script></body></html>');
      return;
    }

    if (path === "/style.css") {
      res.writeHead(200, { "content-type": "text/css" });
      res.end("body{color:black}");
      return;
    }

    if (path === "/app.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end("console.log('ok')");
      return;
    }

    res.writeHead(404);
    res.end("not found");
  };
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer(createFixtureHandler());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Invalid server address");

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
