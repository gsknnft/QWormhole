import csv
import matplotlib.pyplot as plt
import sys
from typing import List, Dict, Any
import numpy as np

# Usage: python plot_bench.py [--separate] <csv1> [<csv2> ...]
# If no files are passed, defaults to ./data/*.csv.

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

def plot_latency_throughput(ax, rows: List[Dict[str, Any]]) -> None:
    rows = sorted(rows, key=lambda r: (r.get("flushIntervalMs", 0), r.get("batchSize", 0)))
    batch_sizes = [r["batchSize"] for r in rows]
    p50 = [r["p50Ms"] for r in rows]
    p99 = [r["p99Ms"] for r in rows]
    throughput = [r["throughputMsgSec"] for r in rows]

    color = 'tab:blue'
    ax.set_xlabel('Batch Size')
    ax.set_ylabel('Latency (ms)', color=color)
    ax.plot(batch_sizes, p50, 'o-', label='p50', color=color)
    ax.plot(batch_sizes, p99, 'o--', label='p99', color='tab:orange')
    ax.tick_params(axis='y', labelcolor=color)
    ax.legend(loc='upper left')

    ax2 = ax.twinx()
    color = 'tab:green'
    ax2.set_ylabel('Throughput (msg/s)', color=color)
    ax2.plot(batch_sizes, throughput, 's--', label='Throughput', color=color)
    ax2.tick_params(axis='y', labelcolor=color)
    ax2.legend(loc='upper right')

    ax.set_title('Latency & Throughput by Batch Size')

def plot_latency_vs_throughput(ax, rows: List[Dict[str, Any]]) -> None:
    p99 = [r["p99Ms"] for r in rows]
    throughput = [r["throughputMsgSec"] for r in rows]
    batch_sizes = [r["batchSize"] for r in rows]
    backpressure = [r.get("serverBackpressure", 0) for r in rows]

    sc = ax.scatter(throughput, p99, c=backpressure, s=[b*6 for b in batch_sizes], cmap='viridis', alpha=0.85)
    for r, t, b in zip(rows, zip(throughput, p99), batch_sizes):
        ax.annotate(f"b{b}/f{r.get('flushIntervalMs', 0)}", t, textcoords="offset points", xytext=(6,4), fontsize=8)
    ax.set_xlabel('Throughput (msg/s)')
    ax.set_ylabel('p99 Latency (ms)')
    ax.set_title('Throughput vs p99 (size=batch, color=server backpressure)')
    cbar = plt.colorbar(sc, ax=ax)
    cbar.set_label('Server Backpressure Events')

def plot_backpressure_heatmap(ax, rows: List[Dict[str, Any]]) -> bool:
    batches = sorted({r["batchSize"] for r in rows})
    flushes = sorted({r.get("flushIntervalMs", 0) for r in rows})

    if len(batches) < 1 or len(flushes) < 2:
        # Not enough diversity to render a heatmap (needs both axes varied)
        return False

    grid = np.zeros((len(flushes), len(batches)))
    for i, f in enumerate(flushes):
        for j, b in enumerate(batches):
            match = next(
                (r for r in rows if r.get("flushIntervalMs", 0) == f and r["batchSize"] == b),
                None,
            )
            grid[i, j] = match.get("serverBackpressure", 0) if match else 0

    im = ax.imshow(grid, cmap="magma", origin="lower", aspect="auto")
    ax.set_xticks(range(len(batches)), batches)
    ax.set_yticks(range(len(flushes)), flushes)
    ax.set_xlabel("Batch Size")
    ax.set_ylabel("Flush Interval (ms)")
    ax.set_title("Server Backpressure (heatmap)")
    plt.colorbar(im, ax=ax, label="Backpressure Events")
    return True

import glob

if __name__ == "__main__":
    separate = False
    args = sys.argv[1:]
    if "--separate" in args:
        separate = True
        args = [a for a in args if a != "--separate"]

    if len(args) < 1:
        default_folder = "./data"
        files = glob.glob(f"{default_folder}/*.csv")
        if not files:
            print(f"No CSV files found in {default_folder}. Run a bench with --csv={default_folder}/bench-write.csv")
            sys.exit(1)
        print(f"Using CSVs from {default_folder}:", files)
    else:
        files = args

    rows = to_numeric(read_csvs(files))
    has_heatmap = len({r.get("flushIntervalMs", 0) for r in rows}) > 1

    if separate:
        plot_latency_throughput(plt.subplots()[1], rows)
        plt.tight_layout()
        plt.show()

        plot_latency_vs_throughput(plt.subplots()[1], rows)
        plt.tight_layout()
        plt.show()

        if has_heatmap:
            plot_backpressure_heatmap(plt.subplots()[1], rows)
            plt.tight_layout()
            plt.show()
    else:
        if has_heatmap:
            fig, axes = plt.subplots(1, 3, figsize=(15, 4))
            plot_latency_throughput(axes[0], rows)
            plot_latency_vs_throughput(axes[1], rows)
            plot_backpressure_heatmap(axes[2], rows)
        else:
            fig, axes = plt.subplots(1, 2, figsize=(12, 4))
            plot_latency_throughput(axes[0], rows)
            plot_latency_vs_throughput(axes[1], rows)
        fig.tight_layout()
        plt.show()
