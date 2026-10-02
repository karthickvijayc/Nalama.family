import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Target, 
  Calendar, 
  Footprints, 
  Activity, 
  Heart, 
  Scale, 
  Flame, 
  Moon, 
  CheckCircle2,
  Sparkles,
  Info
} from 'lucide-react';
import { TrendMetricType, TrendTimeframe, HealthLogEntry, UserProfile, TrendDataPoint } from '../types';
import { generateTrendMetrics } from '../lib/trendGenerator';

interface TrendModalProps {
  metric: TrendMetricType;
  logs: HealthLogEntry[];
  userProfile?: UserProfile | null;
  onClose: () => void;
}

export default function TrendModal({ metric, logs, userProfile, onClose }: TrendModalProps) {
  const [timeframe, setTimeframe] = useState<TrendTimeframe>('month');
  const [hoveredPoint, setHoveredPoint] = useState<TrendDataPoint | null>(null);

  // Compute trend metrics and data points
  const trendData = useMemo(() => {
    return generateTrendMetrics(metric, timeframe, logs, userProfile);
  }, [metric, timeframe, logs, userProfile]);

  const {
    title,
    unit,
    currentFormatted,
    averageFormatted,
    minFormatted,
    maxFormatted,
    targetFormatted,
    deltaText,
    deltaPositive,
    points,
    hasPregeneratedData
  } = trendData;

  // Icon mapping
  const getMetricIcon = () => {
    switch (metric) {
      case 'steps': return <Footprints size={24} className="text-tree-600" />;
      case 'active_time': return <Activity size={24} className="text-blue-500" />;
      case 'heart_rate': return <Heart size={24} className="text-rose-500" />;
      case 'weight': return <Scale size={24} className="text-teal-600" />;
      case 'calories': return <Flame size={24} className="text-orange-500" />;
      case 'sleep': return <Moon size={24} className="text-canopy-600" />;
      case 'tasks': return <CheckCircle2 size={24} className="text-purple-500" />;
    }
  };

  const getMetricTheme = () => {
    switch (metric) {
      case 'steps': return { stroke: '#15803d', fill: '#86efac', gradientFrom: '#15803d', gradientTo: '#22c55e' };
      case 'active_time': return { stroke: '#2563eb', fill: '#93c5fd', gradientFrom: '#2563eb', gradientTo: '#3b82f6' };
      case 'heart_rate': return { stroke: '#e11d48', fill: '#fda4af', gradientFrom: '#e11d48', gradientTo: '#f43f5e' };
      case 'weight': return { stroke: '#0d9488', fill: '#99f6e4', gradientFrom: '#0d9488', gradientTo: '#14b8a6' };
      case 'calories': return { stroke: '#ea580c', fill: '#fdba74', gradientFrom: '#ea580c', gradientTo: '#f97316' };
      case 'sleep': return { stroke: '#4f46e5', fill: '#c7d2fe', gradientFrom: '#4f46e5', gradientTo: '#6366f1' };
      case 'tasks': return { stroke: '#9333ea', fill: '#d8b4fe', gradientFrom: '#9333ea', gradientTo: '#a855f7' };
    }
  };

  const theme = getMetricTheme();

  // SVG Chart Geometry
  const svgWidth = 520;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 35;
  const chartWidth = svgWidth - padLeft - padRight;
  const chartHeight = svgHeight - padTop - padBottom;

  // Min and max bounds for scaling
  const values = points.map(p => p.value);
  const targetVal = trendData.targetValue || 0;
  const rawMin = Math.min(...values, targetVal > 0 ? targetVal : Infinity);
  const rawMax = Math.max(...values, targetVal > 0 ? targetVal : -Infinity);
  
  // Add 10% breathing room to Y bounds
  const span = Math.max(1, rawMax - rawMin);
  const yMin = Math.max(0, Math.floor(rawMin - span * 0.1));
  const yMax = Math.ceil(rawMax + span * 0.15);
  const yRange = Math.max(1, yMax - yMin);

  const getX = (index: number) => {
    if (points.length <= 1) return padLeft + chartWidth / 2;
    return padLeft + (index / (points.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    return padTop + chartHeight - ((val - yMin) / yRange) * chartHeight;
  };

  // Generate smooth cubic bezier SVG path
  const curvePath = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${getX(0)} ${getY(points[0].value)}`;

    const coords = points.map((p, i) => ({ x: getX(i), y: getY(p.value) }));
    let d = `M ${coords[0].x} ${coords[0].y}`;

    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }, [points, yMin, yRange]);

  // Area path for gradient fill under the curve
  const areaPath = useMemo(() => {
    if (!curvePath || points.length === 0) return '';
    const lastX = getX(points.length - 1);
    const firstX = getX(0);
    const bottomY = padTop + chartHeight;
    return `${curvePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [curvePath, points]);

  // Y-axis target line
  const targetY = trendData.targetValue ? getY(trendData.targetValue) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="shrink-0 p-5 pb-3 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-stone-100 border border-stone-200">
              {getMetricIcon()}
            </div>
            <div>
              <h2 className="text-lg font-black text-stone-900">{title}</h2>
              <p className="text-xs text-stone-500 font-medium">Historical Trends & Target Analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 min-h-0">
          
          {/* Timeframe Selector Tabs */}
          <div className="flex p-1 bg-stone-100/90 rounded-2xl border border-stone-200/80">
            {[
              { id: 'month', label: 'This Month' },
              { id: '3m', label: '3 Months' },
              { id: '6m', label: '6 Months' },
              { id: '12m', label: '12 Months' }
            ].map((tab) => {
              const active = timeframe === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTimeframe(tab.id as TrendTimeframe)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    active 
                      ? 'bg-white text-stone-900 shadow-xs ring-1 ring-stone-200' 
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* KPI Stat Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 flex flex-col">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Latest</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg font-black text-stone-900">{currentFormatted}</span>
                <span className="text-[10px] font-bold text-stone-500">{unit}</span>
              </div>
            </div>

            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 flex flex-col">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Average</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg font-black text-stone-900">{averageFormatted}</span>
                <span className="text-[10px] font-bold text-stone-500">{unit}</span>
              </div>
            </div>

            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 flex flex-col">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Range</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xs font-bold text-stone-700">{minFormatted}</span>
                <span className="text-[10px] text-stone-400">–</span>
                <span className="text-xs font-bold text-stone-900">{maxFormatted}</span>
              </div>
            </div>

            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 flex flex-col">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Target</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg font-black text-stone-900">{targetFormatted}</span>
                <span className="text-[10px] font-bold text-stone-500">{unit}</span>
              </div>
            </div>
          </div>

          {/* Delta Trend Callout */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-stone-50 rounded-xl border border-stone-100 text-xs">
            <div className="flex items-center gap-2">
              {deltaPositive === true ? (
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <TrendingUp size={12} />
                </div>
              ) : deltaPositive === false ? (
                <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <TrendingDown size={12} />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold">
                  <Minus size={12} />
                </div>
              )}
              <span className="font-bold text-stone-700">{deltaText}</span>
            </div>
            {targetFormatted !== '-' && (
              <span className="text-[11px] font-semibold text-stone-500">
                🎯 Goal: {targetFormatted} {unit}
              </span>
            )}
          </div>

          {/* Interactive SVG Chart Container */}
          <div className="relative bg-white rounded-2xl border border-stone-200/90 p-2 shadow-2xs">
            
            {/* Tooltip on Scrubber Hover */}
            {hoveredPoint && (
              <div className="absolute top-3 left-4 right-4 z-20 flex justify-between items-center bg-stone-900/90 text-white px-3 py-1.5 rounded-xl text-xs backdrop-blur-xs animate-in fade-in">
                <span className="font-medium text-stone-300">{hoveredPoint.fullDateLabel}</span>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-white text-sm">
                    {hoveredPoint.value.toLocaleString()} {unit}
                  </span>
                  {hoveredPoint.isEstimated && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 text-[9px] font-bold">
                      Baseline
                    </span>
                  )}
                </div>
              </div>
            )}

            <svg 
              viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
              className="w-full h-48 select-none"
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.stroke} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={theme.stroke} stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines */}
              {[0, 0.5, 1].map((pct, idx) => {
                const y = padTop + chartHeight * pct;
                const val = Math.round(yMax - pct * yRange);
                return (
                  <g key={idx}>
                    <line 
                      x1={padLeft} 
                      y1={y} 
                      x2={svgWidth - padRight} 
                      y2={y} 
                      stroke="#e5e7eb" 
                      strokeDasharray="3 3" 
                      strokeWidth="1" 
                    />
                    <text 
                      x={padLeft - 6} 
                      y={y + 3} 
                      textAnchor="end" 
                      fontSize="9" 
                      fill="#9ca3af" 
                      fontWeight="bold"
                    >
                      {val.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Target Reference Line */}
              {targetY !== null && targetY >= padTop && targetY <= padTop + chartHeight && (
                <g>
                  <line 
                    x1={padLeft} 
                    y1={targetY} 
                    x2={svgWidth - padRight} 
                    y2={targetY} 
                    stroke="#059669" 
                    strokeDasharray="4 4" 
                    strokeWidth="1.5" 
                  />
                  <text 
                    x={svgWidth - padRight} 
                    y={targetY - 5} 
                    textAnchor="end" 
                    fontSize="9" 
                    fill="#059669" 
                    fontWeight="bold"
                  >
                    Goal: {trendData.targetValue?.toLocaleString()}
                  </text>
                </g>
              )}

              {/* Area Gradient Fill */}
              {areaPath && (
                <path 
                  d={areaPath} 
                  fill={`url(#grad-${metric})`} 
                />
              )}

              {/* Main Trend Curve */}
              {curvePath && (
                <path 
                  d={curvePath} 
                  fill="none" 
                  stroke={theme.stroke} 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              )}

              {/* Data points & interactive touch hotspots */}
              {points.map((p, i) => {
                const cx = getX(i);
                const cy = getY(p.value);
                const isHovered = hoveredPoint?.date === p.date;

                return (
                  <g 
                    key={p.date + i}
                    onMouseEnter={() => setHoveredPoint(p)}
                    onTouchStart={() => setHoveredPoint(p)}
                    className="cursor-pointer"
                  >
                    {/* Invisible expanded hit area */}
                    <circle cx={cx} cy={cy} r="14" fill="transparent" />

                    {/* Point Dot */}
                    <circle 
                      cx={cx} 
                      cy={cy} 
                      r={isHovered ? 5.5 : (p.isEstimated ? 2.5 : 3.5)} 
                      fill={isHovered ? '#ffffff' : theme.stroke} 
                      stroke={theme.stroke} 
                      strokeWidth={isHovered ? 3 : 1.5}
                      opacity={p.isEstimated ? 0.7 : 1}
                    />

                    {/* X-axis date labels for key intervals */}
                    {(points.length <= 10 || i % Math.ceil(points.length / 6) === 0 || i === points.length - 1) && (
                      <text 
                        x={cx} 
                        y={svgHeight - 12} 
                        textAnchor="middle" 
                        fontSize="9" 
                        fill="#6b7280" 
                        fontWeight="bold"
                      >
                        {p.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Baseline Projection Notice */}
          {hasPregeneratedData && (
            <div className="flex items-center gap-2 p-3 bg-teal-50/70 border border-teal-100 rounded-xl text-xs text-teal-800 font-medium">
              <Sparkles size={14} className="text-teal-600 shrink-0" />
              <span>
                Baseline trends are pregenerated from your profile targets for dates prior to your logged entries.
              </span>
            </div>
          )}

          {/* Historical Log Entries Breakdown List */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Recent Logged History ({timeframe === 'month' ? 'This Month' : timeframe})
            </h3>
            
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
              {points.slice().reverse().slice(0, 10).map((pt) => {
                const targetVal = trendData.targetValue;
                const isMet = targetVal ? (metric === 'weight' ? pt.value <= targetVal : pt.value >= targetVal) : null;

                return (
                  <div 
                    key={pt.date}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100 text-xs"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-stone-800">{pt.fullDateLabel}</span>
                      <span className="text-[10px] text-stone-400 font-medium">
                        {pt.isEstimated ? 'Baseline estimate' : 'Recorded in logs'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-stone-900 text-sm">
                        {pt.value.toLocaleString()} <span className="text-xs font-medium text-stone-500">{unit}</span>
                      </span>
                      {isMet !== null && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                          isMet ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                        }`}>
                          {isMet ? 'Met' : 'Below'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="shrink-0 p-4 border-t border-stone-100 flex justify-end bg-stone-50/60">
          <button
            onClick={onClose}
            className="py-2.5 px-6 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition cursor-pointer"
          >
            Close Trends
          </button>
        </div>

      </motion.div>
    </div>
  );
}
