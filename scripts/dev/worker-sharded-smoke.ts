import { QWormholeClient, WorkerShardedServer } from "../../src/index";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
  const requestedWorkers = Number(process.env.QWORMHOLE_SMOKE_WORKERS ?? "2");
  const workers =
    process.platform === "win32" ? Math.max(1, Math.min(1, requestedWorkers)) : requestedWorkers;
  const requestedPort =
    process.platform === "win32"
      ? Number(process.env.QWORMHOLE_SMOKE_PORT ?? "0")
      : Number(process.env.QWORMHOLE_SMOKE_PORT ?? "41011");

  const server = new WorkerShardedServer({
    host: "127.0.0.1",
    port: requestedPort,
    framing: "length-prefixed",
    workers,
    reusePort: true,
    telemetryIntervalMs: 25,
  });

  await server.listen();
  const initialStats = server.getStats();
  const listeningPort = initialStats.byWorker[0]?.address?.port;
  if (!listeningPort) {
    throw new Error("worker sharded smoke server did not expose a port");
  }

  const clients = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const client = new QWormholeClient<Buffer>({
        host: "127.0.0.1",
        port: listeningPort,
        framing: "length-prefixed",
      });
      await client.connect();
      return client;
    }),
  );

  let broadcastReceipts = 0;
  for (const client of clients) {
    client.on("message", () => {
      broadcastReceipts += 1;
    });
  }

  for (let i = 0; i < 200; i++) {
    await clients[i % clients.length].send(Buffer.from(`smoke-${i}`));
  }

  await sleep(150);
  const midStats = server.getStats();
  if (midStats.messagesIn < 200) {
    throw new Error(
      `worker sharded smoke expected >=200 inbound messages, saw ${midStats.messagesIn}`,
    );
  }

  server.broadcast(Buffer.from("broadcast-smoke"));
  await sleep(150);
  if (broadcastReceipts < clients.length) {
    throw new Error(
      `worker sharded smoke expected at least ${clients.length} broadcast receipts, saw ${broadcastReceipts}`,
    );
  }

  for (const client of clients) {
    client.disconnect();
  }

  await server.shutdown();
  console.log(
    JSON.stringify(
      {
        ok: true,
        workers: initialStats.byWorker.length,
        requestedWorkers,
        requestedPort,
        listeningPort,
        messagesIn: midStats.messagesIn,
        broadcastReceipts,
      },
      null,
      2,
    ),
  );
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
