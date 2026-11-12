import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";

import { afterEach } from "vitest";
/** Loopback HTTP service records actual requests without live credentials or remote effects. */
export function installGitlabHttpFixtures() {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(async (server) => {
        server.closeAllConnections();
        await promisify(server.close.bind(server))();
      })
    );
  });
  return async (
    handler: (req: IncomingMessage, res: ServerResponse) => void
  ) => {
    const requests: {
      method: string | undefined;
      url: string | undefined;
      authorization: string | undefined;
      privateToken: string | string[] | undefined;
    }[] = [];
    const server = createServer((req, res) => {
      requests.push({
        authorization: req.headers.authorization,
        method: req.method,
        privateToken: req.headers["private-token"],
        url: req.url,
      });
      handler(req, res);
    });
    servers.push(server);
    const listening = once(server, "listening");
    server.listen(0, "127.0.0.1");
    await listening;
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("GITLAB_FIXTURE: no loopback address");
    }
    return { origin: `http://127.0.0.1:${address.port}`, requests };
  };
}
