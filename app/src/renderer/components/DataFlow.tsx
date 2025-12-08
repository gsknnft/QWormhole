/**
 * LiquidityFlow - Pool Liquidity Visualization
 * 
 * Shows real-time liquidity dynamics and swap efficiency
 */

import React, { useEffect, useRef } from 'react';
import { SigilMetrics } from 'shared';

export interface DataContext extends FlowData {
  timestamp: number;
  value: number;
  probabilityDistribution?: number[];
  id?: string;
  weight?: number;
  trustLevel?: number;
  type?: string;
  secure?: boolean;
  sigilnetMetrics?: SigilMetrics;
  payload?: Record<string, any>;
  tags?: string[];
}
interface FlowData {
  dataFlowIn: number;
  dataFlowOut: number;
  payloadSize: number;
  efficiency: number;
  impactRatio: number;
  flowRate?: number;
  flowCapacity?: number;
  flowUtilization?: number;
  flowEfficiency?: number;
  flowImpactRatio?: number;
}
interface FlowProps {
  dataFlowIn: number;
  dataFlowOut: number;
  payloadSize: number;
  efficiency: number;
  impactRatio: number;
  poolName?: string;
}
/**
 * DataFlow - Data Stream Visualization
 * 
 * Shows real-time data dynamics and transfer efficiency
 */

