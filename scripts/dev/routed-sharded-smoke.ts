import { QWormholeClient, RoutedShardedServer } from "../../src/index";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
  const workers = Number(process.env.QWORMHOLE_ROUTED_SMOKE_WORKERS ?? "2");
  const requestedPort = Number(process.env.QWORMHOLE_ROUTED_SMOKE_PORT ?? "0");

  const server = new RoutedShardedServer({
    host: "127.0.0.1",
    port: requestedPort,
    framing: "length-prefixed",
    workers,
    telemetryIntervalMs: 25,
  });

  const address = await server.listen();

  const clients = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const client = new QWormholeClient<Buffer>({
        host: "127.0.0.1",
        port: address.port,
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
    await clients[i % clients.length].send(Buffer.from(`routed-smoke-${i}`));
  }

  await sleep(200);
  const midStats = server.getStats();
  if (midStats.messagesIn < 200) {
    throw new Error(
      `routed sharded smoke expected >=200 inbound messages, saw ${midStats.messagesIn}`,
    );
  }

  server.broadcast(Buffer.from("routed-broadcast-smoke"));
  await sleep(200);
  if (broadcastReceipts < clients.length) {
    throw new Error(
      `routed sharded smoke expected at least ${clients.length} broadcast receipts, saw ${broadcastReceipts}`,
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
        workers,
        requestedPort,
        listeningPort: address.port,
        proxiedConnections: midStats.proxiedConnections,
        acceptedConnections: midStats.acceptedConnections,
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
