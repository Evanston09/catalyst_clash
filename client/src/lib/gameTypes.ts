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
  imageSrc?: string;
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

export type MatchPhase =
  | "lobby"
  | "waiting"
  | "countdown"
  | "running"
  | "roundComplete"
  | "ended";

export type RemoteCompetitiveBlocker = {
  id: string;
  imageSrc?: string;
  xRatio: number;
  yRatio: number;
};

export type RemotePlayerState = {
  sessionId: string;
  displayName: string;
  score: number;
  sessionProducts: number;
  sessionWins: number;
  attackResource: number;
  optimalConditionCharges: number;
  round: number;
  cofactorRequired: boolean;
  cofactorBound: boolean;
  statusMessage: string;
  result: "pending" | "win" | "loss" | "draw" | "disconnect";
  tutorialComplete: boolean;
  inhibition: {
    competitiveBlockers: Iterable<RemoteCompetitiveBlocker>;
    allostericActive: boolean;
    allostericHoldMs: number;
  };
};

export type MatchOpponent = {
  sessionId: string;
  displayName: string;
  score: number;
  sessionProducts: number;
  sessionWins: number;
  tutorialComplete: boolean;
};

export type RemoteMatchState = {
  phase: Exclude<MatchPhase, "lobby">;
  timeRemainingMs: number;
  countdownRemainingMs: number;
  sessionMatchNumber: number;
  maxSessionMatches: number;
  statusMessage: string;
  players?: unknown;
};

export type MultiplayerSnapshot = {
  phase: MatchPhase;
  roomCode: string;
  playersConnected: number;
  countdownRemainingMs: number;
  sessionMatchNumber: number;
  maxSessionMatches: number;
  tutorialComplete: boolean;
  tutorialReadyCount: number;
  opponentScore: number;
  opponentName: string;
  opponents: MatchOpponent[];
  ownName: string;
  ownSessionProducts: number;
  ownSessionWins: number;
  attackResource: number;
  optimalConditionCharges: number;
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
