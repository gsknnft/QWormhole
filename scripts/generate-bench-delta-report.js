const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);

const readArg = name => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const rawPath = readArg("--raw");
const structurePath = readArg("--structure");
const outPath = readArg("--out");
const title = readArg("--title") || "QWormhole Bench Delta Report";

if (!rawPath || !structurePath || !outPath) {
  console.error(
    "usage: node scripts/generate-bench-delta-report.js --raw <raw.jsonl> --structure <structure.jsonl> --out <report.md> [--title <title>]",
  );
  process.exit(1);
}

const round = (value, digits = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined;

const fmt = (value, digits = 2, fallback = "-") =>
  Number.isFinite(value) ? Number(value).toFixed(digits) : fallback;

const pct = (value, digits = 1) =>
  Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${Number(value).toFixed(digits)}%`
    : "-";

const readJsonl = filePath => {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const latestByScenario = records => {
  const latest = new Map();
  for (const record of records) {
    if (!record || !record.scenario) continue;
    latest.set(record.scenario, record);
  }
  return latest;
};

const rangePercent = stats => {
  const best = stats?.best;
  const worst = stats?.worst;
  const avg = stats?.avg;
  if (!Number.isFinite(best) || !Number.isFinite(worst) || !Number.isFinite(avg) || avg === 0) {
    return undefined;
  }
  return ((best - worst) / avg) * 100;
};

const deltaPercent = (raw, structure) => {
  if (!Number.isFinite(raw) || !Number.isFinite(structure) || raw === 0) return undefined;
  return ((structure - raw) / raw) * 100;
};

const varianceReductionPercent = (rawRange, structureRange) => {
  if (!Number.isFinite(rawRange) || !Number.isFinite(structureRange) || rawRange === 0) {
    return undefined;
  }
  return ((rawRange - structureRange) / rawRange) * 100;
};

const classifyScenario = row => {
  const medianDelta = row.medianDelta;
  const varianceReduction = row.varianceReduction;
  const nativeInvolved = row.scenario.includes("native");

  if (Number.isFinite(medianDelta) && medianDelta <= -5) {
    return "overhead";
  }
  if (
    Number.isFinite(medianDelta) &&
    medianDelta >= 10 &&
    nativeInvolved &&
    Number.isFinite(varianceReduction) &&
    varianceReduction > 0
  ) {
    return "native-benefit+stabilized";
  }
  if (Number.isFinite(medianDelta) && medianDelta >= 10 && nativeInvolved) {
    return "native-benefit";
  }
  if (
    Number.isFinite(medianDelta) &&
    medianDelta > -5 &&
    medianDelta < 5 &&
    Number.isFinite(varianceReduction) &&
    varianceReduction > 0
  ) {
    return "neutral+stabilized";
  }
  if (Number.isFinite(medianDelta) && medianDelta > -5 && medianDelta < 5) {
    return "neutral";
  }
  if (Number.isFinite(varianceReduction) && varianceReduction > 0) {
    return "variance-improved";
  }
  return "mixed";
};

const rawRecords = latestByScenario(readJsonl(rawPath));
const structureRecords = latestByScenario(readJsonl(structurePath));

const scenarios = [...rawRecords.keys()].filter(key => structureRecords.has(key));

const rows = scenarios
  .map(scenario => {
    const raw = rawRecords.get(scenario);
    const structure = structureRecords.get(scenario);
    if (raw?.skipped || structure?.skipped) return null;

    const rawMedian = raw?.repeatStats?.msgsPerSec?.median ?? raw?.msgsPerSec;
    const structureMedian =
      structure?.repeatStats?.msgsPerSec?.median ?? structure?.msgsPerSec;
    const rawAvg = raw?.repeatStats?.msgsPerSec?.avg;
    const structureAvg = structure?.repeatStats?.msgsPerSec?.avg;
    const rawRange = rangePercent(raw?.repeatStats?.msgsPerSec);
    const structureRange = rangePercent(structure?.repeatStats?.msgsPerSec);

    return {
      scenario,
      rawMedian,
      structureMedian,
      medianDelta: deltaPercent(rawMedian, structureMedian),
      rawAvg,
      structureAvg,
      avgDelta: deltaPercent(rawAvg, structureAvg),
      rawRange,
      structureRange,
      varianceReduction: varianceReductionPercent(rawRange, structureRange),
      classification: undefined,
    };
  })
  .filter(Boolean)
  .map(row => ({
    ...row,
    classification: classifyScenario(row),
  }));

const lines = [
  `# ${title}`,
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Inputs",
  "",
  "```json",
  JSON.stringify(
    {
      rawPath,
      structurePath,
      scenarios: rows.length,
    },
    null,
    2,
  ),
  "```",
  "",
  "## Summary",
  "",
  "| Scenario | Raw Median Msg/s | Structure Median Msg/s | Median Delta | Raw Avg Msg/s | Structure Avg Msg/s | Avg Delta | Raw Range % | Structure Range % | Range Reduction | Class |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    row =>
      `| ${row.scenario} | ${fmt(row.rawMedian, 0)} | ${fmt(row.structureMedian, 0)} | ${pct(
        row.medianDelta,
      )} | ${fmt(row.rawAvg, 0)} | ${fmt(row.structureAvg, 0)} | ${pct(
        row.avgDelta,
      )} | ${fmt(row.rawRange, 1)} | ${fmt(row.structureRange, 1)} | ${pct(
        row.varianceReduction,
      )} | ${row.classification} |`,
  ),
  "",
  "## Classification",
  "",
  "- `overhead`: structure materially slower on throughput.",
  "- `native-benefit`: native-involved lane with materially higher throughput under structure.",
  "- `native-benefit+stabilized`: native-involved lane with materially higher throughput and reduced normalized range.",
  "- `neutral`: throughput delta within about +/-5%.",
  "- `neutral+stabilized`: near-neutral throughput with reduced normalized range.",
  "- `variance-improved`: throughput story is mixed, but normalized range improved.",
  "- `mixed`: no strong signal under the current thresholds.",
  "",
  "## Interpretation",
  "",
];

const pureTs = rows.find(row => row.scenario === "ts-server+ts");
const nativeHybrid = rows.filter(
  row => row.scenario !== "ts-server+ts" && row.scenario.includes("native"),
);

if (pureTs?.medianDelta !== undefined) {
  lines.push(
    `- \`ts-server+ts\`: structure is ${pureTs.medianDelta >= 0 ? "faster" : "slower"} by ${pct(
      pureTs.medianDelta,
    )} on median throughput.`,
  );
}

if (nativeHybrid.length > 0) {
  const avgNativeDelta =
    nativeHybrid.reduce((sum, row) => sum + (row.medianDelta ?? 0), 0) /
    nativeHybrid.length;
  lines.push(
    `- native-involved lanes average ${pct(round(avgNativeDelta, 1), 1)} median throughput delta under structure.`,
  );
}

lines.push(
  "- Range reduction is based on normalized throughput range `(best - worst) / avg` from the repeat summary.",
  "- This report compares the latest JSONL entry per scenario from each file; rerun both lanes back-to-back for the cleanest pairing.",
  "",
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`[bench] delta report written to ${outPath}`);
