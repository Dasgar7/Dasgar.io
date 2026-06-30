import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { LeaderboardEntry } from '../shared/types.ts';
import { WORLD_SIZE } from '../shared/constants.ts';
import { Settings as SettingsIcon, X } from 'lucide-react';

interface PackedPlayer {
  id: string;
  n: string;
  c: string;
  s: number;
  cells: { id: string, x: number, y: number, r: number }[];
}

interface PackedFood { id: string; x: number; y: number; c: string; }
interface PackedVirus { id: string; x: number; y: number; r: number; }
interface PackedEjected { id: string; x: number; y: number; r: number; c: string; }

interface GameStatePayload {
  p: PackedPlayer[];
  f: PackedFood[];
  v: PackedVirus[];
  e: PackedEjected[];
  lb: LeaderboardEntry[];
}

export default function Game() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [name, setName] = useState('');
  const [dead, setDead] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [score, setScore] = useState(0);
  
  const [showSettings, setShowSettings] = useState(false);
  const [controlMode, setControlMode] = useState<'joystick' | 'tap'>('joystick');
  const [stopOnRelease, setStopOnRelease] = useState(false);
  const [directionOnTouch, setDirectionOnTouch] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const stateBufferRef = useRef<{time: number, state: GameStatePayload}[]>([]);
  const cameraRef = useRef({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 });
  const animationFrameRef = useRef<number>(0);
  
  const targetRef = useRef({ x: 0, y: 0, active: false });
  const joystickRef = useRef({ active: false, id: -1, originX: 0, originY: 0, currX: 0, currY: 0 });

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('state', (state: GameStatePayload) => {
      stateBufferRef.current.push({ time: performance.now(), state });
      if (stateBufferRef.current.length > 5) stateBufferRef.current.shift();

      setLeaderboard(state.lb);
      const me = state.p.find(p => p.id === socket.id);
      if (me) setScore(me.s);
    });

    socket.on('died', (score: number) => {
      setIsPlaying(false);
      setDead(true);
      setFinalScore(score);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || !socketRef.current) return;
      if (e.code === 'Space') socketRef.current.emit('split');
      else if (e.code === 'KeyW') socketRef.current.emit('eject');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  const startGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (socketRef.current) {
      socketRef.current.emit('join', name);
      setIsPlaying(true);
      setDead(false);
    }
  };

  useEffect(() => {
    if (!isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const updateTarget = (worldX: number, worldY: number) => {
      targetRef.current = { x: worldX, y: worldY, active: true };
      socketRef.current?.emit('target', { x: worldX, y: worldY });
    };

    const screenToWorld = (clientX: number, clientY: number) => {
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      return {
        x: cameraRef.current.x + (clientX - cw) / cameraRef.current.zoom,
        y: cameraRef.current.y + (clientY - ch) / cameraRef.current.zoom
      };
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      // Ignore if clicking buttons (handled by stopping propagation on buttons)
      
      if (controlMode === 'joystick') {
        if (!joystickRef.current.active) {
          joystickRef.current = {
            active: true, id: e.pointerId, 
            originX: e.clientX, originY: e.clientY,
            currX: e.clientX, currY: e.clientY
          };
          if (directionOnTouch) {
            const w = screenToWorld(e.clientX, e.clientY);
            updateTarget(w.x, w.y);
          }
        }
      } else {
        // Tap mode
        const w = screenToWorld(e.clientX, e.clientY);
        updateTarget(w.x, w.y);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      if (controlMode === 'joystick' && joystickRef.current.active && joystickRef.current.id === e.pointerId) {
        joystickRef.current.currX = e.clientX;
        joystickRef.current.currY = e.clientY;
        
        const dx = e.clientX - joystickRef.current.originX;
        const dy = e.clientY - joystickRef.current.originY;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 5) {
          // Push target far in that direction
          const targetWorldX = cameraRef.current.x + (dx * 1000) / cameraRef.current.zoom;
          const targetWorldY = cameraRef.current.y + (dy * 1000) / cameraRef.current.zoom;
          updateTarget(targetWorldX, targetWorldY);
        }
      } else if (controlMode === 'tap' && e.buttons > 0) {
        const w = screenToWorld(e.clientX, e.clientY);
        updateTarget(w.x, w.y);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault();
      if (controlMode === 'joystick' && joystickRef.current.id === e.pointerId) {
        joystickRef.current.active = false;
        if (stopOnRelease) {
           updateTarget(cameraRef.current.x, cameraRef.current.y);
        }
      } else if (controlMode === 'tap') {
        if (stopOnRelease) {
           updateTarget(cameraRef.current.x, cameraRef.current.y);
        }
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    // Context menu block
    const blockMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', blockMenu);

    const render = () => {
      if (!ctx || !canvas) return;
      
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const buffer = stateBufferRef.current;
      if (buffer.length === 0) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const renderTime = performance.now() - 100;
      let s0 = buffer[0], s1 = buffer[buffer.length - 1];
      let t = 1;

      if (buffer.length > 1) {
        for (let i = 1; i < buffer.length; i++) {
          if (buffer[i].time > renderTime) {
            s0 = buffer[i - 1];
            s1 = buffer[i];
            break;
          }
        }
        if (s1.time > s0.time) {
          t = Math.max(0, Math.min(1, (renderTime - s0.time) / (s1.time - s0.time)));
        }
      }

      const interpolatedPlayers = s1.state.p.map(p1 => {
        if (p1.id === socketRef.current?.id) {
           // Local player: Extrapolate from latest server state instead of interpolating past
           const latestP = buffer[buffer.length - 1].state.p.find(p => p.id === p1.id);
           if (!latestP) return p1;
           const timeSinceLatest = performance.now() - buffer[buffer.length - 1].time;
           const dt = Math.min(timeSinceLatest / 1000, 0.1);
           
           return {
              ...latestP,
              cells: latestP.cells.map(c => {
                 const dx = targetRef.current.x - c.x;
                 const dy = targetRef.current.y - c.y;
                 const dist = Math.hypot(dx, dy);
                 let nx = c.x, ny = c.y;
                 if (dist > 0 && targetRef.current.active) {
                    const speed = 1500 / Math.pow(c.r, 0.5); 
                    const moveDist = Math.min(speed * dt, dist);
                    nx += (dx / dist) * moveDist;
                    ny += (dy / dist) * moveDist;
                 }
                 return { ...c, x: nx, y: ny };
              })
           };
        }

        const p0 = s0.state.p.find(p => p.id === p1.id);
        if (!p0) return p1;
        return {
          ...p1,
          cells: p1.cells.map(c1 => {
            const c0 = p0.cells.find(c => c.id === c1.id);
            if (!c0) return c1;
            return {
              ...c1,
              x: c0.x + (c1.x - c0.x) * t,
              y: c0.y + (c1.y - c0.y) * t,
              r: c0.r + (c1.r - c0.r) * t
            };
          })
        };
      });

      const renderState = { ...s1.state, p: interpolatedPlayers };
      const me = renderState.p.find(p => p.id === socketRef.current?.id);
      
      if (me && me.cells.length > 0) {
        let cmX = 0, cmY = 0, totalMass = 0;
        for (const cell of me.cells) {
          const mass = cell.r * cell.r;
          cmX += cell.x * mass;
          cmY += cell.y * mass;
          totalMass += mass;
        }
        cmX /= totalMass;
        cmY /= totalMass;

        cameraRef.current.x += (cmX - cameraRef.current.x) * 0.15;
        cameraRef.current.y += (cmY - cameraRef.current.y) * 0.15;

        let minX = cmX, maxX = cmX, minY = cmY, maxY = cmY;
        for (const cell of me.cells) {
          minX = Math.min(minX, cell.x - cell.r);
          maxX = Math.max(maxX, cell.x + cell.r);
          minY = Math.min(minY, cell.y - cell.r);
          maxY = Math.max(maxY, cell.y + cell.r);
        }
        
        const width = maxX - minX;
        const height = maxY - minY;
        const maxSize = Math.max(width, height, 400); 
        
        const targetZoom = Math.min(1.5, Math.max(0.1, window.innerWidth / (maxSize * 3)));
        cameraRef.current.zoom += (targetZoom - cameraRef.current.zoom) * 0.1;
      }

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);
      ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

      // Grid
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      const gridSize = 100;
      
      const cw = canvas.width / cameraRef.current.zoom;
      const ch = canvas.height / cameraRef.current.zoom;
      const startX = Math.max(0, Math.floor((cameraRef.current.x - cw/2) / gridSize) * gridSize);
      const startY = Math.max(0, Math.floor((cameraRef.current.y - ch/2) / gridSize) * gridSize);
      const endX = Math.min(WORLD_SIZE, startX + cw + gridSize * 2);
      const endY = Math.min(WORLD_SIZE, startY + ch + gridSize * 2);

      ctx.beginPath();
      for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);

      const isOnScreen = (x: number, y: number, r: number) => {
        return x + r >= startX && x - r <= endX && y + r >= startY && y - r <= endY;
      };

      for (const food of renderState.f) {
        if (!isOnScreen(food.x, food.y, 10)) continue;
        ctx.beginPath();
        ctx.arc(food.x, food.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = food.c;
        ctx.fill();
      }

      const renderEntities: { type: 'cell' | 'virus' | 'eject', data: any, player?: PackedPlayer }[] = [];
      for (const p of renderState.p) {
        for (const c of p.cells) renderEntities.push({ type: 'cell', data: c, player: p });
      }
      for (const v of renderState.v) renderEntities.push({ type: 'virus', data: v });
      for (const e of renderState.e) renderEntities.push({ type: 'eject', data: e });

      renderEntities.sort((a, b) => a.data.r - b.data.r);

      for (const entity of renderEntities) {
        if (!isOnScreen(entity.data.x, entity.data.y, entity.data.r)) continue;

        if (entity.type === 'eject') {
          const eject = entity.data;
          ctx.beginPath();
          ctx.arc(eject.x, eject.y, eject.r, 0, Math.PI * 2);
          ctx.fillStyle = eject.c;
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (entity.type === 'virus') {
          const virus = entity.data;
          ctx.beginPath();
          const spikes = 20;
          for (let i = 0; i < spikes * 2; i++) {
            const angle = (i * Math.PI) / spikes;
            const radius = i % 2 === 0 ? virus.r : virus.r * 0.85;
            const px = virus.x + Math.cos(angle) * radius;
            const py = virus.y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = '#00ff88';
          ctx.fill();
          ctx.strokeStyle = '#003311';
          ctx.lineWidth = 4;
          ctx.stroke();
        } else if (entity.type === 'cell') {
          const cell = entity.data;
          const player = entity.player!;
          
          ctx.beginPath();
          ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI * 2);
          ctx.fillStyle = player.c;
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 4;
          ctx.stroke();

          if (cell.r > 20) {
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const fontSize = Math.max(12, cell.r / 3);
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            ctx.lineWidth = fontSize / 5;
            ctx.strokeStyle = '#000';
            ctx.strokeText(player.n, cell.x, cell.y);
            ctx.fillText(player.n, cell.x, cell.y);

            const mass = Math.round(cell.r * cell.r / 100); 
            ctx.font = `${fontSize * 0.7}px Inter, sans-serif`;
            ctx.strokeText(mass.toString(), cell.x, cell.y + fontSize);
            ctx.fillText(mass.toString(), cell.x, cell.y + fontSize);
          }
        }
      }

      ctx.restore();

      // Render Floating Joystick HUD
      if (controlMode === 'joystick' && joystickRef.current.active) {
         ctx.save();
         const j = joystickRef.current;
         // Base
         ctx.beginPath();
         ctx.arc(j.originX, j.originY, 60, 0, Math.PI * 2);
         ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
         ctx.fill();
         ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
         ctx.lineWidth = 2;
         ctx.stroke();

         // Knob
         const dx = j.currX - j.originX;
         const dy = j.currY - j.originY;
         const dist = Math.hypot(dx, dy);
         const maxDist = 60;
         let kx = j.currX;
         let ky = j.currY;
         if (dist > maxDist) {
            kx = j.originX + (dx / dist) * maxDist;
            ky = j.originY + (dy / dist) * maxDist;
         }

         ctx.beginPath();
         ctx.arc(kx, ky, 30, 0, Math.PI * 2);
         ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
         ctx.fill();
         ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('contextmenu', blockMenu);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, controlMode, stopOnRelease, directionOnTouch]);

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden text-white font-sans selection:bg-[#00ff88] selection:text-black">
      {!isPlaying && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <form 
            onSubmit={startGame} 
            className="bg-[#111] border border-[#222] p-8 rounded-2xl shadow-2xl shadow-[#00ff88]/10 w-full max-w-sm"
          >
            <h1 className="text-4xl font-bold text-center mb-2 tracking-tight">Dasgar<span className="text-[#00ff88]">.io</span></h1>
            {dead && (
              <div className="mb-6 text-center">
                <p className="text-red-400 font-medium">You died!</p>
                <p className="text-xl font-bold text-white">Final Mass: {Math.round(finalScore)}</p>
              </div>
            )}
            {!dead && <p className="text-gray-400 text-center mb-6">Enter the arena.</p>}
            
            <input 
              type="text" 
              placeholder="Nickname" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={15}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-4 py-3 text-lg text-white placeholder-gray-600 focus:outline-none focus:border-[#00ff88] transition-colors mb-4"
              autoFocus
            />
            <button 
              type="submit" 
              className="w-full bg-[#00ff88] hover:bg-[#00cc6a] text-black font-bold text-lg py-3 rounded-lg transition-colors"
            >
              Play
            </button>
          </form>
        </div>
      )}

      {isPlaying && (
        <>
          <canvas ref={canvasRef} className="w-full h-full block touch-none" />
          
          <div className="absolute top-4 left-4 pointer-events-none">
            <div className="bg-black/50 backdrop-blur border border-white/10 rounded-lg px-4 py-2 font-mono text-xl">
              Mass: <span className="text-[#00ff88] font-bold">{Math.round(score)}</span>
            </div>
          </div>

          <div className="absolute top-4 right-4 w-48 bg-black/50 backdrop-blur border border-white/10 rounded-lg overflow-hidden pointer-events-none">
            <div className="bg-white/5 px-3 py-2 border-b border-white/10 font-bold text-center tracking-wider text-sm text-gray-300">
              LEADERBOARD
            </div>
            <div className="p-2 flex flex-col gap-1">
              {leaderboard.length === 0 && <div className="text-center text-gray-500 text-xs py-2">No players</div>}
              {leaderboard.map((entry, idx) => (
                <div key={entry.id} className={`flex justify-between items-center text-sm px-2 py-1 rounded ${entry.id === socketRef.current?.id ? 'bg-[#00ff88]/20 text-[#00ff88] font-bold' : 'text-gray-300'}`}>
                  <span className="truncate w-28">{idx + 1}. {entry.name || 'Anonymous'}</span>
                  <span>{Math.round(entry.score)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-8 right-8 flex gap-4 opacity-70 hover:opacity-100 transition-opacity select-none z-40">
            <button 
              onPointerDown={(e) => { e.stopPropagation(); socketRef.current?.emit('eject'); }}
              className="w-16 h-16 rounded-full bg-[#00ff88]/20 border-2 border-[#00ff88] text-[#00ff88] shadow-lg shadow-[#00ff88]/20 active:scale-95 flex items-center justify-center touch-manipulation focus:outline-none"
            >
              {/* Eject Icon - dot shooting outward */}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v4"/>
                <path d="M12 18v4"/>
                <path d="M4.93 4.93l2.83 2.83"/>
                <path d="M16.24 16.24l2.83 2.83"/>
                <path d="M2 12h4"/>
                <path d="M18 12h4"/>
                <path d="M4.93 19.07l2.83-2.83"/>
                <path d="M16.24 7.76l2.83-2.83"/>
              </svg>
            </button>
            <button 
              onPointerDown={(e) => { e.stopPropagation(); socketRef.current?.emit('split'); }}
              className="w-20 h-20 rounded-full bg-[#00ff88]/30 border-2 border-[#00ff88] text-[#00ff88] shadow-lg shadow-[#00ff88]/30 active:scale-95 flex items-center justify-center touch-manipulation focus:outline-none"
            >
              {/* Split Icon - two overlapping circles splitting */}
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="12" r="5" />
                <circle cx="16" cy="12" r="5" />
                <path d="M7 12h10" strokeDasharray="2 2" />
              </svg>
            </button>
          </div>

          <button 
            onClick={() => setShowSettings(true)}
            className="absolute top-4 right-[210px] p-2 bg-black/50 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <SettingsIcon size={20} />
          </button>
        </>
      )}

      {showSettings && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-[#222] rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-[#222] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-xl font-bold">Controls</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white"><X size={24}/></button>
            </div>
            <div className="p-6 flex flex-col gap-6">
              <div>
                <label className="text-sm text-gray-400 font-bold mb-2 block">MOVEMENT MODE</label>
                <div className="flex bg-[#0a0a0a] rounded-lg p-1 border border-[#333]">
                  <button 
                    onClick={() => setControlMode('joystick')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${controlMode === 'joystick' ? 'bg-[#00ff88] text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    Joystick
                  </button>
                  <button 
                    onClick={() => setControlMode('tap')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${controlMode === 'tap' ? 'bg-[#00ff88] text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    Tap to Move
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Stop on Release</div>
                  <div className="text-xs text-gray-500">Stop moving when touch ends</div>
                </div>
                <button 
                  onClick={() => setStopOnRelease(!stopOnRelease)}
                  className={`w-12 h-6 rounded-full relative transition-colors ${stopOnRelease ? 'bg-[#00ff88]' : 'bg-[#333]'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${stopOnRelease ? 'translate-x-6' : ''}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Direction on Touch</div>
                  <div className="text-xs text-gray-500">Move immediately where touched</div>
                </div>
                <button 
                  onClick={() => setDirectionOnTouch(!directionOnTouch)}
                  className={`w-12 h-6 rounded-full relative transition-colors ${directionOnTouch ? 'bg-[#00ff88]' : 'bg-[#333]'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${directionOnTouch ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
