import csv
import matplotlib.pyplot as plt
import sys
from typing import List, Dict, Any
import numpy as np

# Usage: python plot_bench.py <csv1> [<csv2> ...]
# Each CSV should have the header below and one or more lines of results.


# Match camelCase keys from bench-writev.ts output
CSV_HEADER = [
    "batchSize", "flushIntervalMs", "frames", "payloadBytes", "timeoutMs",
    "p50Ms", "p99Ms", "maxMs", "throughputMsgSec",
    "received", "dropped", "outstanding",
    "clientFlushes", "clientAvgBuffers", "clientMaxBuffers", "clientAvgBytes", "clientMaxBytes", "clientBackpressure",
    "serverFlushes", "serverAvgBuffers", "serverMaxBuffers", "serverAvgBytes", "serverMaxBytes", "serverBackpressure"
]

def read_csvs(files: List[str]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for fname in files:
        with open(fname, newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
    return rows

def to_numeric(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    numeric_rows: List[Dict[str, Any]] = []
    for row in rows:
        parsed = {}
        for key, value in row.items():
            if value is None:
                continue
            try:
                if "." in value:
                    parsed[key] = float(value)
                else:
                    parsed[key] = int(value)
            except (ValueError, TypeError):
                parsed[key] = value
        numeric_rows.append(parsed)
    return numeric_rows

def plot_latency_throughput(rows: List[Dict[str, Any]]) -> None:
    rows = sorted(rows, key=lambda r: (r.get("flushIntervalMs", 0), r.get("batchSize", 0)))
    batch_sizes = [r["batchSize"] for r in rows]
    flush_ms = [r.get("flushIntervalMs", 0) for r in rows]
    p50 = [r["p50Ms"] for r in rows]
    p99 = [r["p99Ms"] for r in rows]
    throughput = [r["throughputMsgSec"] for r in rows]

    fig, ax1 = plt.subplots()
    color = 'tab:blue'
    ax1.set_xlabel('Batch Size')
    ax1.set_ylabel('Latency (ms)', color=color)
    ax1.plot(batch_sizes, p50, 'o-', label='p50', color=color)
    ax1.plot(batch_sizes, p99, 'o--', label='p99', color='tab:orange')
    ax1.tick_params(axis='y', labelcolor=color)
    ax1.legend(loc='upper left')

    ax2 = ax1.twinx()
    color = 'tab:green'
    ax2.set_ylabel('Throughput (msg/s)', color=color)
    ax2.plot(batch_sizes, throughput, 's--', label='Throughput', color=color)
    ax2.tick_params(axis='y', labelcolor=color)
    ax2.legend(loc='upper right')

    plt.title('QWormhole TS/writev: Latency & Throughput by Batch Size')
    fig.tight_layout()
    plt.show()

def plot_latency_vs_throughput(rows: List[Dict[str, Any]]) -> None:
    p99 = [r["p99Ms"] for r in rows]
    throughput = [r["throughputMsgSec"] for r in rows]
    batch_sizes = [r["batchSize"] for r in rows]
    backpressure = [r.get("serverBackpressure", 0) for r in rows]

    plt.figure()
    sc = plt.scatter(throughput, p99, c=backpressure, s=[b*4 for b in batch_sizes], cmap='viridis', alpha=0.8)
    plt.xlabel('Throughput (msg/s)')
    plt.ylabel('p99 Latency (ms)')
    plt.title('Latency vs Throughput (size=batch, color=server backpressure)')
    cbar = plt.colorbar(sc)
    cbar.set_label('Server Backpressure Events')
    for t, b in zip(zip(throughput, p99), batch_sizes):
        plt.annotate(f"b{b}", t, textcoords="offset points", xytext=(5,5), fontsize=8)
    plt.tight_layout()
    plt.show()

def plot_backpressure_heatmap(rows: List[Dict[str, Any]]) -> None:
    batches = sorted({r["batchSize"] for r in rows})
    flushes = sorted({r.get("flushIntervalMs", 0) for r in rows})

    if len(batches) < 1 or len(flushes) < 2:
        # Not enough diversity to render a heatmap (needs both axes varied)
        return

    grid = np.zeros((len(flushes), len(batches)))
    for i, f in enumerate(flushes):
        for j, b in enumerate(batches):
            match = next(
                (r for r in rows if r.get("flushIntervalMs", 0) == f and r["batchSize"] == b),
                None,
            )
            grid[i, j] = match.get("serverBackpressure", 0) if match else 0

    plt.figure()
    im = plt.imshow(grid, cmap="magma", origin="lower", aspect="auto")
    plt.xticks(range(len(batches)), batches)
    plt.yticks(range(len(flushes)), flushes)
    plt.xlabel("Batch Size")
    plt.ylabel("Flush Interval (ms)")
    plt.title("Server Backpressure Heatmap (lower is better)")
    plt.colorbar(im, label="Backpressure Events")
    plt.tight_layout()
    plt.show()

import glob

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Default to ./csvs/*.csv if no files specified
        default_folder = "./data"
        files = glob.glob(f"{default_folder}/*.csv")
        if not files:
            print(f"No CSV files found in {default_folder}. Run a bench with --csv={default_folder}/bench-write.csv")
            sys.exit(1)
        print(f"Using CSVs from {default_folder}:", files)
    else:
        files = sys.argv[1:]
    rows = to_numeric(read_csvs(files))
    plot_latency_throughput(rows)
    plot_latency_vs_throughput(rows)
    plot_backpressure_heatmap(rows)
