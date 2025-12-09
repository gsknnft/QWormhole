import { QWormholeNode } from "../src/node/node-runtime";

// node A
const nodeA = new QWormholeNode({
  id: "node-A",
  host: "0.0.0.0",
  port: 9101,
  discoveryPort: 43221,
  negentropicIndex: 0.8,
});

// node B
const nodeB = new QWormholeNode({
  id: "node-B",
  host: "0.0.0.0",
  port: 9102,
  discoveryPort: 43221, // same UDP port
  negentropicIndex: 0.65,
});

[nodeA, nodeB].forEach((n) => {
  n.on("peer:discovered", (p) => {
    console.log(`[${n.cfg.id}] discovered peer:`, p.id, p.address, "N=", p.negentropicIndex);
  });
});

(async () => {
  try {
  await nodeA.start();
  await nodeB.start();
  console.log("Both nodes started. They should discover each other via UDP.");

  // Let them run for a while to discover each other
  setTimeout(async () => {
    console.log("Stopping nodes...");
    await nodeA.stop();
    await nodeB.stop();
    console.log("Nodes stopped.");
  }, 30000); // run for 30 seconds
  } catch (err) {
    console.error("Error starting nodes:", err);
  } finally {
    // Ensure nodes are stopped on error
    await nodeA.stop();
    await nodeB.stop();
  }
  // ensure nodes are stopped
  await nodeA.stop();
  await nodeB.stop();
  
  // Exit process
  process.exit(0);

})();