export const DataFlow: React.FC<FlowProps> = ({
  dataFlowIn,
  dataFlowOut,
  payloadSize,
  efficiency,
  impactRatio,
  poolName = 'Node'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    drawLiquidityFlow();
  }, [dataFlowIn, dataFlowOut, payloadSize, efficiency]);

  const drawLiquidityFlow = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Draw liquidity pools
    const poolRadius = 80;
    const poolSpacing = 250;

    // Input pool (left)
    drawPool(ctx, centerX - poolSpacing / 2, centerY, poolRadius, dataFlowIn, '#4a9eff', 'INPUT');

    // Output pool (right)
    drawPool(ctx, centerX + poolSpacing / 2, centerY, poolRadius, dataFlowOut, '#ff9a4a', 'OUTPUT');

    // Draw flow arrow
    drawFlowArrow(
      ctx,
      centerX - poolSpacing / 2 + poolRadius,
      centerY,
      centerX + poolSpacing / 2 - poolRadius,
      centerY,
      payloadSize,
      efficiency
    );

    // Draw efficiency curve
    drawEfficiencyCurve(ctx, width, height, efficiency, impactRatio);
  };

  const drawPool = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    reserve: number,
    color: string,
    label: string
  ) => {
    // Outer glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;

    // Pool circle
    ctx.fillStyle = color + '33';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Fill level based on reserve
    const fillRadius = radius * 0.7;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, fillRadius);
    gradient.addColorStop(0, color + 'ff');
    gradient.addColorStop(1, color + '88');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, fillRadius, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - radius - 15);

    // Reserve amount
    ctx.font = '12px monospace';
    ctx.fillText(formatAmount(reserve), x, y + radius + 25);

    // Animated ripples
    for (let i = 0; i < 3; i++) {
      const rippleRadius = fillRadius + (Date.now() % 2000) / 2000 * 30 + i * 15;
      ctx.strokeStyle = color + Math.floor((1 - i / 3) * 128).toString(16).padStart(2, '0');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, rippleRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const drawFlowArrow = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    amount: number,
    efficiency: number
  ) => {
    // Arrow thickness based on amount
    const thickness = Math.min(20, Math.max(3, amount / 1000));

    // Color based on efficiency
    const color = efficiency > 95 ? '#00ff00' :
                  efficiency > 90 ? '#88ff00' :
                  efficiency > 80 ? '#ffaa00' : '#ff4444';

    // Arrow shaft
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.setLineDash([]);
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Animated particles
    const numParticles = 5;
    for (let i = 0; i < numParticles; i++) {
      const progress = ((Date.now() % 2000) / 2000 + i / numParticles) % 1;
      const px = x1 + (x2 - x1) * progress;
      const py = y1 + (y2 - y1) * progress;

      ctx.fillStyle = color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Arrow head
    const arrowSize = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - arrowSize * Math.cos(angle - Math.PI / 6),
      y2 - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - arrowSize * Math.cos(angle + Math.PI / 6),
      y2 - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Amount label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      formatAmount(amount),
      (x1 + x2) / 2,
      (y1 + y2) / 2 - 20
    );

    // Efficiency label
    ctx.fillStyle = color;
    ctx.font = '12px monospace';
    ctx.fillText(
      `${efficiency.toFixed(2)}% Efficiency`,
      (x1 + x2) / 2,
      (y1 + y2) / 2 + 5
    );
  };

  const drawEfficiencyCurve = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    currentEfficiency: number,
    impactRatio: number
  ) => {
    const startX = 50;
    const startY = height - 100;
    const curveWidth = width - 100;
    const curveHeight = 60;

    // Background
    ctx.fillStyle = 'rgba(20, 20, 20, 0.8)';
    ctx.fillRect(startX - 10, startY - curveHeight - 10, curveWidth + 20, curveHeight + 40);

    // Draw efficiency curve
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= 100; i++) {
      const x = startX + (i / 100) * curveWidth;
      const t = i / 100;
      
      // Efficiency typically drops with larger trades
      const efficiency = 100 - (30 * Math.pow(t, 2));
      const y = startY - (efficiency / 100) * curveHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Mark current position
    const currentX = startX + impactRatio * curveWidth;
    const currentY = startY - (currentEfficiency / 100) * curveHeight;

    ctx.fillStyle = '#00ff00';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ff00';
    ctx.beginPath();
    ctx.arc(currentX, currentY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Efficiency vs Impact', startX, startY + 25);
    
    ctx.fillStyle = '#888888';
    ctx.fillText('0%', startX, startY + 15);
    ctx.textAlign = 'right';
    ctx.fillText('High Impact →', startX + curveWidth, startY + 15);
  };

  const getImpactColor = (ratio: number): string => {
    if (ratio < 0.05) return 'text-green-500';
    if (ratio < 0.10) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getEfficiencyColor = (eff: number): string => {
    if (eff > 95) return 'text-green-500';
    if (eff > 90) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="data-flow bg-gray-900 border border-blue-500 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-blue-400 text-xl font-bold">{poolName} DATA STREAM</h2>
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-gray-500">Impact:</span>
            <span className={`ml-2 font-bold ${getImpactColor(impactRatio)}`}>
              {(impactRatio * 100).toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-gray-500">Efficiency:</span>
            <span className={`ml-2 font-bold ${getEfficiencyColor(efficiency)}`}>
              {efficiency.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} width={800} height={400} className="w-full border border-blue-900 rounded" />

      <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
        <div className="bg-blue-950 p-3 rounded">
          <div className="text-gray-400 text-xs">DATA IN</div>
          <div className="text-blue-400 text-lg font-bold">{formatAmount(dataFlowIn)}</div>
        </div>
        <div className="bg-purple-950 p-3 rounded">
          <div className="text-gray-400 text-xs">PAYLOAD SIZE</div>
          <div className="text-purple-400 text-lg font-bold">{formatAmount(payloadSize)}</div>
        </div>
        <div className="bg-orange-950 p-3 rounded">
          <div className="text-gray-400 text-xs">DATA OUT</div>
          <div className="text-orange-400 text-lg font-bold">{formatAmount(dataFlowOut)}</div>
        </div>
      </div>
    </div>
  );
};

function formatAmount(amount: number): string {
  if (amount >= 1000000000) {
    return (amount / 1000000000).toFixed(2) + 'B';
  }
  if (amount >= 1000000) {
    return (amount / 1000000).toFixed(2) + 'M';
  }
  if (amount >= 1000) {
    return (amount / 1000).toFixed(2) + 'K';
  }
  return amount.toFixed(2);
}
