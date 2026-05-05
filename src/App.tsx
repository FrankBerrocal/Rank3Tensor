/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Float, PerspectiveCamera, Environment, Stars, Billboard } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Box, Info, Layers, Maximize2, Settings2, Database, Upload, Download } from 'lucide-react';
import * as THREE from 'three';

// --- Types ---

interface TensorPoint {
  id: string;
  i: number; // Y coordinate
  j: number; // X coordinate
  k: number; // Z coordinate (0: Red, 1: Blue, 2: Green)
  color: string;
}

enum ColumnType {
  RED = 0,
  GREEN = 1,
  BLUE = 2
}

const COLUMN_NAMES = {
  [ColumnType.RED]: 'Red',
  [ColumnType.GREEN]: 'Green',
  [ColumnType.BLUE]: 'Blue'
};

const COLUMN_COLORS = {
  [ColumnType.RED]: 'text-red-500',
  [ColumnType.GREEN]: 'text-emerald-500',
  [ColumnType.BLUE]: 'text-blue-500'
};

const COLUMN_BG_GLOW = {
  [ColumnType.RED]: 'bg-red-500/10',
  [ColumnType.GREEN]: 'bg-emerald-500/10',
  [ColumnType.BLUE]: 'bg-blue-500/10'
};

// --- Utils ---

const calculateColor = (i: number, j: number, k: number, limit: number): string => {
  const normI = Math.min(255, Math.max(0, (i / limit) * 255));
  const normJ = Math.min(255, Math.max(0, (j / limit) * 255));
  
  let r = 0, g = 0, b = 0;
  
  if (k === ColumnType.RED) { // Red Column
    r = 255;
    g = normI;
    b = normJ;
  } else if (k === ColumnType.GREEN) { // Green Column
    r = normI;
    g = 255;
    b = normJ;
  } else if (k === ColumnType.BLUE) { // Blue Column
    r = normI;
    g = normJ;
    b = 255;
  }
  
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};

// --- 3D Components ---

const SpherePoint = ({ point, scalarLimit }: { point: TensorPoint, scalarLimit: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Scale units to fit in a 10x10x10 cube
  const scaleFactor = 10 / scalarLimit;
  const x = point.j * scaleFactor - 5; // J as X (Side)
  const y = point.i * scaleFactor - 5; // I as Y (Top)
  const z = (point.k - 1) * 3; // K as Z (Depth), spread out for visibility (Z= -3, 0, 3)
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group position={[x, y, z]}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial 
          color={point.color} 
          emissive={new THREE.Color(point.color)} 
          emissiveIntensity={0.5}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      <Billboard>
        <Text
          position={[0, 0.6, 0]}
          fontSize={0.25}
          color="#1e293b"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="white"
        >
          {`(${point.i}, ${point.j}, ${point.k})`}
        </Text>
      </Billboard>
    </group>
  );
};

const Scene = ({ points, scalarLimit }: { points: TensorPoint[], scalarLimit: number }) => {
  return (
    <>
      <PerspectiveCamera makeDefault position={[12, 12, 12]} fov={50} />
      <OrbitControls makeDefault minDistance={5} maxDistance={40} />
      
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1.5} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      <Environment preset="city" />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      {/* Plane helpers for each K level */}
      {[0, 1, 2].map((k) => (
        <group key={`plane-${k}`} position={[0, 0, (k - 1) * 2]}>
          <Grid 
            args={[10, 10]} 
            sectionSize={1} 
            sectionThickness={1} 
            sectionColor={k === 0 ? '#ff4444' : k === 1 ? '#4444ff' : '#44ff44'}
            cellColor="#444"
            fadeDistance={50}
            infiniteGrid
          />
          <Text
            position={[-5.5, 5.5, 0]}
            fontSize={0.5}
            color={k === 0 ? '#ff4444' : k === 1 ? '#4444ff' : '#44ff44'}
            anchorX="left"
          >
            {COLUMN_NAMES[k as ColumnType]} Plane (Z={k})
          </Text>
        </group>
      ))}

      {points.map((p) => (
        <PointForm3D key={p.id} point={p} scalarLimit={scalarLimit} />
      ))}
    </>
  );
};

// Split SpherePoint for cleaner usage
const PointForm3D = ({ point, scalarLimit }: { point: TensorPoint, scalarLimit: number }) => {
  return <SpherePoint point={point} scalarLimit={scalarLimit} />;
};

// --- Main App ---

