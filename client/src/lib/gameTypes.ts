export type Molecule = {
  id: string;
  label: string;
  role: "correct" | "decoy";
  setId: string;
  imageSrc: string;
};

export type EnzymePair = {
  setId: string;
  label: string;
  enzymeSrc: string;
  kind: "normal" | "cofactor";
  substrateSrc: string;
};

export type GameStatus = "idle" | "running" | "ended";
export type BlockingReason = "competitive" | "allosteric";

export type CompetitiveBlocker = {
  id: string;
  xRatio: number;
  yRatio: number;
};

export type InhibitionState = {
  competitiveBlockers: CompetitiveBlocker[];
  allostericActive: boolean;
  allostericPrimed: boolean;
  allostericHoldMs: number;
};

export type CofactorState = {
  required: boolean;
  bound: boolean;
  failed: boolean;
  id: string;
  imageSrc: string;
};

export type GameState = {
  status: GameStatus;
  timeRemainingMs: number;
  productCount: number;
  round: number;
  cofactor: CofactorState;
  enzymePair: EnzymePair;
  correctSubstrateId: string;
  failedSubstrateId: string | null;
  statusMessage: string;
  inhibition: InhibitionState;
  molecules: Molecule[];
};

export type MatchPhase = "lobby" | "waiting" | "countdown" | "running" | "ended";

export type RemoteCompetitiveBlocker = {
  id: string;
  xRatio: number;
  yRatio: number;
};

export type RemotePlayerState = {
  sessionId: string;
  displayName: string;
  score: number;
  attackResource: number;
  round: number;
  cofactorRequired: boolean;
  cofactorBound: boolean;
  statusMessage: string;
  result: "pending" | "win" | "loss" | "draw" | "disconnect";
  inhibition: {
    competitiveBlockers: Iterable<RemoteCompetitiveBlocker>;
    allostericActive: boolean;
    allostericHoldMs: number;
  };
};

export type RemoteMatchState = {
  phase: Exclude<MatchPhase, "lobby">;
  timeRemainingMs: number;
  countdownRemainingMs: number;
  statusMessage: string;
  players?: unknown;
};

export type MultiplayerSnapshot = {
  phase: MatchPhase;
  roomCode: string;
  playersConnected: number;
  opponentScore: number;
  opponentName: string;
  ownName: string;
  attackResource: number;
  result: RemotePlayerState["result"];
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type MoleculePosition = {
  id: string;
  x: number;
  y: number;
  rotation: number;
};

export type CompetitiveBlockerPosition = CompetitiveBlocker & {
  x: number;
  y: number;
};

export type ActiveSiteBounds = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  imageSize: number;
  rotation: number;
};

export type CofactorSiteBounds = {
  x: number;
  y: number;
  radius: number;
  imageSize: number;
  rotation: number;
};

export type CanvasTheme = {
  background: string;
  border: string;
  card: string;
  destructive: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  isDark: boolean;
};
