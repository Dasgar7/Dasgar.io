export interface Position {
  x: number;
  y: number;
}

export interface PlayerCell {
  id: string; // Unique id for the cell (e.g. playerId_cellIndex)
  playerId: string;
  x: number;
  y: number;
  mass: number;
  radius: number;
  vx: number; // For splitting/ejecting momentum
  vy: number;
  mergeTimer: number; // Time until can merge again
}

export interface Player {
  id: string;
  name: string;
  color: string;
  cells: PlayerCell[];
  score: number;
  targetX: number;
  targetY: number;
  lastSplitTime?: number;
  isSpectating?: boolean;
}

export interface Food {
  id: string;
  x: number;
  y: number;
  color: string;
}

export interface Virus {
  id: string;
  x: number;
  y: number;
  mass: number;
  radius: number;
}

export interface EjectedMass {
  id: string;
  playerId: string;
  x: number;
  y: number;
  mass: number;
  radius: number;
  vx: number;
  vy: number;
  color: string;
}

export interface GameState {
  players: Record<string, Player>;
  food: Record<string, Food>;
  viruses: Record<string, Virus>;
  ejectedMass: Record<string, EjectedMass>;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
}
