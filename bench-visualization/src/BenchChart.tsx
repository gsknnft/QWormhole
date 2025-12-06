import { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';

interface BenchDataRow {
  slice_size: number;
  mode: string;
  throughput_msg_s: number;
  gc_ms: number;
  p99_delay_ms: number;
  [key: string]: string | number;
}

function parseCSV(csv: string): BenchDataRow[] {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const obj: {[key: string]: string | number} = {};
    line.split(',').forEach((val, i) => {
      obj[headers[i]] = isNaN(Number(val)) ? val : Number(val);
    });
    return obj as BenchDataRow;
  });
}

export default function BenchChart() {
  const [data, setData] = useState<BenchDataRow[]>([]);

  useEffect(() => {
    fetch('/bench-visualization/slice_sweep_results.csv')
      .then(res => res.text())
      .then(csv => setData(parseCSV(csv)));
  }, []);

  if (!data.length) return <div>Loading...</div>;

  const slices = [...new Set(data.map(d => d.slice_size))];
  const ts = data.filter(d => d.mode === 'ts-server');
  const native = data.filter(d => d.mode === 'native-server');

  return (
    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 32, boxShadow: '0 2px 16px #0001', maxWidth: 1100, margin: '32px auto' }}>
      <h2 style={{ fontWeight: 700, fontSize: 28, marginBottom: 8, color: '#1e293b' }}>QWormhole Slice Sweep Dashboard</h2>
      <Plot
        data={[
          // Throughput (left axis)
          {
            x: slices, y: ts.map(d => d.throughput_msg_s), name: 'TS Throughput', type: 'scatter', mode: 'lines+markers',
            line: {color: '#2563eb', width: 3}, marker: {size: 10}, yaxis: 'y1',
            hovertemplate: 'TS Throughput: %{y} msg/s<br>Slice: %{x}<extra></extra>'
          },
          {
            x: slices, y: native.map(d => d.throughput_msg_s), name: 'Native Throughput', type: 'scatter', mode: 'lines+markers',
            line: {color: '#059669', width: 3, dash: 'dot'}, marker: {size: 10}, yaxis: 'y1',
            hovertemplate: 'Native Throughput: %{y} msg/s<br>Slice: %{x}<extra></extra>'
          },
          // GC ms (right axis)
          {
            x: slices, y: ts.map(d => d.gc_ms), name: 'TS GC ms', type: 'scatter', mode: 'lines+markers',
            line: {color: '#f43f5e', width: 2}, marker: {size: 8}, yaxis: 'y2',
            hovertemplate: 'TS GC: %{y} ms<br>Slice: %{x}<extra></extra>'
          },
          {
            x: slices, y: native.map(d => d.gc_ms), name: 'Native GC ms', type: 'scatter', mode: 'lines+markers',
            line: {color: '#f59e42', width: 2, dash: 'dot'}, marker: {size: 8}, yaxis: 'y2',
            hovertemplate: 'Native GC: %{y} ms<br>Slice: %{x}<extra></extra>'
          },
          // p99 delay (right axis, markers)
          {
            x: slices, y: ts.map(d => d.p99_delay_ms), name: 'TS p99 Delay (ms)', type: 'scatter', mode: 'markers',
            marker: {color: '#a21caf', symbol: 'x', size: 16, line: {width: 2, color: '#a21caf'}}, yaxis: 'y3',
            hovertemplate: 'TS p99 Delay: %{y} ms<br>Slice: %{x}<extra></extra>'
          },
          {
            x: slices, y: native.map(d => d.p99_delay_ms), name: 'Native p99 Delay (ms)', type: 'scatter', mode: 'markers',
            marker: {color: '#eab308', symbol: 'triangle-up', size: 16, line: {width: 2, color: '#eab308'}}, yaxis: 'y3',
            hovertemplate: 'Native p99 Delay: %{y} ms<br>Slice: %{x}<extra></extra>'
          },
          // Flush count (bar, left axis, faded)
          {
            x: slices, y: ts.map(d => (d as any).flush_count), name: 'TS Flushes', type: 'bar',
            marker: {color: 'rgba(37,99,235,0.15)'}, yaxis: 'y1', opacity: 0.5,
            hovertemplate: 'TS Flushes: %{y}<br>Slice: %{x}<extra></extra>'
          },
          {
            x: slices, y: native.map(d => (d as any).flush_count), name: 'Native Flushes', type: 'bar',
            marker: {color: 'rgba(5,150,105,0.15)'}, yaxis: 'y1', opacity: 0.5,
            hovertemplate: 'Native Flushes: %{y}<br>Slice: %{x}<extra></extra>'
          },
          // ELU percent (dashed line, right axis)
          {
            x: slices, y: ts.map(d => (d as any).elu_percent), name: 'TS ELU %', type: 'scatter', mode: 'lines+markers',
            line: {color: '#6366f1', width: 2, dash: 'dash'}, marker: {size: 8}, yaxis: 'y2',
            hovertemplate: 'TS ELU: %{y}%<br>Slice: %{x}<extra></extra>'
          },
          {
            x: slices, y: native.map(d => (d as any).elu_percent), name: 'Native ELU %', type: 'scatter', mode: 'lines+markers',
            line: {color: '#fbbf24', width: 2, dash: 'dash'}, marker: {size: 8}, yaxis: 'y2',
            hovertemplate: 'Native ELU: %{y}%<br>Slice: %{x}<extra></extra>'
          },
        ]}
        layout={{
          title: '',
          xaxis: {
            title: 'Slice Size',
            tickmode: 'array',
            tickvals: slices,
            gridcolor: '#e5e7eb',
            zeroline: false,
            showline: true,
            linecolor: '#94a3b8',
            linewidth: 2,
            mirror: true,
          },
          yaxis: {
            title: 'Throughput (msg/s) / Flushes',
            titlefont: {color: '#2563eb'},
            tickfont: {color: '#2563eb'},
            gridcolor: '#e0e7ef',
            zeroline: false,
            showline: true,
            linecolor: '#2563eb',
            linewidth: 2,
            mirror: true,
          },
          yaxis2: {
            title: 'GC (ms) / ELU (%)',
            titlefont: {color: '#f43f5e'},
            tickfont: {color: '#f43f5e'},
            overlaying: 'y',
            side: 'right',
            gridcolor: '#f3f4f6',
            showgrid: false,
            zeroline: false,
            showline: true,
            linecolor: '#f43f5e',
            linewidth: 2,
            mirror: true,
          },
          yaxis3: {
            title: 'p99 Delay (ms)',
            titlefont: {color: '#a21caf'},
            tickfont: {color: '#a21caf'},
            overlaying: 'y',
            side: 'right',
            position: 1,
            anchor: 'x',
            showgrid: false,
            zeroline: false,
            showline: true,
            linecolor: '#a21caf',
            linewidth: 2,
            mirror: true,
            offset: 60,
          },
          legend: {orientation: 'h', y: 1.12, font: {size: 16}},
          margin: {t: 24, l: 60, r: 80, b: 60},
          plot_bgcolor: '#f8fafc',
          paper_bgcolor: '#f8fafc',
          hovermode: 'x unified',
        }}
        style={{width: '100%', height: '700px'}}
        config={{displayModeBar: true, responsive: true}}
      />
      <div style={{marginTop: 24, color: '#64748b', fontSize: 16}}>
        <b>Tips:</b> Hover for details. <b>Blue/Green</b>: Throughput, <b>Red/Orange</b>: GC, <b>Purple/Gold</b>: p99 delay, <b>Bars</b>: flushes, <b>Dashed</b>: ELU%.
      </div>
    </div>
  );
}
