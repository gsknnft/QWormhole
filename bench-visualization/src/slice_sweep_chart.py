import matplotlib.pyplot as plt
import pandas as pd

# Load the sweep results
csv_path = "slice_sweep_results.csv"
df = pd.read_csv(csv_path)

# Separate TS server and native server
ts = df[df['mode'] == 'ts-server']
native = df[df['mode'] == 'native-server']

fig, ax1 = plt.subplots(figsize=(10,6))

# Throughput
ax1.plot(ts['slice_size'], ts['throughput_msg_s'], 'o-', label='TS Throughput', color='blue')
ax1.plot(native['slice_size'], native['throughput_msg_s'], 's--', label='Native Throughput', color='green')
ax1.set_xlabel('Slice Size')
ax1.set_ylabel('Throughput (msg/s)', color='black')
ax1.tick_params(axis='y', labelcolor='black')

# GC ms (secondary axis)
ax2 = ax1.twinx()
ax2.plot(ts['slice_size'], ts['gc_ms'], 'o-', label='TS GC ms', color='red')
ax2.plot(native['slice_size'], native['gc_ms'], 's--', label='Native GC ms', color='orange')
ax2.set_ylabel('GC Time (ms)', color='black')
ax2.tick_params(axis='y', labelcolor='black')

# p99 delay (third axis, as points)
p99 = ax1.scatter(ts['slice_size'], ts['p99_delay_ms'], marker='x', color='purple', label='TS p99 Delay (ms)')
p99_native = ax1.scatter(native['slice_size'], native['p99_delay_ms'], marker='^', color='magenta', label='Native p99 Delay (ms)')

# Legends
lines, labels = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines + lines2 + [p99, p99_native], labels + labels2 + ['TS p99 Delay', 'Native p99 Delay'], loc='upper right')

plt.title('QWormhole Slice Sweep: Throughput, GC, p99 Delay vs Slice Size')
plt.tight_layout()
plt.savefig('slice_sweep_chart.png')
plt.show()
