import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  WORLD_SIZE,
  FOOD_COUNT,
  VIRUS_COUNT,
  BASE_PLAYER_MASS,
  FOOD_MASS,
  VIRUS_MASS,
  EAT_MASS_RATIO,
  SPLIT_COOLDOWN_MS,
  TICK_RATE,
  BROADCAST_RATE,
  EJECT_MASS_COST,
  EJECT_MASS_VALUE,
  EJECT_SPEED,
  SPLIT_SPEED
} from '../src/shared/constants.ts';
import { Player, PlayerCell, Food, Virus, EjectedMass, LeaderboardEntry } from '../src/shared/types.ts';

// Helper to calculate radius from mass (area = pi * r^2, so r = sqrt(mass / pi) * scaling_factor)
export function massToRadius(mass: number): number {
  return Math.sqrt(mass) * 10;
}

const colors = [
  '#FF3366', '#33FF66', '#3366FF', '#FFFF33', '#FF33FF', '#33FFFF', 
  '#FF9933', '#99FF33', '#9933FF', '#3399FF'
];

export class GameServer {
  private players: Map<string, Player> = new Map();
  private foods: Map<string, Food> = new Map();
  private viruses: Map<string, Virus> = new Map();
  private ejectedMasses: Map<string, EjectedMass> = new Map();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
    this.initMap();
    this.setupSockets();
    this.startGameLoop();
  }

  private initMap() {
    for (let i = 0; i < FOOD_COUNT; i++) {
      this.spawnFood();
    }
    for (let i = 0; i < VIRUS_COUNT; i++) {
      this.spawnVirus();
    }
    for (let i = 0; i < 12; i++) {
      this.spawnBot();
    }
  }

  private spawnFood() {
    const id = uuidv4();
    this.foods.set(id, {
      id,
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  private spawnVirus() {
    const id = uuidv4();
    this.viruses.set(id, {
      id,
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      mass: VIRUS_MASS,
      radius: massToRadius(VIRUS_MASS),
    });
  }

  private botNames = [
    'Alpha', 'Beta', 'GamerPro', 'Slayer', 'Blobby', 'Chomp', 'Speedy', 'Titan',
    'Nebula', 'Apex', 'Wumbo', 'Divide', 'Conquer', 'HungryBlob', 'Void', 'Eclipse',
    'Spectre', 'Fury', 'Zephyr', 'Rogue', 'Titanium', 'Hydra', 'Chronos', 'Shadow'
  ];

  private spawnBot(botId?: string) {
    const id = botId || `bot_${uuidv4()}`;
    const name = this.botNames[Math.floor(Math.random() * this.botNames.length)] + ' [Bot]';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const startMass = BASE_PLAYER_MASS;
    
    const bot: Player = {
      id,
      name,
      color,
      cells: [{
        id: uuidv4(),
        playerId: id,
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        mass: startMass,
        radius: massToRadius(startMass),
        vx: 0,
        vy: 0,
        mergeTimer: 0
      }],
      score: startMass,
      targetX: Math.random() * WORLD_SIZE,
      targetY: Math.random() * WORLD_SIZE,
      lastSplitTime: 0
    };
    
    this.players.set(id, bot);
  }

  private botSplit(player: Player) {
    if (player.cells.length >= 16) return;
    
    const now = Date.now();
    if (player.lastSplitTime && now - player.lastSplitTime < 500) return;
    player.lastSplitTime = now;

    const newCells: PlayerCell[] = [];
    const currentCells = [...player.cells];
    for (const cell of currentCells) {
      if (player.cells.length + newCells.length >= 16) break;
      
      if (cell.mass >= BASE_PLAYER_MASS * 2) {
        cell.mass /= 2;
        cell.radius = massToRadius(cell.mass);
        cell.mergeTimer = SPLIT_COOLDOWN_MS;

        const dx = player.targetX - cell.x;
        const dy = player.targetY - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        let dirX = 1, dirY = 0;
        if (dist > 0) {
          dirX = dx / dist;
          dirY = dy / dist;
        }

        newCells.push({
          id: uuidv4(),
          playerId: player.id,
          x: cell.x,
          y: cell.y,
          mass: cell.mass,
          radius: massToRadius(cell.mass),
          vx: dirX * SPLIT_SPEED,
          vy: dirY * SPLIT_SPEED,
          mergeTimer: SPLIT_COOLDOWN_MS
        });
      }
    }
    player.cells.push(...newCells);
  }

  private updateBots(dt: number) {
    for (const bot of this.players.values()) {
      if (!bot.id.startsWith('bot_') || bot.cells.length === 0) continue;

      let botX = 0, botY = 0, botMass = 0;
      let maxOurMass = 0;
      for (const cell of bot.cells) {
        botX += cell.x * cell.mass;
        botY += cell.y * cell.mass;
        botMass += cell.mass;
        if (cell.mass > maxOurMass) maxOurMass = cell.mass;
      }
      botX /= botMass;
      botY /= botMass;

      let forceX = 0;
      let forceY = 0;

      let fleeCount = 0;
      let fleeX = 0;
      let fleeY = 0;

      let chaseCount = 0;
      let chaseX = 0;
      let chaseY = 0;
      let closestChaseCell: PlayerCell | null = null;
      let closestChaseDist = Infinity;

      for (const other of this.players.values()) {
        if (other.id === bot.id || other.cells.length === 0) continue;
        for (const oCell of other.cells) {
          const dx = oCell.x - botX;
          const dy = oCell.y - botY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 600) continue;

          if (oCell.mass > maxOurMass * EAT_MASS_RATIO) {
            const weight = (600 - dist) / 600;
            if (dist > 0) {
              fleeX -= (dx / dist) * weight;
              fleeY -= (dy / dist) * weight;
              fleeCount++;
            }
          } else if (maxOurMass > oCell.mass * EAT_MASS_RATIO) {
            const weight = (600 - dist) / 600;
            if (dist > 0) {
              chaseX += (dx / dist) * weight;
              chaseY += (dy / dist) * weight;
              chaseCount++;
              if (dist < closestChaseDist) {
                closestChaseDist = dist;
                closestChaseCell = oCell;
              }
            }
          }
        }
      }

      let avoidVirusX = 0;
      let avoidVirusY = 0;
      let avoidVirusCount = 0;
      for (const virus of this.viruses.values()) {
        const dx = virus.x - botX;
        const dy = virus.y - botY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 300) continue;

        if (maxOurMass > virus.mass * EAT_MASS_RATIO) {
          const weight = (300 - dist) / 300;
          if (dist > 0) {
            avoidVirusX -= (dx / dist) * weight;
            avoidVirusY -= (dy / dist) * weight;
            avoidVirusCount++;
          }
        }
      }

      if (fleeCount > 0) {
        forceX = fleeX;
        forceY = fleeY;
      } else if (avoidVirusCount > 0) {
        forceX = avoidVirusX;
        forceY = avoidVirusY;
      } else if (chaseCount > 0) {
        forceX = chaseX;
        forceY = chaseY;

        if (closestChaseCell && bot.cells.length < 8 && Math.random() < 0.02) {
          const splitKillRange = maxOurMass * 5;
          if (closestChaseDist < splitKillRange && maxOurMass > closestChaseCell.mass * 2.5) {
            this.botSplit(bot);
          }
        }
      } else {
        let closestFood: Food | null = null;
        let minFoodDist = Infinity;
        for (const food of this.foods.values()) {
          const dx = food.x - botX;
          const dy = food.y - botY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minFoodDist) {
            minFoodDist = dist;
            closestFood = food;
          }
        }

        if (closestFood) {
          const dx = closestFood.x - botX;
          const dy = closestFood.y - botY;
          if (minFoodDist > 0) {
            forceX = dx / minFoodDist;
            forceY = dy / minFoodDist;
          }
        } else {
          if (Math.random() < 0.05) {
            bot.targetX = Math.random() * WORLD_SIZE;
            bot.targetY = Math.random() * WORLD_SIZE;
          }
          continue;
        }
      }

      const forceMag = Math.sqrt(forceX * forceX + forceY * forceY);
      if (forceMag > 0) {
        bot.targetX = botX + (forceX / forceMag) * 300;
        bot.targetY = botY + (forceY / forceMag) * 300;
      }
    }
  }

  private setupSockets() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Player connected:', socket.id);

      socket.on('join', (name: string, skin?: string) => {
        const color = skin || colors[Math.floor(Math.random() * colors.length)];
        const startMass = BASE_PLAYER_MASS;
        const player: Player = {
          id: socket.id,
          name: name.substring(0, 15) || 'Anonymous',
          color,
          cells: [{
            id: uuidv4(),
            playerId: socket.id,
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE,
            mass: startMass,
            radius: massToRadius(startMass),
            vx: 0,
            vy: 0,
            mergeTimer: 0
          }],
          score: startMass,
          targetX: 0,
          targetY: 0,
          lastSplitTime: 0
        };
        
        // Ensure starting position is safe (simple random for now)
        this.players.set(socket.id, player);
        this.broadcastToPlayer(socket.id); // Send initial state immediately
      });

      socket.on('spectate', () => {
        const player: Player = {
          id: socket.id,
          name: 'Spectator',
          color: '#ffffff',
          cells: [],
          score: 0,
          targetX: WORLD_SIZE / 2,
          targetY: WORLD_SIZE / 2,
          lastSplitTime: 0,
          isSpectating: true
        };
        this.players.set(socket.id, player);
        this.broadcastToPlayer(socket.id);
      });

      socket.on('leave', () => {
        this.players.delete(socket.id);
      });

      socket.on('target', (target: { x: number, y: number }) => {
        const player = this.players.get(socket.id);
        if (player) {
          player.targetX = target.x;
          player.targetY = target.y;
        }
      });

      socket.on('split', () => {
        const player = this.players.get(socket.id);
        if (!player) return;

        if (player.cells.length >= 16) return;
        
        const now = Date.now();
        if (player.lastSplitTime && now - player.lastSplitTime < 100) return; // debounce
        player.lastSplitTime = now;

        const newCells: PlayerCell[] = [];
        const currentCells = [...player.cells];
        for (const cell of currentCells) {
          if (player.cells.length + newCells.length >= 16) break;
          
          if (cell.mass >= BASE_PLAYER_MASS * 2) {
            cell.mass /= 2;
            cell.radius = massToRadius(cell.mass);
            cell.mergeTimer = SPLIT_COOLDOWN_MS;

            // Calculate direction towards target
            const dx = player.targetX - cell.x;
            const dy = player.targetY - cell.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            let dirX = 1, dirY = 0;
            if (dist > 0) {
              dirX = dx / dist;
              dirY = dy / dist;
            }

            newCells.push({
              id: uuidv4(),
              playerId: socket.id,
              x: cell.x,
              y: cell.y,
              mass: cell.mass,
              radius: massToRadius(cell.mass),
              vx: dirX * SPLIT_SPEED,
              vy: dirY * SPLIT_SPEED,
              mergeTimer: SPLIT_COOLDOWN_MS
            });
          }
        }
        player.cells.push(...newCells);
      });

      socket.on('eject', () => {
        const player = this.players.get(socket.id);
        if (!player) return;

        for (const cell of player.cells) {
          if (cell.mass >= EJECT_MASS_COST * 1.5) {
            cell.mass -= EJECT_MASS_COST;
            cell.radius = massToRadius(cell.mass);

            const dx = player.targetX - cell.x;
            const dy = player.targetY - cell.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            let dirX = 1, dirY = 0;
            if (dist > 0) {
              dirX = dx / dist;
              dirY = dy / dist;
            }

            // Spawn ejected mass just outside the cell
            const spawnDist = cell.radius + massToRadius(EJECT_MASS_VALUE) + 5;
            
            const ejectId = uuidv4();
            this.ejectedMasses.set(ejectId, {
              id: ejectId,
              playerId: socket.id,
              x: cell.x + dirX * spawnDist,
              y: cell.y + dirY * spawnDist,
              mass: EJECT_MASS_VALUE,
              radius: massToRadius(EJECT_MASS_VALUE),
              vx: dirX * EJECT_SPEED,
              vy: dirY * EJECT_SPEED,
              color: player.color
            });
          }
        }
      });

      socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        this.players.delete(socket.id);
      });
    });
  }

  private startGameLoop() {
    let lastTime = Date.now();
    
    // Physics and logic loop
    setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      this.updatePhysics(dt);
    }, 1000 / TICK_RATE);

    // Network broadcast loop
    setInterval(() => {
      this.broadcastState();
    }, 1000 / BROADCAST_RATE);
  }

  private updatePhysics(dt: number) {
    // 0. Update bots target and splitting behavior
    this.updateBots(dt);

    // 1. Move ejected masses
    for (const [id, eject] of this.ejectedMasses.entries()) {
      eject.x += eject.vx * dt;
      eject.y += eject.vy * dt;
      // Friction
      eject.vx *= Math.pow(0.5, dt);
      eject.vy *= Math.pow(0.5, dt);

      eject.x = Math.max(eject.radius, Math.min(WORLD_SIZE - eject.radius, eject.x));
      eject.y = Math.max(eject.radius, Math.min(WORLD_SIZE - eject.radius, eject.y));
      
      // Stop moving when very slow
      if (Math.abs(eject.vx) < 10 && Math.abs(eject.vy) < 10) {
        eject.vx = 0;
        eject.vy = 0;
      }
    }

    // 2. Move players
    for (const player of this.players.values()) {
      let totalMass = 0;
      for (const cell of player.cells) {
        if (cell.mergeTimer > 0) cell.mergeTimer -= dt * 1000;

        cell.vx *= Math.pow(0.1, dt);
        cell.vy *= Math.pow(0.1, dt);
        if (Math.abs(cell.vx) < 1) cell.vx = 0;
        if (Math.abs(cell.vy) < 1) cell.vy = 0;

        const dx = player.targetX - cell.x;
        const dy = player.targetY - cell.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 1500 / Math.pow(cell.mass, 0.5);

        let targetVx = 0, targetVy = 0;
        if (dist > 1) {
          targetVx = (dx / dist) * speed;
          targetVy = (dy / dist) * speed;
        }

        cell.x += (targetVx + cell.vx) * dt;
        cell.y += (targetVy + cell.vy) * dt;

        cell.x = Math.max(cell.radius, Math.min(WORLD_SIZE - cell.radius, cell.x));
        cell.y = Math.max(cell.radius, Math.min(WORLD_SIZE - cell.radius, cell.y));
        totalMass += cell.mass;
      }
      player.score = totalMass;
    }

    // 3. Self-Collision (cell repelling and merging)
    for (const player of this.players.values()) {
      for (let i = 0; i < player.cells.length; i++) {
        for (let j = i + 1; j < player.cells.length; j++) {
          const c1 = player.cells[i];
          const c2 = player.cells[j];
          const dx = c2.x - c1.x;
          const dy = c2.y - c1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = c1.radius + c2.radius;

          if (dist < minDist) {
            if (c1.mergeTimer <= 0 && c2.mergeTimer <= 0) {
              // Merge cells
              c1.mass += c2.mass;
              c1.radius = massToRadius(c1.mass);
              player.cells.splice(j, 1);
              j--; // Adjust index
            } else {
              // Repel
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
    }

    // 4. Resolve Collisions (Eating)
    // Create a flat list of all interactable items for simpler logic
    // (O(N^2) is okay for small player counts, but a spatial grid is better. We'll stick to simple arrays for MVP)
    
    // Player vs Food
    for (const player of this.players.values()) {
      for (const cell of player.cells) {
        for (const [foodId, food] of this.foods.entries()) {
          const dx = food.x - cell.x;
          const dy = food.y - cell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < cell.radius) { // Eat food
            cell.mass += FOOD_MASS;
            cell.radius = massToRadius(cell.mass);
            this.foods.delete(foodId);
            this.spawnFood(); // Immediately replace
          }
        }
      }
    }

    // Player vs Ejected Mass
    for (const player of this.players.values()) {
      for (const cell of player.cells) {
        for (const [ejectId, eject] of this.ejectedMasses.entries()) {
          // Can't eat own mass if just ejected (dist needs to be close enough, and maybe a small cooldown, but we rely on speed)
          const dx = eject.x - cell.x;
          const dy = eject.y - cell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < cell.radius && cell.mass > eject.mass * EAT_MASS_RATIO) {
            cell.mass += eject.mass;
            cell.radius = massToRadius(cell.mass);
            this.ejectedMasses.delete(ejectId);
          }
        }
      }
    }

    // Player vs Virus
    for (const player of this.players.values()) {
      // Need a copy because cells might split during iteration
      const currentCells = [...player.cells];
      for (const cell of currentCells) {
        for (const [virusId, virus] of this.viruses.entries()) {
          const dx = virus.x - cell.x;
          const dy = virus.y - cell.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < cell.radius && cell.mass > virus.mass * EAT_MASS_RATIO) {
            // Eat virus and POP!
            cell.mass += virus.mass;
            this.viruses.delete(virusId);
            this.spawnVirus();

            // Pop into many cells
            const maxCells = 16;
            let cellsToCreate = maxCells - player.cells.length;
            if (cellsToCreate > 0) {
              const massPerCell = cell.mass / (cellsToCreate + 1);
              cell.mass = massPerCell;
              cell.radius = massToRadius(cell.mass);
              
              for (let k = 0; k < cellsToCreate; k++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 400 + 200;
                player.cells.push({
                  id: uuidv4(),
                  playerId: player.id,
                  x: cell.x,
                  y: cell.y,
                  mass: massPerCell,
                  radius: massToRadius(massPerCell),
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  mergeTimer: SPLIT_COOLDOWN_MS
                });
              }
            } else {
              cell.radius = massToRadius(cell.mass);
            }
          }
        }
      }
    }

    // Player vs Player
    const allPlayers = Array.from(this.players.values());
    for (let i = 0; i < allPlayers.length; i++) {
      for (let j = i + 1; j < allPlayers.length; j++) {
        const p1 = allPlayers[i];
        const p2 = allPlayers[j];

        // Check all cells against all cells
        for (let c1i = 0; c1i < p1.cells.length; c1i++) {
          for (let c2i = 0; c2i < p2.cells.length; c2i++) {
            const c1 = p1.cells[c1i];
            const c2 = p2.cells[c2i];
            
            if (!c1 || !c2) continue; // Might have been eaten

            const dx = c2.x - c1.x;
            const dy = c2.y - c1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Eat happens if center of smaller is inside larger, and mass ratio met
            if (dist < c1.radius && c1.mass > c2.mass * EAT_MASS_RATIO) {
              c1.mass += c2.mass;
              c1.radius = massToRadius(c1.mass);
              p2.cells.splice(c2i, 1);
              c2i--;
            } else if (dist < c2.radius && c2.mass > c1.mass * EAT_MASS_RATIO) {
              c2.mass += c1.mass;
              c2.radius = massToRadius(c2.mass);
              p1.cells.splice(c1i, 1);
              c1i--;
              break; // c1 is dead, move to next c1
            }
          }
        }
      }
    }

    // Remove players with 0 cells (who are not spectating)
    for (const [id, player] of this.players.entries()) {
      if (player.cells.length === 0 && !player.isSpectating) {
        // Player died
        if (!id.startsWith('bot_')) {
          this.io.to(id).emit('died', player.score);
        } else {
          // Respawn another bot in 2 seconds
          setTimeout(() => {
            this.spawnBot(id);
          }, 2000);
        }
        this.players.delete(id);
      }
    }
  }

  private broadcastState() {
    // Pre-calculate packed global state that doesn't depend on viewport
    const leaderboard: LeaderboardEntry[] = Array.from(this.players.values())
      .map(p => ({ id: p.id, name: p.name, score: Math.round(p.score) }))
      .sort((a, b) => b.score - a.score);

    const packedViruses = Array.from(this.viruses.values()).map(v => ({
      id: v.id, x: Math.round(v.x), y: Math.round(v.y), r: Math.round(v.radius)
    }));

    const packedPlayers = Array.from(this.players.values()).map(p => ({
      id: p.id, n: p.name, c: p.color, s: p.score,
      cells: p.cells.map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.radius), vx: c.vx, vy: c.vy }))
    }));

    const packedEjected = Array.from(this.ejectedMasses.values()).map(e => ({
      id: e.id, x: Math.round(e.x), y: Math.round(e.y), r: Math.round(e.radius), c: e.color
    }));

    for (const [id] of this.players.entries()) {
      if (id.startsWith('bot_')) continue;
      this.broadcastToPlayer(id, leaderboard, packedViruses, packedPlayers, packedEjected);
    }
  }

  private broadcastToPlayer(
    id: string, 
    leaderboard?: LeaderboardEntry[], 
    packedViruses?: any[], 
    packedPlayers?: any[], 
    packedEjected?: any[]
  ) {
    const player = this.players.get(id);
    if (!player) return;

    if (!leaderboard) {
      leaderboard = Array.from(this.players.values())
        .map(p => ({ id: p.id, name: p.name, score: Math.round(p.score) }))
        .sort((a, b) => b.score - a.score);
    }
    if (!packedViruses) {
      packedViruses = Array.from(this.viruses.values()).map(v => ({
        id: v.id, x: Math.round(v.x), y: Math.round(v.y), r: Math.round(v.radius)
      }));
    }
    if (!packedPlayers) {
      packedPlayers = Array.from(this.players.values()).map(p => ({
        id: p.id, n: p.name, c: p.color, s: p.score,
        cells: p.cells.map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.radius), vx: c.vx, vy: c.vy }))
      }));
    }
    if (!packedEjected) {
      packedEjected = Array.from(this.ejectedMasses.values()).map(e => ({
        id: e.id, x: Math.round(e.x), y: Math.round(e.y), r: Math.round(e.radius), c: e.color
      }));
    }

    let minX = WORLD_SIZE, maxX = 0, minY = WORLD_SIZE, maxY = 0;
    if (player.cells.length > 0) {
      for (const cell of player.cells) {
        minX = Math.min(minX, cell.x - cell.radius);
        maxX = Math.max(maxX, cell.x + cell.radius);
        minY = Math.min(minY, cell.y - cell.radius);
        maxY = Math.max(maxY, cell.y + cell.radius);
      }
    } else {
      // Spectator view centered around target
      minX = player.targetX - 500;
      maxX = player.targetX + 500;
      minY = player.targetY - 500;
      maxY = player.targetY + 500;
    }
    
    const width = Math.max(maxX - minX, 400);
    const height = Math.max(maxY - minY, 400);
    
    // Calculate viewport size (includes zoom margin)
    const viewSize = Math.max(width, height) * 4 + 1200; 
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const vMinX = cx - viewSize / 2;
    const vMaxX = cx + viewSize / 2;
    const vMinY = cy - viewSize / 2;
    const vMaxY = cy + viewSize / 2;

    const pFood = [];
    for (const f of this.foods.values()) {
      if (f.x >= vMinX && f.x <= vMaxX && f.y >= vMinY && f.y <= vMaxY) {
        pFood.push({ id: f.id, x: Math.round(f.x), y: Math.round(f.y), c: f.color });
      }
    }
    
    const pPlayers = [];
    for (const p of packedPlayers) {
        const visibleCells = p.cells.filter((c: any) => c.x + c.r >= vMinX && c.x - c.r <= vMaxX && c.y + c.r >= vMinY && c.y - c.r <= vMaxY);
        if (visibleCells.length > 0) {
          pPlayers.push({ ...p, cells: visibleCells });
        }
    }

    this.io.to(id).emit('state', {
      p: pPlayers,
      f: pFood,
      v: packedViruses.filter(v => v.x + v.r >= vMinX && v.x - v.r <= vMaxX && v.y + v.r >= vMinY && v.y - v.r <= vMaxY),
      e: packedEjected.filter(e => e.x + e.r >= vMinX && e.x - e.r <= vMaxX && e.y + e.r >= vMinY && e.y - e.r <= vMaxY),
      lb: leaderboard
    });
  }
}
