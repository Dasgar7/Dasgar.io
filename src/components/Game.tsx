import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { LeaderboardEntry } from '../shared/types.ts';
import { WORLD_SIZE } from '../shared/constants.ts';
import { Settings as SettingsIcon, X, Plus, Zap, Swords, Gamepad2, Eye, MoreHorizontal, ShoppingCart, Coins, Crown, Star, User, Lock, Check, Dna } from 'lucide-react';
import { motion } from 'motion/react';
import joystickImg from '../assets/images/glowing_joystick_icon_1782903962794.jpg';
import narutoBg from '../assets/images/naruto_background_1782896239206.jpg';
import sasukeBg from '../assets/images/sasuke_avatar_1782901046335.jpg';
import itachiBg from '../assets/images/itachi_avatar_1782901059146.jpg';
import kuramaBg from '../assets/images/kurama_avatar_1782901072780.jpg';

const SKINS = [
  { id: 'naruto', name: 'Naruto Sage', image: narutoBg, type: 'image' },
  { id: 'sasuke', name: 'Sasuke', image: sasukeBg, type: 'image' },
  { id: 'itachi', name: 'Itachi', image: itachiBg, type: 'image' },
  { id: 'kurama', name: 'Kurama', image: kuramaBg, type: 'image' },
  { id: 'neon-green', name: 'Neon Green', color: '#00ff88', type: 'color' },
  { id: 'neon-pink', name: 'Hot Pink', color: '#ff3366', type: 'color' },
  { id: 'neon-blue', name: 'Cyan Blue', color: '#3366ff', type: 'color' },
  { id: 'neon-gold', name: 'Gold', color: '#ffcc00', type: 'color' },
  { id: 'neon-purple', name: 'Purple', color: '#9933ff', type: 'color' },
];