export default function App() {
  const [scalarLimit, setScalarLimit] = useState<number>(256);
  const [points, setPoints] = useState<TensorPoint[]>([]);
  const [activeFormK, setActiveFormK] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [inputI, setInputI] = useState<string>('');
  const [inputJ, setInputJ] = useState<string>('');

  const handleScalarChange = (newVal: number) => {
    const limit = Math.max(1, newVal);
    setScalarLimit(limit);
    
    // Filter points above new limit and RECALCULATE colors for the new scale
    setPoints(prev => prev
      .filter(p => p.i <= limit && p.j <= limit)
      .map(p => ({
        ...p,
        color: calculateColor(p.i, p.j, p.k, limit)
      }))
    );
  };

  const handleLoadRandomData = () => {
    const newPoints: TensorPoint[] = [];
    
    for (let k = 0; k <= 2; k++) {
      for (let n = 0; n < 256; n++) {
        const iValue = Math.floor(Math.random() * (scalarLimit + 1));
        const jValue = Math.floor(Math.random() * (scalarLimit + 1));
        newPoints.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${k}-${n}`,
          i: iValue,
          j: jValue,
          k: k,
          color: calculateColor(iValue, jValue, k, scalarLimit)
        });
      }
    }
    
    setPoints(prev => [...prev, ...newPoints]);
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      const newPoints: TensorPoint[] = [];

      lines.forEach((line, index) => {
        const parts = line.split(',').map(s => s.trim());
        
        // CSV Format: K, I, J
        const kValue = parseInt(parts[0]);
        const iValue = parseInt(parts[1]);
        const jValue = parseInt(parts[2]);

        // Validate values
        if (!isNaN(kValue) && !isNaN(iValue) && !isNaN(jValue)) {
          if (kValue >= 0 && kValue <= 2) {
             if (iValue <= scalarLimit && jValue <= scalarLimit) {
               newPoints.push({
                 id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
                 i: iValue, 
                 j: jValue, 
                 k: kValue,
                 color: calculateColor(iValue, jValue, kValue, scalarLimit)
               });
             }
          }
        }
      });

      if (newPoints.length > 0) {
        setPoints(prev => [...prev, ...newPoints]);
      }
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleAddPoint = (k: number) => {
    const i = parseInt(inputI);
    const j = parseInt(inputJ);
    
    if (isNaN(i) || isNaN(j) || i < 0 || j < 0 || i > scalarLimit || j > scalarLimit) {
      alert(`Values must be between 0 and ${scalarLimit}`);
      return;
    }

    const newPoint: TensorPoint = {
      id: Math.random().toString(36).substr(2, 9),
      i,
      j,
      k,
      color: calculateColor(i, j, k, scalarLimit)
    };

    setPoints(prev => [...prev, newPoint]);
    setActiveFormK(null);
    setInputI('');
    setInputJ('');
  };

  const removePoint = (id: string) => {
    setPoints(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 selection:bg-indigo-100 font-sans">
      {/* Header */}
      <header className="px-10 py-6 border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-slate-900 rounded-lg">
            <Box className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Rank 3 Tensor Visualization</h1>
            <p className="text-xs text-slate-500 font-medium">by Frank Berrocal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleCsvUpload} 
            accept=".csv" 
            className="hidden" 
          />
          <div className="relative flex items-center gap-2 group/tooltip">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-bold transition-colors text-slate-700"
            >
              <Upload className="w-4 h-4" />
              Load CSV
            </button>
            <Info className="w-4 h-4 text-slate-400 cursor-help" />
            
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-3 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity z-[60] shadow-xl text-center leading-relaxed font-semibold">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 w-2 h-2 bg-slate-900" />
              Select the correct scale for your data before uploading
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={handleLoadRandomData}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-slate-200 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Database className="w-4 h-4" />
              Load Data
            </button>
            <button 
              onClick={() => setPoints([])}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 rounded-xl text-xs font-bold transition-all text-slate-600"
            >
              <Trash2 className="w-4 h-4" />
              Clear Data
            </button>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scalar Restriction</label>
             <input 
                type="number" 
                value={scalarLimit}
                onChange={(e) => handleScalarChange(parseInt(e.target.value) || 0)}
                className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
             />
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 p-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Visualization Panel */}
        <section className="lg:col-span-12 flex flex-col gap-6">
          <div className="h-[500px] rounded-3xl border border-slate-100 bg-slate-50/30 overflow-hidden relative shadow-inner">
            <Canvas shadows gl={{ antialias: true }}>
              <color attach="background" args={['#ffffff']} />
              <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={40} />
              <OrbitControls makeDefault />
              
              <ambientLight intensity={0.8} />
              <pointLight position={[10, 10, 10]} intensity={1} />
              
              {/* The Data Cube Wireframe */}
              <group>
                <mesh>
                  <boxGeometry args={[10, 10, 10]} />
                  <meshBasicMaterial color="#f8fafc" transparent opacity={0.1} />
                </mesh>
                <lineSegments>
                  <edgesGeometry args={[new THREE.BoxGeometry(10, 10, 10)]} />
                  <lineBasicMaterial color="#e2e8f0" />
                </lineSegments>
                
                {/* Visual Grid Helpers */}
                <Grid 
                  infiniteGrid={false}
                  args={[10, 10]} 
                  position={[0, -5, 0]} 
                  cellColor="#f1f5f9" 
                  sectionColor="#cbd5e1" 
                  sectionThickness={1.5}
                />

                {/* Legend Labels Facing the User */}
                <Billboard position={[6, -5, 0]}>
                  <Text fontSize={0.4} color="#64748b" outlineWidth={0.05} outlineColor="white">Side: X (J)</Text>
                </Billboard>
                <Billboard position={[0, 6, 0]}>
                  <Text fontSize={0.4} color="#64748b" outlineWidth={0.05} outlineColor="white">Top: Y (I)</Text>
                </Billboard>
                <Billboard position={[0, -5, 6]}>
                  <Text fontSize={0.4} color="#64748b" outlineWidth={0.05} outlineColor="white">Depth: Z (K)</Text>
                </Billboard>
              </group>

              {points.map((p) => (
                <SpherePoint key={p.id} point={p} scalarLimit={scalarLimit} />
              ))}
            </Canvas>
          </div>
        </section>

        {/* Data Entry Grid */}
        <section className="lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[ColumnType.RED, ColumnType.GREEN, ColumnType.BLUE].map((k) => (
            <div key={k} className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${k === ColumnType.RED ? 'bg-red-500' : k === ColumnType.GREEN ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                  <h3 className="font-bold text-slate-800">{COLUMN_NAMES[k as ColumnType]} Column</h3>
                </div>
                <button 
                  onClick={() => setActiveFormK(activeFormK === k ? null : k)}
                  className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-slate-900"
                  title="Add Row"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Inline Row Entry */}
              {activeFormK === k && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col gap-4"
                >
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Input I</label>
                      <input 
                        autoFocus
                        type="number"
                        value={inputI}
                        onChange={(e) => setInputI(e.target.value)}
                        placeholder="Y pos"
                        className={`w-full bg-white border rounded-lg px-2 py-2 text-xs font-mono outline-none focus:ring-1 ${parseInt(inputI) > scalarLimit ? 'border-red-500 bg-red-50 text-red-600 focus:ring-red-300' : 'border-slate-200 focus:ring-slate-300'}`}
                      />
                      {parseInt(inputI) > scalarLimit && (
                        <p className="text-[8px] text-red-500 font-bold uppercase">Exceeds {scalarLimit}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Input J</label>
                      <input 
                        type="number"
                        value={inputJ}
                        onChange={(e) => setInputJ(e.target.value)}
                        placeholder="X pos"
                        className={`w-full bg-white border rounded-lg px-2 py-2 text-xs font-mono outline-none focus:ring-1 ${parseInt(inputJ) > scalarLimit ? 'border-red-500 bg-red-50 text-red-600 focus:ring-red-300' : 'border-slate-200 focus:ring-slate-300'}`}
                      />
                      {parseInt(inputJ) > scalarLimit && (
                        <p className="text-[8px] text-red-500 font-bold uppercase">Exceeds {scalarLimit}</p>
                      )}
                    </div>
                    <div className="space-y-1.5 opacity-40">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Index K</label>
                      <input 
                        disabled
                        type="number"
                        value={k}
                        className="w-full bg-slate-200 border border-transparent rounded-lg px-2 py-2 text-xs font-mono outline-none cursor-not-allowed text-center"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAddPoint(k)}
                      className="flex-1 bg-slate-900 text-white py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors"
                    >
                      Save Point
                    </button>
                    <button 
                      onClick={() => setActiveFormK(null)}
                      className="px-3 bg-white border border-slate-200 text-slate-500 py-2 rounded-lg text-xs font-bold hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Column Points List */}
              <div className="flex flex-col gap-2">
                {points.filter(p => p.k === k).map(p => (
                  <div key={p.id} className="group flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-sm transition-all hover:border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full border border-slate-100" style={{ backgroundColor: p.color }} />
                      <span className="text-[11px] font-mono text-slate-600">
                        I:{p.i} J:{p.j} <span className="text-slate-300 mx-1">|</span> K:{p.k}
                      </span>
                    </div>
                    <button 
                      onClick={() => removePoint(p.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      {/* Footer */}
      <footer className="p-10 border-t border-slate-100 bg-slate-50 text-center">
        <p className="text-slate-400 text-xs font-semibold tracking-wider">
          Conceptualized, Designed and Created by <span className="text-slate-800">Frank Berrocal</span>, Copyright 2026
        </p>
      </footer>
    </div>
  );
}
