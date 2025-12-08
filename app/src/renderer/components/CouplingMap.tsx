import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { SimulationState } from '../types';
import { fromFixedPoint } from '../../shared/fixedPoint';
interface CouplingMapProps {
  state: SimulationState;
}

interface D3Node extends d3.SimulationNodeDatum {
  id: number;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: number | D3Node;
  target: number | D3Node;
  negentropy: number;
  policy: string;
  loss: number;
  regime?: 'chaos' | 'transitional' | 'coherent';
}

export const CouplingMap: React.FC<CouplingMapProps> = ({ state }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const positionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (!svgRef.current || !state) return;

    const width = 600;
    const height = 400;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Create nodes
    const nodes: D3Node[] = Array.from({ length: state.nodes }, (_, i) => {
      const prior = positionsRef.current.get(i);
      return prior
        ? { id: i, x: prior.x, y: prior.y }
        : { id: i, x: width / 2 + Math.random() * 40 - 20, y: height / 2 + Math.random() * 40 - 20 };
    });

    // Create links with metrics
    const links: D3Link[] = state.edges.map(edge => {
      const key = `${edge.source}-${edge.target}`;
      const edgeMetrics = state.edgeMetrics.get(key);
      const negentropy = edgeMetrics?.negentropy
        ? fromFixedPoint(edgeMetrics.negentropy)
        : 0;
      const loss = edgeMetrics?.loss
        ? fromFixedPoint(edgeMetrics.loss)
        : 0;
      const clampedLoss = Math.min(1, Math.max(0, loss));
      return {
        source: edge.source,
        target: edge.target,
        negentropy,
        policy: edgeMetrics?.policy || 'balanced',
        loss: clampedLoss,
        regime: edgeMetrics?.regime as D3Link['regime'],
      };
    });

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .alpha(0.35)
      .alphaDecay(0.08)
      .velocityDecay(0.5)
      .force('link', d3.forceLink<D3Node, D3Link>(links).id((d) => d.id).distance(120).strength(0.65))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(32));

    // Add arrow markers
    svg.append('defs').selectAll('marker')
      .data(['macro', 'defensive', 'balanced'])
      .enter().append('marker')
      .attr('id', d => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', d => 
        d === 'macro' ? '#00ff88' : 
        d === 'defensive' ? '#ff4444' : 
        '#ffaa00'
      );

    // Add links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', d => {
        if (d.regime === 'coherent') return '#00c6ff';
        if (d.regime === 'chaos') return '#ff6b6b';
        if (d.regime === 'transitional') return '#ffaa00';
        return d.policy === 'macro' ? '#00ff88' : d.policy === 'defensive' ? '#ff4444' : '#ffaa00';
      })
      .attr('stroke-width', d => (1 + d.negentropy * 3) * (1 - d.loss * 0.5))
      .attr('stroke-opacity', d => 0.25 + (1 - d.loss) * 0.55)
      .attr('stroke-dasharray', d => d.loss > 0.35 || d.regime === 'chaos' ? '6 4' : '0')
      .attr('marker-end', d => `url(#arrow-${d.policy})`);

    // Packet-like flow indicators
    const packetProgress = links.map(() => Math.random());
    const packetSpeed = links.map(
      (d) => Math.max(
        0.001,
        (0.006 + d.negentropy * 0.012 + (d.policy === 'macro' ? 0.004 : 0)) *
          (1 - d.loss * 0.6),
      ),
    );

    const packets = svg.append('g')
      .attr('class', 'coupling-packets')
      .selectAll('circle')
      .data(links)
      .enter().append('circle')
      .attr('r', d => 3 + d.negentropy * 4)
      .attr('fill', d => 
        d.policy === 'macro' ? '#00ff88' : 
        d.policy === 'defensive' ? '#ff4444' : 
        '#ffaa00'
      )
      .attr('opacity', d => (0.3 + d.negentropy * 0.5) * (1 - d.loss * 0.7));

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Create drag behavior
    function drag() {
      return d3.drag<SVGCircleElement, D3Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }

    // Add nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', 15)
      .attr('fill', '#4dabf7')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .call(drag() as any);

    // Add labels
    const labels = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .text(d => d.id)
      .attr('font-size', '12px')
      .attr('fill', '#fff')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em');

    const updatePackets = () => {
      packets
        .attr('cx', (d, i) => {
          const progress = packetProgress[i];
          const source = d.source as D3Node;
          const target = d.target as D3Node;
          const sx = source.x ?? width / 2;
          const sy = source.y ?? height / 2;
          const tx = target.x ?? width / 2;
          const ty = target.y ?? height / 2;
          return sx + (tx - sx) * progress;
        })
        .attr('cy', (d, i) => {
          const progress = packetProgress[i];
          const source = d.source as D3Node;
          const target = d.target as D3Node;
          const sx = source.x ?? width / 2;
          const sy = source.y ?? height / 2;
          const tx = target.x ?? width / 2;
          const ty = target.y ?? height / 2;
          return sy + (ty - sy) * progress;
        });
    };

    const flowTimer = d3.timer(() => {
      links.forEach((_, idx) => {
        packetProgress[idx] = (packetProgress[idx] + packetSpeed[idx]) % 1;
      });
      updatePackets();
    });

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as D3Node).x!)
        .attr('y1', d => (d.source as D3Node).y!)
        .attr('x2', d => (d.target as D3Node).x!)
        .attr('y2', d => (d.target as D3Node).y!);

      node
        .attr('cx', d => d.x!)
        .attr('cy', d => d.y!);

      labels
        .attr('x', d => d.x!)
        .attr('y', d => d.y!);

      updatePackets();

      // Persist node positions to reduce collapse on next state update
      nodes.forEach(n => {
        if (n.x !== undefined && n.y !== undefined) {
          positionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      });
    });

    return () => {
      simulation.stop();
      flowTimer.stop();
    };
  }, [state]);

  return (
    <div className="coupling-map">
      <svg ref={svgRef}></svg>
      <div className="legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#00ff88' }}></span>
          <span>Macro (N &gt; 0.8)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#ffaa00' }}></span>
          <span>Balanced (0.3 ≤ N ≤ 0.8)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#ff4444' }}></span>
          <span>Defensive (N &lt; 0.3)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#888', border: '1px dashed #888' }}></span>
          <span>Dashed = high loss/attenuation</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#00c6ff' }}></span>
          <span>Regime: Coherent</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#ffaa00' }}></span>
          <span>Regime: Transitional</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#ff6b6b', border: '1px dashed #ff6b6b' }}></span>
          <span>Regime: Chaos</span>
        </div>
      </div>
    </div>
  );
};