const PREMIUM_SKINS = [
  { id: 'rinnegan', name: 'Rinnegan Premium', image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=150&q=80', type: 'image', isPremium: true, priceDna: 20 },
  { id: 'mangekyou', name: 'Mangekyou Premium', image: 'https://images.unsplash.com/photo-1618005198143-d3663b3e8c2a?auto=format&fit=crop&w=150&q=80', type: 'image', isPremium: true, priceDna: 30 },
  { id: 'golden-kurama', name: 'Golden Kurama', image: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&w=150&q=80', type: 'image', isPremium: true, priceDna: 50 },
];

const getSkinImage = (skinKeyOrUrl: string, cache: Map<string, HTMLImageElement>): HTMLImageElement | null => {
  let resolvedUrl = skinKeyOrUrl;
  const preset = [...SKINS, ...PREMIUM_SKINS].find(s => s.id === skinKeyOrUrl);
  if (preset) {
    if (preset.type === 'color') return null;
    resolvedUrl = preset.image || '';
  }

  if (resolvedUrl.startsWith('#') || !resolvedUrl) return null;

  if (cache.has(resolvedUrl)) {
    const img = cache.get(resolvedUrl)!;
    return img.complete && img.naturalWidth !== 0 ? img : null;
  }

  const img = new Image();
  img.src = resolvedUrl;
  img.referrerPolicy = 'no-referrer';
  cache.set(resolvedUrl, img);
  return null;
};

interface PackedPlayer {
  id: string;
  n: string;
  c: string;
  s: number;
  cells: { id: string, x: number, y: number, r: number, vx: number, vy: number }[];
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
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [dead, setDead] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [score, setScore] = useState(0);

  // Custom interactive progression states (saved to localStorage)
  const [coins, setCoins] = useState(() => {
    const saved = localStorage.getItem('dasgar_coins');
    return saved ? parseInt(saved, 10) : 350;
  });
  const [dna, setDna] = useState(() => {
    const saved = localStorage.getItem('dasgar_dna');
    return saved ? parseInt(saved, 10) : 15;
  });
  const [xp, setXp] = useState(() => {
    const saved = localStorage.getItem('dasgar_xp');
    return saved ? parseInt(saved, 10) : 2420; // Starts at Level 3
  });
  const [username, setUsername] = useState(() => {
    const saved = localStorage.getItem('dasgar_username');
    return saved || 'NinjaGuest';
  });
  const [ownedTitles, setOwnedTitles] = useState<string[]>(() => {
    const saved = localStorage.getItem('dasgar_owned_titles');
    return saved ? JSON.parse(saved) : ['[Genin]'];
  });
  const [selectedTitle, setSelectedTitle] = useState(() => {
    const saved = localStorage.getItem('dasgar_selected_title');
    return saved || '[Genin]';
  });
  const [ownedSkins, setOwnedSkins] = useState<string[]>(() => {
    const saved = localStorage.getItem('dasgar_owned_skins');
    return saved ? JSON.parse(saved) : ['naruto', 'sasuke', 'itachi', 'kurama', 'neon-green', 'neon-pink', 'neon-blue', 'neon-gold', 'neon-purple'];
  });
  const [claimedTiers, setClaimedTiers] = useState<number[]>(() => {
    const saved = localStorage.getItem('dasgar_claimed_tiers');
    return saved ? JSON.parse(saved) : [];
  });
  const [gamesPlayed, setGamesPlayed] = useState(() => {
    const saved = localStorage.getItem('dasgar_games_played');
    return saved ? parseInt(saved, 10) : 12;
  });
  const [maxScore, setMaxScore] = useState(() => {
    const saved = localStorage.getItem('dasgar_max_score');
    return saved ? parseInt(saved, 10) : 1240;
  });
  const [kills, setKills] = useState(() => {
    const saved = localStorage.getItem('dasgar_kills');
    return saved ? parseInt(saved, 10) : 8;
  });

  const [name, setName] = useState(() => {
    const saved = localStorage.getItem('dasgar_username');
    return saved || 'NinjaGuest';
  });

  // Modal displays
  const [showShopModal, setShowShopModal] = useState(false);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; text: string; type: 'info' | 'success' | 'warning' }[]>([]);

  // Daily Claims Cooldowns
  const [lastCoinClaim, setLastCoinClaim] = useState(() => {
    return parseInt(localStorage.getItem('dasgar_last_coin_claim') || '0', 10);
  });
  const [lastDnaClaim, setLastDnaClaim] = useState(() => {
    return parseInt(localStorage.getItem('dasgar_last_dna_claim') || '0', 10);
  });

  // Level & XP math helper
  const level = Math.floor(xp / 1000) + 1;
  const xpInLevel = xp % 1000;
  const xpNeeded = 1000;
  const progressPercent = (xpInLevel / xpNeeded) * 100;
  const filledBlocks = Math.round(progressPercent / 10);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('dasgar_coins', coins.toString());
  }, [coins]);
  useEffect(() => {
    localStorage.setItem('dasgar_dna', dna.toString());
  }, [dna]);
  useEffect(() => {
    localStorage.setItem('dasgar_xp', xp.toString());
  }, [xp]);
  useEffect(() => {
    localStorage.setItem('dasgar_username', username);
    setName(username); // keep game nickname state in sync
  }, [username]);
  useEffect(() => {
    localStorage.setItem('dasgar_owned_titles', JSON.stringify(ownedTitles));
  }, [ownedTitles]);
  useEffect(() => {
    localStorage.setItem('dasgar_selected_title', selectedTitle);
  }, [selectedTitle]);
  useEffect(() => {
    localStorage.setItem('dasgar_owned_skins', JSON.stringify(ownedSkins));
  }, [ownedSkins]);
  useEffect(() => {
    localStorage.setItem('dasgar_claimed_tiers', JSON.stringify(claimedTiers));
  }, [claimedTiers]);
  useEffect(() => {
    localStorage.setItem('dasgar_games_played', gamesPlayed.toString());
  }, [gamesPlayed]);
  useEffect(() => {
    localStorage.setItem('dasgar_max_score', maxScore.toString());
  }, [maxScore]);
  useEffect(() => {
    localStorage.setItem('dasgar_kills', kills.toString());
  }, [kills]);

  const showToast = (text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const buyTitle = (title: string, cost: number) => {
    if (ownedTitles.includes(title)) {
      showToast(`You already own the ${title} title!`, 'warning');
      return;
    }
    if (coins < cost) {
      showToast(`Not enough Coins! Need ${cost} Coins.`, 'warning');
      return;
    }
    setCoins(prev => prev - cost);
    setOwnedTitles(prev => [...prev, title]);
    showToast(`Purchased ${title} title!`, 'success');
  };

  const equipTitle = (title: string) => {
    setSelectedTitle(title);
    showToast(`Equipped title prefix: ${title}`, 'success');
  };

  const buySkin = (skinId: string, costDna: number) => {
    if (ownedSkins.includes(skinId)) {
      showToast(`You already own this skin!`, 'warning');
      return;
    }
    if (dna < costDna) {
      showToast(`Not enough DNA! Need ${costDna} DNA.`, 'warning');
      return;
    }
    setDna(prev => prev - costDna);
    setOwnedSkins(prev => [...prev, skinId]);
    showToast(`Purchased premium skin!`, 'success');
  };

  const claimSeasonReward = (tier: number, rewardType: 'coins' | 'dna' | 'title' | 'skin', rewardVal: any) => {
    if (claimedTiers.includes(tier)) {
      showToast("Reward already claimed!", "warning");
      return;
    }
    if (level < tier) {
      showToast(`Reach Level ${tier} to unlock this reward!`, "warning");
      return;
    }
    
    // Give reward
    if (rewardType === 'coins') {
      setCoins(prev => prev + rewardVal);
      showToast(`Claimed +${rewardVal} Coins!`, "success");
    } else if (rewardType === 'dna') {
      setDna(prev => prev + rewardVal);
      showToast(`Claimed +${rewardVal} DNA!`, "success");
    } else if (rewardType === 'title') {
      if (!ownedTitles.includes(rewardVal)) {
        setOwnedTitles(prev => [...prev, rewardVal]);
      }
      showToast(`Claimed ${rewardVal} Title Prefix!`, "success");
    } else if (rewardType === 'skin') {
      if (!ownedSkins.includes(rewardVal)) {
        setOwnedSkins(prev => [...prev, rewardVal]);
      }
      showToast(`Claimed Premium Skin!`, "success");
    }
    
    setClaimedTiers(prev => [...prev, tier]);
  };

  const claimDailyCoins = () => {
    const now = Date.now();
    const cooldown = 15000; // 15 seconds cooldown
    if (now - lastCoinClaim < cooldown) {
      const remaining = Math.ceil((cooldown - (now - lastCoinClaim)) / 1000);
      showToast(`Free Coins available in ${remaining}s!`, 'warning');
      return;
    }
    setCoins(prev => prev + 100);
    setLastCoinClaim(now);
    localStorage.setItem('dasgar_last_coin_claim', now.toString());
    showToast('Claimed +100 Daily Free Coins!', 'success');
  };

  const claimDailyDna = () => {
    const now = Date.now();
    const cooldown = 30000; // 30 seconds cooldown
    if (now - lastDnaClaim < cooldown) {
      const remaining = Math.ceil((cooldown - (now - lastDnaClaim)) / 1000);
      showToast(`Free DNA available in ${remaining}s!`, 'warning');
      return;
    }
    setDna(prev => prev + 5);
    setLastDnaClaim(now);
    localStorage.setItem('dasgar_last_dna_claim', now.toString());
    showToast('Claimed +5 Daily Free DNA!', 'success');
  };
  
  const [selectedSkin, setSelectedSkin] = useState<string>('naruto');
  const [showSkinSelector, setShowSkinSelector] = useState(false);
  const [customSkinUrl, setCustomSkinUrl] = useState('');
  const skinCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [showSettings, setShowSettings] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [controlMode, setControlMode] = useState<'joystick' | 'tap'>('joystick');
  const [stopOnRelease, setStopOnRelease] = useState(false);
  const [directionOnTouch, setDirectionOnTouch] = useState(false);

  const handleFocus = () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (document.body) document.body.scrollTop = 0;
    }, 50);
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const stateBufferRef = useRef<{time: number, state: GameStatePayload}[]>([]);
  const cameraRef = useRef({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 });
  const animationFrameRef = useRef<number>(0);
  
  const targetRef = useRef({ x: 0, y: 0, active: false });
  const joystickRef = useRef({ active: false, id: -1, originX: 0, originY: 0, currX: 0, currY: 0 });
  const localCellsRef = useRef<Map<string, { id: string, x: number, y: number, r: number, vx: number, vy: number, targetX?: number, targetY?: number }>>(new Map());
  const lastFrameTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketId(socket.id || null);
    });

    socket.on('state', (state: GameStatePayload) => {
      if (socket.id && socketId !== socket.id) {
        setSocketId(socket.id);
      }
      stateBufferRef.current.push({ time: performance.now(), state });
      if (stateBufferRef.current.length > 15) stateBufferRef.current.shift();

      setLeaderboard(state.lb);
      const me = state.p.find(p => p.id === socket.id);
      if (me) {
        setScore(me.s);
        const serverCellIds = new Set(me.cells.map(c => c.id));

        // Remove dead cells
        for (const [id] of localCellsRef.current.entries()) {
          if (!serverCellIds.has(id)) {
            localCellsRef.current.delete(id);
          }
        }

        // Update/spawn cells
        for (const sCell of me.cells) {
          const lCell = localCellsRef.current.get(sCell.id);
          if (!lCell) {
            localCellsRef.current.set(sCell.id, {
              id: sCell.id,
              x: sCell.x,
              y: sCell.y,
              r: sCell.r,
              vx: sCell.vx,
              vy: sCell.vy,
              targetX: sCell.x,
              targetY: sCell.y
            });
          } else {
            const errorX = sCell.x - lCell.x;
            const errorY = sCell.y - lCell.y;

            if (Math.hypot(errorX, errorY) > 200) {
              lCell.x = sCell.x;
              lCell.y = sCell.y;
              lCell.targetX = sCell.x;
              lCell.targetY = sCell.y;
            } else {
              lCell.targetX = sCell.x;
              lCell.targetY = sCell.y;
            }

            lCell.r = sCell.r;
            lCell.vx = sCell.vx;
            lCell.vy = sCell.vy;
          }
        }
      } else {
        localCellsRef.current.clear();
      }
    });

    socket.on('died', (scoreVal: number) => {
      setIsPlaying(false);
      setDead(true);
      setFinalScore(scoreVal);
      setIsSpectatorMode(false);

      // Award interactive progression items
      const earnedXp = Math.floor(scoreVal / 2);
      const earnedCoins = Math.floor(scoreVal / 5);
      const earnedDna = scoreVal >= 1000 ? 3 : (scoreVal >= 500 ? 1 : 0);

      setXp(prev => prev + earnedXp);
      setCoins(prev => prev + earnedCoins);
      if (earnedDna > 0) {
        setDna(prev => prev + earnedDna);
      }
      setGamesPlayed(prev => prev + 1);
      setMaxScore(prev => Math.max(prev, scoreVal));

      // Show death reward toast
      showToast(`Game Over! Earned +${earnedXp} XP and +${earnedCoins} Coins!${earnedDna > 0 ? ` (+${earnedDna} DNA)` : ''}`, 'info');
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
      localCellsRef.current.clear();
      const displayName = selectedTitle ? `${selectedTitle} ${name || 'Guest'}` : (name || 'Guest');
      socketRef.current.emit('join', displayName, selectedSkin);
      setIsSpectatorMode(false);
      setIsPlaying(true);
      setDead(false);
    }
  };

  const startSpectating = (e: React.MouseEvent) => {
    e.preventDefault();
    if (socketRef.current) {
      localCellsRef.current.clear();
      socketRef.current.emit('spectate');
      setIsSpectatorMode(true);
      setIsPlaying(true);
      setDead(false);
    }
  };

  const exitSpectating = () => {
    setIsSpectatorMode(false);
    setIsPlaying(false);
    if (socketRef.current) {
      socketRef.current.emit('leave');
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

    const getEventCoords = (e: PointerEvent) => {
      return { clientX: e.clientX, clientY: e.clientY };
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      // Ignore if clicking buttons (handled by stopping propagation on buttons)
      const coords = getEventCoords(e);
      const clientX = coords.clientX;
      const clientY = coords.clientY;
      
      if (controlMode === 'joystick') {
        if (!joystickRef.current.active) {
          joystickRef.current = {
            active: true, id: e.pointerId, 
            originX: clientX, originY: clientY,
            currX: clientX, currY: clientY
          };
          if (directionOnTouch) {
            const w = screenToWorld(clientX, clientY);
            updateTarget(w.x, w.y);
          }
        }
      } else {
        // Tap mode
        const w = screenToWorld(clientX, clientY);
        updateTarget(w.x, w.y);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const coords = getEventCoords(e);
      const clientX = coords.clientX;
      const clientY = coords.clientY;

      if (controlMode === 'joystick' && joystickRef.current.active && joystickRef.current.id === e.pointerId) {
        joystickRef.current.currX = clientX;
        joystickRef.current.currY = clientY;
        
        const dx = clientX - joystickRef.current.originX;
        const dy = clientY - joystickRef.current.originY;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 5) {
          // Push target far in that direction
          const targetWorldX = cameraRef.current.x + (dx * 1000) / cameraRef.current.zoom;
          const targetWorldY = cameraRef.current.y + (dy * 1000) / cameraRef.current.zoom;
          updateTarget(targetWorldX, targetWorldY);
        }
      } else if (controlMode === 'tap' && e.buttons > 0) {
        const w = screenToWorld(clientX, clientY);
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
      
      ctx.fillStyle = '#ffffff';
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

      // Track frame-by-frame delta time
      const now = performance.now();
      const frameDt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
      lastFrameTimeRef.current = now;

      // Update local simulation for our own cells
      if (isPlaying) {
        for (const cell of localCellsRef.current.values()) {
          cell.vx *= Math.pow(0.1, frameDt);
          cell.vy *= Math.pow(0.1, frameDt);
          if (Math.abs(cell.vx) < 1) cell.vx = 0;
          if (Math.abs(cell.vy) < 1) cell.vy = 0;

          const dx = targetRef.current.x - cell.x;
          const dy = targetRef.current.y - cell.y;
          const dist = Math.hypot(dx, dy);
          
          const mass = (cell.r / 10) ** 2;
          const speed = 1500 / Math.pow(mass, 0.5);

          let targetVx = 0, targetVy = 0;
          if (dist > 1 && targetRef.current.active) {
            targetVx = (dx / dist) * speed;
            targetVy = (dy / dist) * speed;
          }

          cell.x += (targetVx + cell.vx) * frameDt;
          cell.y += (targetVy + cell.vy) * frameDt;

          // Continuous frame-rate independent error correction towards the server position
          if (cell.targetX !== undefined && cell.targetY !== undefined) {
            const lerpFactor = 1 - Math.exp(-12 * frameDt); // corrects about 15-20% per frame at 60fps, completely smooth
            cell.x += (cell.targetX - cell.x) * lerpFactor;
            cell.y += (cell.targetY - cell.y) * lerpFactor;
          }

          cell.x = Math.max(cell.r, Math.min(WORLD_SIZE - cell.r, cell.x));
          cell.y = Math.max(cell.r, Math.min(WORLD_SIZE - cell.r, cell.y));
        }

        // Apply local repelling between our cells to avoid visual overlaps
        const localCells = Array.from(localCellsRef.current.values()) as { id: string, x: number, y: number, r: number, vx: number, vy: number }[];
        for (let i = 0; i < localCells.length; i++) {
          for (let j = i + 1; j < localCells.length; j++) {
            const c1 = localCells[i];
            const c2 = localCells[j];
            const dx = c2.x - c1.x;
            const dy = c2.y - c1.y;
            const dist = Math.hypot(dx, dy);
            const minDist = c1.r + c2.r;
            if (dist < minDist) {
              const overlap = minDist - dist;
              if (dist > 0) {
                const repelX = (dx / dist) * overlap * 0.5;
                const repelY = (dy / dist) * overlap * 0.5;
                c1.x -= repelX;
                c1.y -= repelY;
                c2.x += repelX;
                c2.y += repelY;
              }
            }
          }
        }
      }

      const interpolatedPlayers = s1.state.p.map(p1 => {
        if (p1.id === socketRef.current?.id) {
          return {
            ...p1,
            cells: Array.from(localCellsRef.current.values()) as { id: string, x: number, y: number, r: number, vx: number, vy: number }[]
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
              r: c0.r + (c1.r - c0.r) * t,
              vx: c1.vx,
              vy: c1.vy
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
        
        const targetZoom = Math.min(1.5, Math.max(0.1, canvas.width / (maxSize * 3)));
        cameraRef.current.zoom += (targetZoom - cameraRef.current.zoom) * 0.1;
      } else {
        // SPECTATOR MODE camera tracking: center on the top player on the leaderboard
        const topLeader = renderState.lb[0];
        const topPlayer = topLeader ? renderState.p.find(p => p.id === topLeader.id) : null;
        if (topPlayer && topPlayer.cells.length > 0) {
          let cmX = 0, cmY = 0, totalMass = 0;
          for (const cell of topPlayer.cells) {
            const mass = cell.r * cell.r;
            cmX += cell.x * mass;
            cmY += cell.y * mass;
            totalMass += mass;
          }
          cmX /= totalMass;
          cmY /= totalMass;

          cameraRef.current.x += (cmX - cameraRef.current.x) * 0.12;
          cameraRef.current.y += (cmY - cameraRef.current.y) * 0.12;
          
          const targetZoom = 0.65; // zoom out so they can see the action nicely
          cameraRef.current.zoom += (targetZoom - cameraRef.current.zoom) * 0.08;
        } else {
          // Fallback center of map
          cameraRef.current.x += (WORLD_SIZE / 2 - cameraRef.current.x) * 0.05;
          cameraRef.current.y += (WORLD_SIZE / 2 - cameraRef.current.y) * 0.05;
          const targetZoom = 0.5;
          cameraRef.current.zoom += (targetZoom - cameraRef.current.zoom) * 0.05;
        }
      }

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);
      ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

      // Grid
      ctx.strokeStyle = '#ececec';
      ctx.lineWidth = 1.5;
      const gridSize = 50;
      
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

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 12;
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
          
          // Draw direction control arrow for player's own cells
          const isMyCell = player.id === socketRef.current?.id;
          if (isMyCell && targetRef.current.active) {
            const dx = targetRef.current.x - cell.x;
            const dy = targetRef.current.y - cell.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 15) {
              const angle = Math.atan2(dy, dx);

              ctx.save();
              ctx.translate(cell.x, cell.y);
              ctx.rotate(angle);

              // Position the arrow floating outside the cell, pointing outwards
              const arrowSize = Math.max(16, Math.min(32, cell.r * 0.4));
              const distance = cell.r + Math.max(20, cell.r * 0.25);

              ctx.beginPath();
              // Tip (front point)
              ctx.moveTo(distance + arrowSize * 1.6, 0);
              // Back-left wing
              ctx.lineTo(distance, -arrowSize * 0.8);
              // Inner notch (indented back center)
              ctx.lineTo(distance + arrowSize * 0.4, 0);
              // Back-right wing
              ctx.lineTo(distance, arrowSize * 0.8);
              ctx.closePath();

              // Styling matching the image: sleek slate/silver gray with smooth rounded corners
              ctx.fillStyle = 'rgba(156, 163, 175, 0.85)'; // Neutral gray with a bit of opacity
              ctx.strokeStyle = 'rgba(156, 163, 175, 0.95)';
              ctx.lineWidth = 4; // Round out the sharp vertices using lineJoin and stroke
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.fill();
              ctx.stroke();

              ctx.restore();
            }
          }
          
          ctx.beginPath();
          ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI * 2);
          
          const img = getSkinImage(player.c, skinCacheRef.current);
          if (img) {
            ctx.save();
            ctx.clip();
            ctx.drawImage(img, cell.x - cell.r, cell.y - cell.r, cell.r * 2, cell.r * 2);
            ctx.restore();
          } else {
            const presetColor = SKINS.find(s => s.id === player.c && s.type === 'color');
            ctx.fillStyle = presetColor ? presetColor.color : (player.c || '#ff3366');
            ctx.fill();
          }
          
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

  const activeSkinObj = SKINS.find(s => s.id === selectedSkin);
  const isCustomUrl = !activeSkinObj && (selectedSkin.startsWith('http') || selectedSkin.startsWith('data:') || selectedSkin.startsWith('/'));

  return (
    <div className="absolute inset-0 bg-[#0a0a0a] overflow-hidden text-white font-sans selection:bg-[#00ff88] selection:text-black">
      {/* Top-Left Buttons */}
      {!showSkinSelector && (
        <div className="absolute top-4 left-4 z-[60] pointer-events-auto flex flex-col gap-3 ml-0">
          {/* Row 1: Settings, and XP + Zap when on the menu */}
          <div className="flex items-center gap-2.5">
            {/* Premium Settings Button */}
            <motion.button 
              type="button" 
              onClick={() => setShowSettings(true)}
              className="relative w-11 h-11 rounded-xl bg-gradient-to-b from-[#555] via-[#333] to-[#222] border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.4),_inset_0_1px_2px_rgba(255,255,255,0.3)] flex items-center justify-center group cursor-pointer overflow-hidden focus:outline-none"
              whileHover={{ 
                scale: 1.05,
                boxShadow: '0 0 15px rgba(255, 255, 255, 0.2), inset 0 1px 3px rgba(255,255,255,0.4)'
              }}
              whileTap={{ scale: 0.95 }}
              title="Settings"
            >
              {/* Inner shadow/highlight ring */}
              <div className="absolute inset-0.5 rounded-lg border border-white/15 pointer-events-none z-10" />
              {/* Elegant Gloss / Flare Overlay on the upper half */}
              <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-lg pointer-events-none z-10" />
              {/* Background shimmer animation */}
              <motion.div 
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-20 pointer-events-none z-10"
                animate={{ left: ['-100%', '200%'] }}
                transition={{ repeat: Infinity, repeatType: 'loop', duration: 3, ease: 'easeInOut' }}
              />
              <div className="relative z-10 flex items-center justify-center">
                <SettingsIcon className="w-5.5 h-5.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] stroke-[2]" />
              </div>
            </motion.button>

            {!isPlaying && (
              <>
                {/* XP Star Button */}
                <motion.button 
                  type="button" 
                  onClick={() => showToast(`XP Level: ${level} (${xpInLevel}/${xpNeeded} XP to next rank)`, 'info')}
                  className="relative w-11 h-11 rounded-full bg-gradient-to-b from-[#ffd700] to-[#e69500] border border-white/25 shadow-[0_4px_8px_rgba(0,0,0,0.4),_inset_0_1.5px_2px_rgba(255,255,255,0.4)] flex items-center justify-center group cursor-pointer overflow-hidden focus:outline-none"
                  whileHover={{ 
                    scale: 1.08,
                    boxShadow: '0 0 15px rgba(255, 215, 0, 0.45), inset 0 1.5px 3px rgba(255,255,255,0.5)'
                  }}
                  whileTap={{ scale: 0.92 }}
                  title="XP Booster Status"
                >
                  <div className="absolute inset-0.5 rounded-full border border-white/15 pointer-events-none z-10" />
                  <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-full pointer-events-none z-10" />
                  <div className="relative z-10 flex items-center justify-center">
                    <Star className="w-5.5 h-5.5 text-white fill-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                    <span className="absolute text-[8px] font-black text-[#e69500] tracking-tighter mt-[1px] select-none">XP</span>
                  </div>
                </motion.button>

                {/* Lightning Zap Button */}
                <motion.button 
                  type="button" 
                  onClick={() => showToast('Energy Full! Speed boost is at maximum capacity.', 'info')}
                  className="relative w-11 h-11 rounded-full bg-gradient-to-b from-[#0088ff] to-[#0044cc] border border-white/25 shadow-[0_4px_8px_rgba(0,0,0,0.4),_inset_0_1.5px_2px_rgba(255,255,255,0.4)] flex items-center justify-center group cursor-pointer overflow-hidden focus:outline-none"
                  whileHover={{ 
                    scale: 1.08,
                    boxShadow: '0 0 15px rgba(0, 136, 255, 0.45), inset 0 1.5px 3px rgba(255,255,255,0.5)'
                  }}
                  whileTap={{ scale: 0.92 }}
                  title="Lightning Power-Up Status"
                >
                  <div className="absolute inset-0.5 rounded-full border border-white/15 pointer-events-none z-10" />
                  <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-full pointer-events-none z-10" />
                  <div className="relative z-10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-white fill-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                  </div>
                </motion.button>
              </>
            )}
          </div>

          {/* Row 2: Shopping Cart Button (Menu only) */}
          {!isPlaying && (
            <div className="flex items-center">
              <motion.button 
                type="button" 
                onClick={() => setShowShopModal(true)}
                className="relative w-11 h-11 rounded-xl bg-gradient-to-b from-[#ff3355] via-[#dd1133] to-[#aa0011] border border-white/25 shadow-[0_4px_8px_rgba(0,0,0,0.4),_inset_0_1px_2px_rgba(255,255,255,0.3)] flex items-center justify-center group cursor-pointer overflow-hidden focus:outline-none"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: '0 0 15px rgba(255, 51, 85, 0.45), inset 0 1px 3px rgba(255,255,255,0.4)'
                }}
                whileTap={{ scale: 0.95 }}
                title="Arena Shop"
              >
                <div className="absolute inset-0.5 rounded-lg border border-white/15 pointer-events-none z-10" />
                <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-lg pointer-events-none z-10" />
                <motion.div 
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-20 pointer-events-none z-10"
                  animate={{ left: ['-100%', '200%'] }}
                  transition={{ repeat: Infinity, repeatType: 'loop', duration: 2.5, ease: 'easeInOut' }}
                />
                <div className="relative z-10 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] stroke-[2.5]" />
                </div>
              </motion.button>
            </div>
          )}
        </div>
      )}

      {!isPlaying && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a0a] overflow-hidden select-none">
          {!showSkinSelector ? (
            <>
              <img 
                src={narutoBg} 
            alt="Naruto Background" 
            className="absolute inset-0 w-full h-full object-cover opacity-100 pointer-events-none"
            referrerPolicy="no-referrer"
          />

          {/* Top-Right Currency & Season Widgets */}
          <div className="absolute top-4 right-4 z-50 flex flex-col gap-2.5 items-end pointer-events-auto">
            {/* Coins Widget */}
            <div className="flex items-center gap-2 bg-black/75 border border-white/10 rounded-full pl-2 pr-1 py-1 min-w-[170px] shadow-lg shadow-black/40">
              <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#ffd700] to-[#e69500] border border-black/30 flex items-center justify-center shadow-inner">
                <Coins className="w-4 h-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" />
              </div>
              <span className="flex-1 text-center font-mono font-black text-sm text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {coins}
              </span>
              <motion.button
                type="button"
                onClick={claimDailyCoins}
                className="w-6 h-6 rounded-full bg-[#00ff88] hover:bg-[#00cc6a] text-black font-black flex items-center justify-center shadow-md shadow-[#00ff88]/20 transition-all cursor-pointer focus:outline-none"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                title="Claim Free Coins"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </motion.button>
            </div>

            {/* DNA Widget */}
            <div className="flex items-center gap-2 bg-black/75 border border-white/10 rounded-full pl-2 pr-1 py-1 min-w-[170px] shadow-lg shadow-black/40">
              <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#00ff88] to-[#008c43] border border-black/30 flex items-center justify-center shadow-inner">
                <Dna className="w-4 h-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]" />
              </div>
              <span className="flex-1 text-center font-mono font-black text-sm text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {dna}
              </span>
              <motion.button
                type="button"
                onClick={claimDailyDna}
                className="w-6 h-6 rounded-full bg-[#00ff88] hover:bg-[#00cc6a] text-black font-black flex items-center justify-center shadow-md shadow-[#00ff88]/20 transition-all cursor-pointer focus:outline-none"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                title="Claim Free DNA"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </motion.button>
            </div>

            {/* SEASON Button */}
            <motion.button
              type="button"
              onClick={() => setShowSeasonModal(true)}
              className="relative w-[170px] h-10 rounded-xl bg-gradient-to-r from-[#ffd700] via-[#ffae00] to-[#e69500] border border-white/25 shadow-[0_4px_12px_rgba(255,174,0,0.25),_inset_0_1px_2px_rgba(255,255,255,0.4)] flex items-center justify-center gap-1.5 group cursor-pointer overflow-hidden focus:outline-none"
              whileHover={{ 
                scale: 1.05,
                boxShadow: '0 0 15px rgba(255, 174, 0, 0.45), inset 0 1px 3px rgba(255,255,255,0.5)'
              }}
              whileTap={{ scale: 0.95 }}
              title="Season Pass Rewards"
            >
              <div className="absolute inset-0.5 rounded-lg border border-white/10 pointer-events-none z-10" />
              <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-lg pointer-events-none z-10" />
              <motion.div 
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-20 pointer-events-none z-10"
                animate={{ left: ['-100%', '200%'] }}
                transition={{ repeat: Infinity, repeatType: 'loop', duration: 2.5, ease: 'easeInOut' }}
              />
              <div className="relative z-10 flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-white fill-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                <span className="font-black tracking-widest text-[10px] text-white uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  SEASON
                </span>
              </div>
            </motion.button>
          </div>

          {/* Bottom-Right Profile Card */}
          <div className="absolute bottom-4 right-4 z-50 pointer-events-auto">
            <motion.div
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-3 bg-black/85 border-2 border-[#3b82f6]/45 hover:border-[#3b82f6]/80 rounded-2xl p-2.5 w-[220px] shadow-[0_8px_24px_rgba(59,130,246,0.15)] transition-all cursor-pointer select-none"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Gold Star Level Badge */}
              <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                <Star className="w-10 h-10 text-[#ffd700] fill-[#ffd700]/15 stroke-[1.5]" />
                <span className="absolute text-xs font-black text-[#ffd700] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5">
                  {level}
                </span>
              </div>

              {/* Info & Segmented Progress Bar */}
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex justify-between items-center w-full mb-1">
                  <span className="text-[10px] font-black text-gray-200 tracking-wide truncate max-w-[65px]">
                    {selectedTitle ? `${selectedTitle} ` : ''}{username}
                  </span>
                  <span className="text-[8px] font-mono font-bold text-gray-400 shrink-0">
                    {xpInLevel}/{xpNeeded}
                  </span>
                </div>
                {/* Segmented green progress bar */}
                <div className="flex gap-0.5 h-1.5 w-full">
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`flex-1 rounded-[1px] transition-all duration-300 ${
                        idx < filledBlocks 
                          ? 'bg-[#00ff88] shadow-[0_0_4px_rgba(0,255,136,0.4)]' 
                          : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Avatar circle */}
              <div className="w-9 h-9 rounded-full bg-[#112244] border border-[#3b82f6]/30 flex items-center justify-center overflow-hidden shrink-0">
                <User className="w-5 h-5 text-[#3b82f6] fill-[#3b82f6]/10" />
              </div>
            </motion.div>
          </div>

          <form 
            onSubmit={startGame} 
            className="w-full max-w-[340px] z-10 p-4 text-center flex flex-col items-center select-none"
          >
            <h1 className="absolute top-3 left-1/2 -translate-x-1/2 text-4xl font-black text-center tracking-tight select-none flex items-center justify-center drop-shadow-[0_8px_16px_rgba(0,0,0,0.9)] landscape:top-1.5 landscape:text-3xl sm:text-5xl md:top-10 md:text-7xl md:m-0">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-neutral-200 to-neutral-400 font-black tracking-tight pr-0.5">
                Dasgar
              </span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#00ff88] to-cyan-400 font-black drop-shadow-[0_0_15px_rgba(0,255,136,0.7)]">
                .io
              </span>
            </h1>
            {dead && (
              <div className="mb-2 text-center">
                <p className="text-red-400 font-medium text-xs">You died!</p>
                <p className="text-sm font-bold text-white">Final Mass: {Math.round(finalScore)}</p>
              </div>
            )}


            {/* Skin Chooser Circle - Centered in the menu */}
            <div className="relative flex flex-col items-center mb-3 z-20">
              <div 
                onClick={() => setShowSkinSelector(!showSkinSelector)}
                className="relative w-32 h-32 rounded-full cursor-pointer group shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
              >
                <div className="w-full h-full rounded-full overflow-hidden border-4 border-white/20 group-hover:border-[#00ff88]/60 transition-colors bg-black/40 flex items-center justify-center">
                  {activeSkinObj ? (
                    activeSkinObj.type === 'image' ? (
                      <img 
                        src={activeSkinObj.image} 
                        alt={activeSkinObj.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div 
                        className="w-full h-full rounded-full" 
                        style={{ backgroundColor: activeSkinObj.color }} 
                      />
                    )
                  ) : isCustomUrl ? (
                    <img 
                      src={selectedSkin} 
                      alt="Custom Skin" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/bottts/svg?seed=fallback';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#3366ff] to-[#ff3366]" />
                  )}
                </div>

                {/* Floating Plus Button at Top Right */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSkinSelector(!showSkinSelector);
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#00ff88] hover:bg-[#00cc6a] text-black font-bold flex items-center justify-center shadow-lg shadow-[#00ff88]/30 border-2 border-[#111] transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
                  title="Choose Skin"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>


              {/* Skin Selector Panel */}
              {false && (
                <div 
                  className="fixed inset-0 flex items-center justify-center z-[150] bg-black/95 backdrop-blur-md p-4 md:p-8 overflow-hidden select-none"
                  onClick={() => setShowSkinSelector(false)}
                >
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative w-full h-full max-w-5xl max-h-[92vh] bg-[#020512] border-2 border-amber-400/30 rounded-[2.5rem] shadow-[0_0_60px_rgba(255,215,0,0.18)] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Glowing Hexagonal Cyber Grid Background */}
                    <div 
                      className="absolute inset-0 opacity-15 pointer-events-none" 
                      style={{ 
                        backgroundImage: `radial-gradient(circle, transparent 20%, #020512 85%), url("data:image/svg+xml,%3Csvg width='30' height='51.96' viewBox='0 0 30 51.96' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M15 0 L30 8.66 L30 25.98 L15 34.64 L0 25.98 L0 8.66 Z M0 51.96 L15 43.3 L30 51.96 L30 34.64 L15 25.98 L0 34.64 Z' fill='%233b82f6' fill-opacity='0.2' fill-rule='evenodd' stroke='%233b82f6' stroke-width='0.6' stroke-opacity='0.4'/%3E%3C/svg%3E")`,
                        backgroundSize: '30px 51.96px'
                      }}
                    />

                    {/* Concentric Watermark Radar & Leaf Village Crest */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                      <svg viewBox="0 0 100 100" className="w-80 h-80 text-blue-500/10 fill-none stroke-blue-500/20" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="50" cy="50" r="46" strokeDasharray="10 6" className="stroke-blue-500/15" />
                        <circle cx="50" cy="50" r="42" className="stroke-blue-500/10" />
                        <circle cx="50" cy="50" r="35" strokeDasharray="40 10" className="stroke-blue-500/20" />
                        <g transform="translate(10, 8) scale(0.8)">
                          <path 
                            d="M 52,50 C 47,46 43,51 46,55 C 51,60 59,52 56,45 C 52,36 39,40 37,52 C 34,65 52,69 61,61 C 71,52 69,35 55,29 C 41,23 25,32 23,48" 
                            className="stroke-blue-500/35" 
                            strokeWidth="4" 
                          />
                          <path 
                            d="M 23,48 L 14,40 L 25,38 Z" 
                            className="fill-blue-500/20 stroke-blue-500/35" 
                            strokeWidth="3.5" 
                          />
                          <path 
                            d="M 58,23 L 69,28" 
                            className="stroke-blue-500/35" 
                            strokeWidth="4" 
                          />
                        </g>
                      </svg>
                    </div>

                    {/* Cyber Blue Piping */}
                    <div className="absolute inset-4 rounded-[2rem] border border-cyan-500/15 pointer-events-none shadow-[inset_0_0_30px_rgba(6,182,212,0.1)]" />
                    <div className="absolute top-8 bottom-8 left-6 w-[1.5px] bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent pointer-events-none" />
                    <div className="absolute top-8 bottom-8 right-6 w-[1.5px] bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

                    {/* Gold Futuristic Corner Brackets */}
                    <div className="absolute top-3 left-3 w-12 h-12 border-t-4 border-l-4 border-amber-400/80 rounded-tl-3xl pointer-events-none shadow-[-4px_-4px_10px_rgba(251,191,36,0.3)]" />
                    <div className="absolute top-3 left-14 w-8 h-1 bg-amber-400/80 pointer-events-none skew-x-12" />
                    <div className="absolute top-14 left-3 w-1 bg-amber-400/80 h-8 pointer-events-none skew-y-12" />

                    <div className="absolute top-3 right-3 w-12 h-12 border-t-4 border-r-4 border-amber-400/80 rounded-tr-3xl pointer-events-none shadow-[4px_-4px_10px_rgba(251,191,36,0.3)]" />
                    <div className="absolute top-3 right-14 w-8 h-1 bg-amber-400/80 pointer-events-none -skew-x-12" />
                    <div className="absolute top-14 right-3 w-1 bg-amber-400/80 h-8 pointer-events-none -skew-y-12" />

                    <div className="absolute bottom-3 left-3 w-12 h-12 border-b-4 border-l-4 border-amber-400/80 rounded-bl-3xl pointer-events-none shadow-[-4px_4px_10px_rgba(251,191,36,0.3)]" />
                    <div className="absolute bottom-3 left-14 w-8 h-1 bg-amber-400/80 pointer-events-none -skew-x-12" />
                    <div className="absolute bottom-14 left-3 w-1 bg-amber-400/80 h-8 pointer-events-none -skew-y-12" />

                    <div className="absolute bottom-3 right-3 w-12 h-12 border-b-4 border-r-4 border-amber-400/80 rounded-br-3xl pointer-events-none shadow-[4px_4px_10px_rgba(251,191,36,0.3)]" />
                    <div className="absolute bottom-3 right-14 w-8 h-1 bg-amber-400/80 pointer-events-none skew-x-12" />
                    <div className="absolute bottom-14 right-3 w-1 bg-amber-400/80 h-8 pointer-events-none skew-y-12" />

                    {/* Top Central Header Banner - "SKINS" */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center select-none">
                      <div className="relative flex items-center justify-center mb-0.5">
                        <div className="absolute inset-0 bg-amber-400/25 blur-md rounded-full" />
                        <Crown className="w-8 h-8 text-amber-400 fill-amber-300/10 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
                      </div>
                      <div className="relative px-12 py-1.5 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 border-b-2 border-amber-300 rounded-b-xl shadow-[0_4px_15px_rgba(251,191,36,0.25)] flex items-center justify-center min-w-[200px]">
                        <div className="absolute left-0 top-0 -translate-x-full border-y-[10px] border-y-transparent border-r-[15px] border-r-amber-500" />
                        <div className="absolute right-0 top-0 translate-x-full border-y-[10px] border-y-transparent border-l-[15px] border-l-amber-500" />
                        <span className="font-sans font-black tracking-[0.25em] text-sm text-black uppercase drop-shadow-[0_0.5px_0.5px_rgba(255,255,255,0.4)]">
                          SKINS
                        </span>
                      </div>
                    </div>

                    {/* Close (X) button */}
                    <button 
                      type="button" 
                      onClick={() => setShowSkinSelector(false)}
                      className="absolute top-5 right-5 z-30 w-10 h-10 rounded-full bg-[#030a1c] border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)] flex items-center justify-center text-white hover:text-cyan-300 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none"
                    >
                      <X className="w-5 h-5 stroke-[2.5]" />
                    </button>

                    {/* Content Columns inside HUD Frame */}
                    <div className="flex-1 overflow-hidden p-8 md:p-12 pt-16 flex flex-col lg:flex-row gap-8 w-full h-full items-stretch relative z-10">
                      {/* Left Side: Active Skin Preview */}
                      <div className="w-full lg:w-[320px] flex flex-col justify-center items-center p-6 bg-[#040c24]/50 border border-cyan-500/10 rounded-[2rem] backdrop-blur-md relative overflow-hidden shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />
                        <h3 className="text-[10px] font-black tracking-widest text-cyan-400 uppercase mb-4">ACTIVE SKIN</h3>

                        {/* Large circle preview */}
                        <div className="relative w-40 h-40 rounded-full bg-black/40 border-4 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.35)] flex items-center justify-center overflow-hidden mb-4 group">
                          {activeSkinObj ? (
                            activeSkinObj.type === 'image' ? (
                              <img 
                                src={activeSkinObj.image} 
                                alt={activeSkinObj.name} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full" style={{ backgroundColor: activeSkinObj.color }} />
                            )
                          ) : selectedSkin ? (
                            <img 
                              src={selectedSkin} 
                              alt="Custom Skin" 
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-tr from-[#3366ff] to-[#ff3366]" />
                          )}
                        </div>

                        <span className="text-base font-bold text-white tracking-wide mb-6">
                          {activeSkinObj ? activeSkinObj.name : 'Custom Web Skin'}
                        </span>

                        {/* Custom URL Option */}
                        <div className="w-full border-t border-white/5 pt-4">
                          <label className="block text-[9px] font-black tracking-widest text-gray-400 mb-2 uppercase">
                            Use Custom URL
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="https://example.com/skin.png"
                              value={customSkinUrl}
                              onChange={(e) => setCustomSkinUrl(e.target.value)}
                              onFocus={handleFocus}
                              className="flex-1 bg-black/60 border border-cyan-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400 transition-all duration-200"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (customSkinUrl.trim()) {
                                  setSelectedSkin(customSkinUrl.trim());
                                  showToast('Custom skin applied!', 'success');
                                }
                              }}
                              className="bg-amber-400 hover:bg-amber-500 text-black font-black text-xs px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer focus:outline-none shadow-[0_2px_10px_rgba(251,191,36,0.3)]"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Scrollable Presets Grid */}
                      <div className="flex-1 flex flex-col p-2 min-h-0">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                          <h3 className="text-[10px] font-black tracking-widest text-cyan-400 uppercase">CHOOSE PRESET SKIN</h3>
                          <span className="text-[9px] font-mono text-gray-400 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                            {SKINS.length + PREMIUM_SKINS.length} SKINS
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-6 max-h-[50vh] md:max-h-[58vh] scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-transparent">
                          {/* Standard Skins */}
                          <div>
                            <h4 className="text-[9px] font-black text-gray-400 tracking-wider uppercase mb-3 flex items-center gap-2">
                              <span>STANDARD SKIN COLLECTION</span>
                              <div className="h-[1px] flex-1 bg-white/5" />
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {SKINS.map((skin) => (
                                <button
                                  key={skin.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedSkin(skin.id);
                                    showToast(`${skin.name} Equipped!`, 'success');
                                  }}
                                  className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                                    selectedSkin === skin.id 
                                      ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.35)] scale-[0.98]' 
                                      : 'border-white/5 bg-black/40 hover:border-cyan-500/30 hover:bg-cyan-950/10'
                                  }`}
                                >
                                  <div className="w-14 h-14 rounded-full overflow-hidden bg-black/40 flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform">
                                    {skin.type === 'image' ? (
                                      <img 
                                        src={skin.image} 
                                        alt={skin.name} 
                                        className="w-full h-full object-cover" 
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="w-full h-full" style={{ backgroundColor: skin.color }} />
                                    )}
                                  </div>
                                  <span className="text-[11px] font-bold text-gray-300 group-hover:text-white transition-colors text-center truncate w-full">
                                    {skin.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Premium Skins */}
                          <div>
                            <h4 className="text-[9px] font-black text-amber-400 tracking-wider uppercase mb-3 flex items-center gap-2">
                              <span>LEGENDARY SHINOBI SKINS</span>
                              <div className="h-[1px] flex-1 bg-amber-400/10" />
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {PREMIUM_SKINS.map((skin) => {
                                const isOwned = ownedSkins.includes(skin.id);
                                return (
                                  <button
                                    key={skin.id}
                                    type="button"
                                    onClick={() => {
                                      if (!isOwned) {
                                        showToast(`${skin.name} is locked! Unlock in Arena Shop.`, 'warning');
                                        setShowSkinSelector(false);
                                        setShowShopModal(true);
                                        return;
                                      }
                                      setSelectedSkin(skin.id);
                                      showToast(`Legendary skin ${skin.name} equipped!`, 'success');
                                    }}
                                    className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                                      selectedSkin === skin.id 
                                        ? 'border-amber-400 bg-amber-950/15 shadow-[0_0_15px_rgba(251,191,36,0.35)] scale-[0.98]' 
                                        : 'border-white/5 bg-black/40 hover:border-amber-400/30 hover:bg-amber-950/5'
                                    }`}
                                  >
                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-black/40 flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform relative">
                                      <img 
                                        src={skin.image} 
                                        alt={skin.name} 
                                        className="w-full h-full object-cover" 
                                        referrerPolicy="no-referrer"
                                      />
                                      {!isOwned && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                                          <Lock className="w-4 h-4 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-300 group-hover:text-white transition-colors text-center flex items-center gap-1 justify-center truncate w-full">
                                      {skin.name}
                                      <Crown className="w-3 h-3 text-[#ffae00] fill-[#ffae00]/20 shrink-0" />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>
            
            {/* Nickname bar: smaller, white background, rounded-full */}
            <input 
              type="text" 
              placeholder="Nickname" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={handleFocus}
              maxLength={15}
              className="w-full max-w-[240px] mx-auto self-center bg-white border border-white/10 rounded-full px-4 py-1.5 text-sm text-neutral-900 placeholder-neutral-400 font-semibold focus:outline-none focus:ring-2 focus:ring-[#00ff88] transition-all mb-3 text-center z-10"
            />
            
            {/* Action buttons: compact & moved up close */}
            <div className="flex justify-center items-center py-1 w-full gap-2.5 max-w-sm">
              {/* Left Button - SPECTATE (Red Premium) */}
              <motion.button 
                type="button" 
                onClick={startSpectating}
                className="relative flex-1 max-w-[85px] h-12 rounded-xl bg-gradient-to-b from-[#ff3355] via-[#dd1133] to-[#aa0011] border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.4),_inset_0_1px_2px_rgba(255,255,255,0.3)] flex flex-col items-center justify-center gap-0.5 group cursor-pointer overflow-hidden focus:outline-none"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: '0 0 15px rgba(255, 51, 85, 0.4), inset 0 1px 3px rgba(255,255,255,0.4)'
                }}
                whileTap={{ scale: 0.95 }}
              >
                {/* Inner shadow/highlight ring */}
                <div className="absolute inset-0.5 rounded-lg border border-white/15 pointer-events-none z-10" />
                {/* Elegant Gloss / Flare Overlay on the upper half */}
                <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-lg pointer-events-none z-10" />
                {/* Background shimmer animation */}
                <motion.div 
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-20 pointer-events-none z-10"
                  animate={{ left: ['-100%', '200%'] }}
                  transition={{ repeat: Infinity, repeatType: 'loop', duration: 2.8, ease: 'easeInOut' }}
                />
                <div className="relative z-10 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] stroke-[2]" />
                </div>
                <span className="relative z-10 font-black tracking-wider text-[8px] text-white uppercase select-none drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.5)]">
                  SPECTATE
                </span>
              </motion.button>

              {/* Center Button - PLAY (Green Premium) */}
              <motion.button 
                type="submit" 
                className="relative flex-1 max-w-[110px] h-14 rounded-xl bg-gradient-to-b from-[#00ff88] via-[#00cc6a] to-[#008c43] border-2 border-white/30 shadow-[0_6px_12px_rgba(0,0,0,0.5),_inset_0_1.5px_3px_rgba(255,255,255,0.4)] flex flex-col items-center justify-center gap-0.5 group cursor-pointer overflow-hidden focus:outline-none"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: '0 0 20px rgba(0, 255, 136, 0.5), inset 0 1.5px 4px rgba(255,255,255,0.6)'
                }}
                whileTap={{ scale: 0.95 }}
              >
                {/* Inner shadow/highlight ring */}
                <div className="absolute inset-0.5 rounded-lg border border-white/20 pointer-events-none z-10" />
                {/* Elegant Gloss / Flare Overlay on the upper half */}
                <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/25 to-transparent rounded-t-lg pointer-events-none z-10" />
                {/* Background shimmer animation */}
                <motion.div 
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-20 pointer-events-none z-10"
                  animate={{ left: ['-100%', '200%'] }}
                  transition={{ repeat: Infinity, repeatType: 'loop', duration: 3, ease: 'easeInOut' }}
                />
                <div className="relative z-10 flex items-center justify-center">
                  <Gamepad2 className="w-6 h-6 text-white fill-white/10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] stroke-[1.75]" />
                </div>
                <span className="relative z-10 font-black tracking-[0.12em] text-sm text-white uppercase select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform duration-200">
                  PLAY
                </span>
              </motion.button>

              {/* Right Button - MORE (Blue Premium) */}
              <motion.button 
                type="button" 
                onClick={() => setShowSettings(true)}
                className="relative flex-1 max-w-[85px] h-12 rounded-xl bg-gradient-to-b from-[#0088ff] via-[#0066cc] to-[#004499] border border-white/20 shadow-[0_4px_8px_rgba(0,0,0,0.4),_inset_0_1px_2px_rgba(255,255,255,0.3)] flex flex-col items-center justify-center gap-0.5 group cursor-pointer overflow-hidden focus:outline-none"
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: '0 0 15px rgba(0, 136, 255, 0.4), inset 0 1px 3px rgba(255,255,255,0.4)'
                }}
                whileTap={{ scale: 0.95 }}
              >
                {/* Inner shadow/highlight ring */}
                <div className="absolute inset-0.5 rounded-lg border border-white/15 pointer-events-none z-10" />
                {/* Elegant Gloss / Flare Overlay on the upper half */}
                <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-lg pointer-events-none z-10" />
                {/* Background shimmer animation */}
                <motion.div 
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-20 pointer-events-none z-10"
                  animate={{ left: ['-100%', '200%'] }}
                  transition={{ repeat: Infinity, repeatType: 'loop', duration: 3.2, ease: 'easeInOut' }}
                />
                <div className="relative z-10 flex items-center justify-center">
                  <MoreHorizontal className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] stroke-[2]" />
                </div>
                <span className="relative z-10 font-black tracking-wider text-[8px] text-white uppercase select-none drop-shadow-[0_0.5px_1px_rgba(0,0,0,0.5)]">
                  MORE
                </span>
              </motion.button>
            </div>
          </form>
          </>
          ) : (
            /* Full screen Skin Selector Panel */
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="relative w-full h-full bg-[#020512] flex flex-col overflow-hidden select-none"
            >
              {/* Glowing Hexagonal Cyber Grid Background */}
              <div 
                className="absolute inset-0 opacity-15 pointer-events-none" 
                style={{ 
                  backgroundImage: `radial-gradient(circle, transparent 20%, #020512 85%), url("data:image/svg+xml,%3Csvg width='30' height='51.96' viewBox='0 0 30 51.96' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M15 0 L30 8.66 L30 25.98 L15 34.64 L0 25.98 L0 8.66 Z M0 51.96 L15 43.3 L30 51.96 L30 34.64 L15 25.98 L0 34.64 Z' fill='%233b82f6' fill-opacity='0.2' fill-rule='evenodd' stroke='%233b82f6' stroke-width='0.6' stroke-opacity='0.4'/%3E%3C/svg%3E")`,
                  backgroundSize: '30px 51.96px'
                }}
              />

              {/* Concentric Watermark Radar & Leaf Village Crest */}
              <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                <svg viewBox="0 0 100 100" className="w-80 h-80 text-blue-500/10 fill-none stroke-blue-500/20" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="50" cy="50" r="46" strokeDasharray="10 6" className="stroke-blue-500/15" />
                  <circle cx="50" cy="50" r="42" className="stroke-blue-500/10" />
                  <circle cx="50" cy="50" r="35" strokeDasharray="40 10" className="stroke-blue-500/20" />
                  <g transform="translate(10, 8) scale(0.8)">
                    <path 
                      d="M 52,50 C 47,46 43,51 46,55 C 51,60 59,52 56,45 C 52,36 39,40 37,52 C 34,65 52,69 61,61 C 71,52 69,35 55,29 C 41,23 25,32 23,48" 
                      className="stroke-blue-500/35" 
                      strokeWidth="4" 
                    />
                    <path 
                      d="M 23,48 L 14,40 L 25,38 Z" 
                      className="fill-blue-500/20 stroke-blue-500/35" 
                      strokeWidth="3.5" 
                    />
                    <path 
                      d="M 58,23 L 69,28" 
                      className="stroke-blue-500/35" 
                      strokeWidth="3.5" 
                    />
                  </g>
                </svg>
              </div>

              {/* Cyber Blue Piping */}
              <div className="absolute inset-4 rounded-[2rem] border border-cyan-500/15 pointer-events-none shadow-[inset_0_0_30px_rgba(6,182,212,0.1)]" />
              <div className="absolute top-8 bottom-8 left-6 w-[1.5px] bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent pointer-events-none" />
              <div className="absolute top-8 bottom-8 right-6 w-[1.5px] bg-gradient-to-b from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

              {/* Gold Futuristic Corner Brackets */}
              <div className="absolute top-3 left-3 w-12 h-12 border-t-4 border-l-4 border-amber-400/80 rounded-tl-3xl pointer-events-none shadow-[-4px_-4px_10px_rgba(251,191,36,0.3)]" />
              <div className="absolute top-3 left-14 w-8 h-1 bg-amber-400/80 pointer-events-none skew-x-12" />
              <div className="absolute top-14 left-3 w-1 bg-amber-400/80 h-8 pointer-events-none skew-y-12" />

              <div className="absolute top-3 right-3 w-12 h-12 border-t-4 border-r-4 border-amber-400/80 rounded-tr-3xl pointer-events-none shadow-[4px_-4px_10px_rgba(251,191,36,0.3)]" />
              <div className="absolute top-3 right-14 w-8 h-1 bg-amber-400/80 pointer-events-none -skew-x-12" />
              <div className="absolute top-14 right-3 w-1 bg-amber-400/80 h-8 pointer-events-none -skew-y-12" />

              <div className="absolute bottom-3 left-3 w-12 h-12 border-b-4 border-l-4 border-amber-400/80 rounded-bl-3xl pointer-events-none shadow-[-4px_4px_10px_rgba(251,191,36,0.3)]" />
              <div className="absolute bottom-3 left-14 w-8 h-1 bg-amber-400/80 pointer-events-none -skew-x-12" />
              <div className="absolute bottom-14 left-3 w-1 bg-amber-400/80 h-8 pointer-events-none -skew-y-12" />

              <div className="absolute bottom-3 right-3 w-12 h-12 border-b-4 border-r-4 border-amber-400/80 rounded-br-3xl pointer-events-none shadow-[4px_4px_10px_rgba(251,191,36,0.3)]" />
              <div className="absolute bottom-3 right-14 w-8 h-1 bg-amber-400/80 pointer-events-none skew-x-12" />
              <div className="absolute bottom-14 right-3 w-1 bg-amber-400/80 h-8 pointer-events-none skew-y-12" />

              {/* Top Central Header Banner */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center select-none pointer-events-none">
                {/* Metallic polygon background with gold borders */}
                <div 
                  className="relative h-12 w-64 bg-gradient-to-b from-[#101935] to-[#04091a] border-b-2 border-x-2 border-amber-400/60 flex items-center justify-center shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
                  style={{
                    clipPath: 'polygon(0% 0%, 100% 0%, 85% 100%, 15% 100%)'
                  }}
                >
                  {/* Subtle inner grid lines */}
                  <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'linear-gradient(90deg, #3b82f6 1px, transparent 1px)', backgroundSize: '8px 100%' }} />
                  
                  {/* Text */}
                  <span className="text-xl font-black tracking-[0.25em] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase">
                    SKINS
                  </span>
                </div>
                {/* Small neon accent bar below */}
                <div className="w-24 h-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] mt-0.5" />
              </div>

              {/* Close (X) button */}
              <button 
                type="button" 
                onClick={() => setShowSkinSelector(false)}
                className="absolute top-5 right-5 z-30 w-10 h-10 rounded-full bg-[#030a1c] border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)] flex items-center justify-center text-white hover:text-cyan-300 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>

              {/* Content Columns inside HUD Frame */}
              <div className="flex-1 overflow-hidden p-8 md:p-12 pt-16 flex flex-col lg:flex-row gap-8 w-full h-full items-stretch relative z-10">
                {/* Left Side: Selected Skin Large Hologram Style View */}
                <div className="w-full lg:w-[320px] bg-black/45 border border-cyan-500/15 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden shrink-0">
                  {/* Glowing vertical ambient laser line behind skin */}
                  <div className="absolute inset-y-0 w-[2px] bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent pointer-events-none" />
                  
                  <h3 className="text-[10px] font-black tracking-widest text-cyan-400 uppercase mb-5 self-start">CURRENT ACTIVE</h3>

                  {/* Hologram stage pedestal */}
                  <div className="relative w-44 h-44 flex items-center justify-center mb-6">
                    {/* Ring animations */}
                    <motion.div 
                      className="absolute bottom-0 w-36 h-8 rounded-full border border-cyan-500/20 bg-cyan-950/5" 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
                    />
                    <motion.div 
                      className="absolute bottom-1 w-28 h-6 rounded-full border border-cyan-400/40" 
                      animate={{ rotate: -360 }}
                      transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
                    />
                    
                    {/* Skin display itself */}
                    <div className="relative z-10 w-28 h-28 rounded-full border-4 border-cyan-400/50 shadow-[0_0_35px_rgba(34,211,238,0.3)] bg-[#030a1c] overflow-hidden flex items-center justify-center">
                      {activeSkinObj ? (
                        activeSkinObj.type === 'image' ? (
                          <img 
                            src={activeSkinObj.image} 
                            alt={activeSkinObj.name} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full" style={{ backgroundColor: activeSkinObj.color }} />
                        )
                      ) : isCustomUrl ? (
                        <img 
                          src={selectedSkin} 
                          alt="Custom Skin" 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-[#3366ff] to-[#ff3366]" />
                      )}
                    </div>
                  </div>

                  <span className="text-base font-bold text-white tracking-wide mb-6">
                    {activeSkinObj ? activeSkinObj.name : 'Custom Web Skin'}
                  </span>

                  {/* Custom URL Option */}
                  <div className="w-full border-t border-white/5 pt-4">
                    <label className="block text-[9px] font-black tracking-widest text-gray-400 mb-2 uppercase">
                      Use Custom URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="https://example.com/skin.png"
                        value={customSkinUrl}
                        onChange={(e) => setCustomSkinUrl(e.target.value)}
                        onFocus={handleFocus}
                        className="flex-1 bg-black/60 border border-cyan-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400 transition-all duration-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customSkinUrl.trim()) {
                            setSelectedSkin(customSkinUrl.trim());
                            showToast('Custom skin applied!', 'success');
                          }
                        }}
                        className="bg-amber-400 hover:bg-amber-500 text-black font-black text-xs px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer focus:outline-none shadow-[0_2px_10px_rgba(251,191,36,0.3)]"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side: Scrollable Presets Grid */}
                <div className="flex-1 flex flex-col p-2 min-h-0">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                    <h3 className="text-[10px] font-black tracking-widest text-cyan-400 uppercase">CHOOSE PRESET SKIN</h3>
                    <span className="text-[9px] font-mono text-gray-400 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                      {SKINS.length + PREMIUM_SKINS.length} SKINS
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-transparent">
                    {/* Standard Skins */}
                    <div>
                      <h4 className="text-[9px] font-black text-gray-400 tracking-wider uppercase mb-3 flex items-center gap-2">
                        <span>STANDARD SKIN COLLECTION</span>
                        <div className="h-[1px] flex-1 bg-white/5" />
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {SKINS.map((skin) => (
                          <button
                            key={skin.id}
                            type="button"
                            onClick={() => {
                              setSelectedSkin(skin.id);
                              showToast(`${skin.name} Equipped!`, 'success');
                            }}
                            className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                              selectedSkin === skin.id 
                                ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_15px_rgba(6,182,212,0.35)] scale-[0.98]' 
                                : 'border-white/5 bg-black/40 hover:border-cyan-500/30 hover:bg-cyan-950/10'
                            }`}
                          >
                            <div className="w-14 h-14 rounded-full overflow-hidden bg-black/40 flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform">
                              {skin.type === 'image' ? (
                                <img 
                                  src={skin.image} 
                                  alt={skin.name} 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full" style={{ backgroundColor: skin.color }} />
                              )}
                            </div>
                            <span className="text-[11px] font-bold text-gray-300 group-hover:text-white transition-colors text-center truncate w-full">
                              {skin.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Premium Skins */}
                    <div>
                      <h4 className="text-[9px] font-black text-amber-400 tracking-wider uppercase mb-3 flex items-center gap-2">
                        <span>LEGENDARY SHINOBI SKINS</span>
                        <div className="h-[1px] flex-1 bg-amber-400/10" />
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {PREMIUM_SKINS.map((skin) => {
                          const isOwned = ownedSkins.includes(skin.id);
                          return (
                            <button
                              key={skin.id}
                              type="button"
                              onClick={() => {
                                if (!isOwned) {
                                  showToast(`${skin.name} is locked! Unlock in Arena Shop.`, 'warning');
                                  setShowSkinSelector(false);
                                  setShowShopModal(true);
                                  return;
                                }
                                setSelectedSkin(skin.id);
                                showToast(`Legendary skin ${skin.name} equipped!`, 'success');
                              }}
                              className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                                selectedSkin === skin.id 
                                  ? 'border-amber-400 bg-amber-950/15 shadow-[0_0_15px_rgba(251,191,36,0.35)] scale-[0.98]' 
                                  : 'border-white/5 bg-black/40 hover:border-amber-400/30 hover:bg-amber-950/5'
                              }`}
                            >
                              <div className="w-14 h-14 rounded-full overflow-hidden bg-black/40 flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform relative">
                                <img 
                                  src={skin.image} 
                                  alt={skin.name} 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer"
                                />
                                {!isOwned && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                                    <Lock className="w-4 h-4 text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] font-bold text-gray-300 group-hover:text-white transition-colors text-center flex items-center gap-1 justify-center truncate w-full">
                                {skin.name}
                                <Crown className="w-3 h-3 text-[#ffae00] fill-[#ffae00]/20 shrink-0" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {isPlaying && (
        <>
          <canvas ref={canvasRef} className="w-full h-full block touch-none" />
          
          <div className="absolute top-4 left-[72px] pointer-events-none select-none z-40">
            {isSpectatorMode ? (
              <div className="bg-red-500/20 backdrop-blur border border-red-500/40 rounded-lg px-4 py-2 font-mono text-lg font-bold text-red-400 flex items-center gap-2 shadow-[0_4px_12px_rgba(239,68,68,0.2)]">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                SPECTATOR MODE
              </div>
            ) : (
              <div className="bg-black/50 backdrop-blur border border-white/10 rounded-lg px-4 py-2 font-mono text-xl">
                Mass: <span className="text-[#00ff88] font-bold">{Math.round(score)}</span>
              </div>
            )}
          </div>

          {/* Leaderboard Toggle Button / Card */}
          <div className="absolute top-4 right-4 z-40 select-none flex flex-col items-end gap-2">
            {!showLeaderboard ? (
              <motion.button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setShowLeaderboard(true);
                }}
                className="relative w-14 h-14 rounded-2xl bg-[#262729] border border-[#3e4146] shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.08)] flex items-center justify-center cursor-pointer overflow-hidden group focus:outline-none"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {/* Inner Bezel Border */}
                <div className="absolute inset-1 rounded-[12px] border border-[#1b1c1e] bg-gradient-to-b from-[#2a2b2e] to-[#1e1f21] flex items-center justify-center">
                  {/* Custom Podium SVG matching reference exactly */}
                  <svg viewBox="0 0 64 64" className="w-8 h-8 text-[#b5b9c0] filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" fill="currentColor">
                    {/* Left step (2) */}
                    <rect x="12" y="30" width="13" height="14" rx="2" />
                    {/* Center step (1) */}
                    <rect x="25" y="21" width="14" height="23" rx="2" />
                    {/* Right step (3) */}
                    <rect x="39" y="33" width="13" height="11" rx="2" />
                    
                    {/* Numbers */}
                    <text x="32" y="33" fill="#3a3c42" fontSize="9" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">1</text>
                    <text x="18.5" y="40" fill="#3a3c42" fontSize="8" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">2</text>
                    <text x="45.5" y="41" fill="#3a3c42" fontSize="7.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">3</text>
                  </svg>
                </div>
              </motion.button>
            ) : (
              <div className="w-52 bg-black/60 backdrop-blur border border-white/10 rounded-lg overflow-hidden flex flex-col shadow-xl">
                <div className="bg-white/5 px-3 py-2 border-b border-white/10 font-bold flex items-center justify-between tracking-wider text-sm text-gray-200">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                    {/* Tiny custom podium SVG matching reference exactly */}
                    <svg viewBox="0 0 64 64" className="w-4 h-4 text-white" fill="currentColor">
                      <rect x="12" y="30" width="13" height="14" rx="1.5" />
                      <rect x="25" y="21" width="14" height="23" rx="1.5" />
                      <rect x="39" y="33" width="13" height="11" rx="1.5" />
                    </svg>
                    Leaderboard
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setShowLeaderboard(false);
                    }}
                    className="p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors focus:outline-none cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-2 flex flex-col gap-1">
                  {leaderboard.length === 0 ? (
                    <div className="text-center text-gray-500 text-xs py-2 font-mono">No players</div>
                  ) : (
                    <>
                      {leaderboard.slice(0, 5).map((entry, idx) => {
                        const isMe = entry.id === socketId;
                        return (
                          <div
                            key={entry.id}
                            className={`flex justify-between items-center text-xs px-2 py-1 rounded transition-colors drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                              isMe
                                ? 'bg-gradient-to-r from-[#ffd700]/15 to-transparent text-[#ffd700] font-bold'
                                : 'text-gray-200 font-medium'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate max-w-[135px]">
                              {isMe && (
                                <span className="w-3 h-3 rounded-full border-2 border-[#ffd700] bg-transparent flex-shrink-0 animate-pulse" />
                              )}
                              <span className="truncate">
                                {idx + 1}. {entry.name || 'Anonymous'}
                              </span>
                            </span>
                            <span className={isMe ? 'text-[#ffd700]' : 'text-gray-400 font-mono'}>
                              {Math.round(entry.score)}
                            </span>
                          </div>
                        );
                      })}

                      {(() => {
                        const myIndex = leaderboard.findIndex(entry => entry.id === socketId);
                        if (myIndex >= 5) {
                          const myEntry = leaderboard[myIndex];
                          return (
                            <>
                              <div className="text-center text-gray-500 text-[10px] leading-none py-0.5 tracking-widest">
                                •••
                              </div>
                              <div
                                key={myEntry.id}
                                className="flex justify-between items-center text-xs px-2 py-1 rounded bg-gradient-to-r from-[#ffd700]/20 to-transparent text-[#ffd700] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
                              >
                                <span className="flex items-center gap-1.5 truncate max-w-[135px]">
                                  <span className="w-3 h-3 rounded-full border-2 border-[#ffd700] bg-transparent flex-shrink-0 animate-pulse" />
                                  <span className="truncate">
                                    {myIndex + 1}. {myEntry.name || 'Anonymous'}
                                  </span>
                                </span>
                                <span className="text-[#ffd700] font-mono">
                                  {Math.round(myEntry.score)}
                                </span>
                              </div>
                            </>
                          );
                        }
                        return null;
                      })()}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {!isSpectatorMode ? (
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
          ) : (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 select-none z-40">
              <motion.button
                onClick={exitSpectating}
                className="relative px-6 py-3 rounded-xl bg-gradient-to-b from-[#ff3355] to-[#aa0011] border border-white/20 shadow-lg text-white font-bold text-sm tracking-wider uppercase flex items-center gap-2 cursor-pointer focus:outline-none"
                whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(255,51,85,0.4)' }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-4 h-4" />
                Exit Spectate
              </motion.button>

              <motion.button
                onClick={exitSpectating}
                className="relative px-8 py-3 rounded-xl bg-gradient-to-b from-[#00ff88] to-[#008c43] border border-white/20 shadow-lg text-black font-black text-sm tracking-widest uppercase flex items-center gap-2 cursor-pointer focus:outline-none"
                whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(0,255,136,0.5)' }}
                whileTap={{ scale: 0.95 }}
              >
                <Gamepad2 className="w-4 h-4" />
                Play Now
              </motion.button>
            </div>
          )}
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

      {/* Dynamic Shop Modal */}
      {showShopModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 pointer-events-auto">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0e1118]/95 border-2 border-[#ff3355]/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_20px_50px_rgba(255,51,85,0.15)] flex flex-col max-h-[85vh]"
          >
            {/* Shop Header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-black/40">
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="w-6 h-6 text-[#ff3355] drop-shadow-[0_0_8px_rgba(255,51,85,0.4)]" />
                <h2 className="text-xl font-black tracking-wider text-white uppercase">Arena Shop</h2>
              </div>
              <div className="flex items-center gap-4">
                {/* Balances */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-black/50 border border-white/10 px-2.5 py-1 rounded-full text-xs font-mono">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-400 font-bold">{coins}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/50 border border-white/10 px-2.5 py-1 rounded-full text-xs font-mono">
                    <Dna className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">{dna}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setShowShopModal(false)} 
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition-all cursor-pointer focus:outline-none"
                >
                  <X size={20}/>
                </button>
              </div>
            </div>

            {/* Shop content splits into categories */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Skins Category */}
              <div>
                <h3 className="text-xs font-black tracking-widest text-gray-400 uppercase mb-4 flex items-center gap-2">
                  <span>LEGENDARY SHINOBI SKINS</span>
                  <div className="h-[1px] flex-1 bg-white/5" />
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {PREMIUM_SKINS.map((skin) => {
                    const isOwned = ownedSkins.includes(skin.id);
                    return (
                      <div 
                        key={skin.id}
                        className="bg-black/45 border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center relative group overflow-hidden"
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-black/40 flex items-center justify-center border border-white/10 mb-3 group-hover:scale-105 transition-transform relative">
                          <img 
                            src={skin.image} 
                            alt={skin.name} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1">{skin.name}</h4>
                        <p className="text-[10px] text-gray-400 mb-4 h-6 leading-tight">Unlock exclusive custom skin for your battlefield cells</p>

                        {isOwned ? (
                          <div className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#00ff88] flex items-center justify-center gap-1">
                            <Check className="w-4 h-4" /> Owned
                          </div>
                        ) : (
                          <motion.button
                            onClick={() => buySkin(skin.id, skin.priceDna)}
                            className="w-full py-2 rounded-xl bg-gradient-to-r from-[#00ff88] to-[#008c43] hover:from-[#00ffaa] hover:to-[#00aa55] text-black font-black text-xs uppercase flex items-center justify-center gap-1 shadow-lg shadow-[#00ff88]/10 cursor-pointer focus:outline-none"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <Dna className="w-3.5 h-3.5" /> Buy for {skin.priceDna} DNA
                          </motion.button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Titles Category */}
              <div>
                <h3 className="text-xs font-black tracking-widest text-gray-400 uppercase mb-4 flex items-center gap-2">
                  <span>ARENA HONOR TITLES</span>
                  <div className="h-[1px] flex-1 bg-white/5" />
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: '[Genin]', name: 'Genin Title', desc: 'Prepend [Genin] to your name. Simple rank title.', price: 100 },
                    { id: '[Chunin]', name: 'Chunin Title', desc: 'Prepend [Chunin] to your name. Advanced shinobi title.', price: 250 },
                    { id: '[Jonin]', name: 'Jonin Title', desc: 'Prepend [Jonin] to your name. Elite shinobi title.', price: 500 },
                    { id: '[Anbu]', name: 'Anbu Black Ops', desc: 'Prepend [Anbu] to your name. Shadow fighter rank.', price: 800 },
                  ].map((titleItem) => {
                    const isOwned = ownedTitles.includes(titleItem.id);
                    const isEquipped = selectedTitle === titleItem.id;

                    return (
                      <div 
                        key={titleItem.id}
                        className="bg-black/45 border border-white/10 rounded-2xl p-4 flex justify-between items-center relative overflow-hidden"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold text-white flex items-center gap-1.5">
                            <span className="text-[#00ff88] font-mono">{titleItem.id}</span>
                          </span>
                          <span className="text-[10px] text-gray-400 max-w-[200px] leading-tight">
                            {titleItem.desc}
                          </span>
                        </div>

                        {isOwned ? (
                          isEquipped ? (
                            <div className="px-3 py-1.5 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/20 text-[10px] font-black text-[#00ff88] uppercase flex items-center gap-1">
                              Equipped
                            </div>
                          ) : (
                            <button
                              onClick={() => equipTitle(titleItem.id)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black text-white uppercase cursor-pointer"
                            >
                              Equip
                            </button>
                          )
                        ) : (
                          <motion.button
                            onClick={() => buyTitle(titleItem.id, titleItem.price)}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black font-black text-[10px] uppercase flex items-center gap-1 cursor-pointer focus:outline-none"
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                          >
                            <Coins className="w-3 h-3" /> {titleItem.price}
                          </motion.button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Dynamic Season Pass Modal */}
      {showSeasonModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 pointer-events-auto">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0f111e]/95 border-2 border-amber-400/35 rounded-3xl w-full max-w-lg overflow-hidden shadow-[0_20px_50px_rgba(255,174,0,0.15)] flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-black/40">
              <div className="flex items-center gap-2.5">
                <Crown className="w-6 h-6 text-amber-400 fill-amber-400/10 drop-shadow-[0_0_8px_rgba(255,174,0,0.4)]" />
                <h2 className="text-xl font-black tracking-wider text-white uppercase">Season 1 Pass</h2>
              </div>
              <button 
                onClick={() => setShowSeasonModal(false)} 
                className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition-all cursor-pointer focus:outline-none"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Season Progress */}
            <div className="p-6 bg-black/20 border-b border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-300">YOUR SEASON XP PROGRESS</span>
                <span className="text-xs font-black text-amber-400 font-mono">Lvl {level}</span>
              </div>
              {/* Segmented active progression line */}
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex p-[1px] gap-0.5">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div 
                    key={idx}
                    className={`flex-1 h-full rounded-sm transition-all duration-300 ${
                      idx < level ? 'bg-gradient-to-r from-amber-400 to-amber-500 shadow-[0_0_8px_rgba(255,174,0,0.5)]' : 'bg-white/5'
                    }`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Claim exclusive rewards as your shinobi rank increases in the arena!</p>
            </div>

            {/* Rewards List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3.5 max-h-[40vh]">
              {[
                { id: 1, name: 'Season Starter Pack', reward: '+150 Coins', desc: 'Reach level 1 to unlock startup tokens', icon: <Coins className="w-5 h-5 text-amber-400" />, type: 'coins' as const, value: 150 },
                { id: 2, name: 'Gene Injector Tier', reward: '+5 DNA Tokens', desc: 'Reach level 2 to extract DNA strands', icon: <Dna className="w-5 h-5 text-emerald-400" />, type: 'dna' as const, value: 5 },
                { id: 3, name: 'Arena Sage Title Upgrade', reward: 'Legendary [Sage] Title', desc: 'Reach level 3 to wear the honorable title', icon: <Crown className="w-5 h-5 text-amber-400 fill-amber-400/15" />, type: 'title' as const, value: '[Sage]' },
                { id: 4, name: 'Premium Chest Block', reward: '+500 Coins & +10 DNA', desc: 'Reach level 4 to redeem elite bundle', icon: <Star className="w-5 h-5 text-sky-400" />, type: 'coins' as const, value: 500 },
                { id: 5, name: 'Kage Honor Tier Prefix', reward: 'Mythical [Hokage] Title', desc: 'Reach level 5 to wield ultimate leadership', icon: <Crown className="w-5 h-5 text-red-500 fill-red-500/10" />, type: 'title' as const, value: '[Hokage]' },
              ].map((tier) => {
                const isClaimed = claimedTiers.includes(tier.id);
                const isUnlocked = level >= tier.id;

                return (
                  <div 
                    key={tier.id}
                    className={`flex items-center gap-4 p-3.5 rounded-2xl border transition-all ${
                      isUnlocked 
                        ? 'bg-[#15120a] border-amber-400/30' 
                        : 'bg-black/40 border-white/5 opacity-60'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-black/50 flex items-center justify-center border border-white/10 shadow-inner">
                      {tier.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-amber-400 tracking-wider font-mono uppercase">Level {tier.id} Reward</span>
                      </div>
                      <h4 className="text-xs font-bold text-white tracking-wide truncate">{tier.name}</h4>
                      <p className="text-[10px] text-gray-400 leading-tight">{tier.desc}</p>
                    </div>

                    <div>
                      {isClaimed ? (
                        <span className="text-[10px] font-bold text-gray-500 uppercase px-2.5 py-1.5 bg-white/5 rounded-lg">Claimed</span>
                      ) : isUnlocked ? (
                        <motion.button
                          onClick={() => claimSeasonReward(tier.id, tier.type, tier.value)}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black text-[10px] uppercase cursor-pointer"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Claim
                        </motion.button>
                      ) : (
                        <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1 bg-white/5 border border-white/5 px-2 py-1 rounded-lg">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}

      {/* Dynamic Profile Stats Modal */}
      {showProfileModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 pointer-events-auto">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0a0d14]/95 border-2 border-[#3b82f6]/35 rounded-3xl w-full max-w-md overflow-hidden shadow-[0_20px_50px_rgba(59,130,246,0.15)] flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-black/40">
              <div className="flex items-center gap-2.5">
                <User className="w-5 h-5 text-[#3b82f6]" />
                <h2 className="text-lg font-black tracking-wider text-white uppercase">Shinobi Profile</h2>
              </div>
              <button 
                onClick={() => setShowProfileModal(false)} 
                className="text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-xl transition-all cursor-pointer focus:outline-none"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Profile contents */}
            <div className="p-6 space-y-6">
              {/* Nickname Editor */}
              <div>
                <label className="block text-[10px] font-black tracking-widest text-gray-400 mb-2 uppercase">CHOOSE NICKNAME</label>
                <input 
                  type="text"
                  maxLength={15}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-bold tracking-wide focus:outline-none focus:border-[#3b82f6]/60 transition-all shadow-inner"
                  placeholder="Guest Shinobi"
                />
              </div>

              {/* Player Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] font-black tracking-widest text-gray-400 uppercase">GAMES PLAYED</span>
                  <span className="text-xl font-mono font-black text-white">{gamesPlayed}</span>
                </div>
                <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] font-black tracking-widest text-gray-400 uppercase">MAX SCORE</span>
                  <span className="text-xl font-mono font-black text-amber-400">{maxScore}</span>
                </div>
                <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] font-black tracking-widest text-gray-400 uppercase">XP RANK LEVEL</span>
                  <span className="text-xl font-mono font-black text-[#00ff88]">Lvl {level}</span>
                </div>
                <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] font-black tracking-widest text-gray-400 uppercase">TOTAL KILLS</span>
                  <span className="text-xl font-mono font-black text-red-500">{kills}</span>
                </div>
              </div>

              {/* Title Equipper in Profile */}
              <div>
                <label className="block text-[10px] font-black tracking-widest text-gray-400 mb-2 uppercase">EQUIPPED HONOR TITLE</label>
                {ownedTitles.length === 0 ? (
                  <div className="text-xs text-gray-500 bg-black/40 border border-white/5 rounded-xl p-3 text-center">
                    No honor titles unlocked yet! Purchase ranks in the Shop.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-1">
                    {/* No title option */}
                    <button
                      onClick={() => equipTitle('')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        !selectedTitle 
                          ? 'border-[#00ff88] bg-[#00ff88]/5 text-[#00ff88]' 
                          : 'border-white/5 bg-black/40 text-gray-400 hover:text-white'
                      }`}
                    >
                      No Title
                    </button>
                    {ownedTitles.map((ownedTitleId) => (
                      <button
                        key={ownedTitleId}
                        onClick={() => equipTitle(ownedTitleId)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          selectedTitle === ownedTitleId 
                            ? 'border-[#00ff88] bg-[#00ff88]/5 text-[#00ff88]' 
                            : 'border-white/5 bg-black/40 text-gray-400 hover:text-white'
                        }`}
                      >
                        {ownedTitleId}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Floating Toast Notification Panel */}
      <div className="absolute bottom-4 left-4 z-[200] pointer-events-none flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            className={`px-4 py-2.5 rounded-xl border shadow-lg text-xs font-bold tracking-wide flex items-center gap-2 pointer-events-auto select-none ${
              toast.type === 'success' 
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' 
                : toast.type === 'warning' 
                  ? 'bg-amber-950/90 border-amber-500/30 text-amber-300' 
                  : 'bg-slate-900/95 border-blue-500/20 text-blue-200'
            }`}
          >
            {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'warning' && <Lock className="w-4 h-4 text-amber-400 shrink-0" />}
            {toast.type === 'info' && <Star className="w-4 h-4 text-blue-400 shrink-0" />}
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
