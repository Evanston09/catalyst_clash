import type {
  BlockingReason,
  CanvasSize,
  CompetitiveBlocker,
  CompetitiveBlockerPosition,
  InhibitionState,
} from "@/lib/gameTypes";

export const defaultCanvasSize: CanvasSize = {
  width: 960,
  height: 560,
};

export const matchDurationMs = 300_000;
export const timerTickMs = 250;
export const allostericHoldTargetMs = 2_000;
export const cofactorRoundChance = 0.35;
export const brownianWanderRadius = 9;
export const brownianJitterRadius = 2.4;

export const attackCosts = {
  competitive: 7,
  noncompetitive: 3,
};

export function createEmptyInhibitionState(): InhibitionState {
  return {
    competitiveBlockers: [],
    allostericActive: false,
    allostericPrimed: false,
    allostericHoldMs: 0,
  };
}

export function scoreForRound(value: string, round: number) {
  return [...value].reduce(
    (score, character) => score + character.charCodeAt(0) * round,
    0,
  );
}

export function seededFraction(seed: string, round: number) {
  const score = [...seed].reduce(
    (total, character, index) =>
      total + character.charCodeAt(0) * (index + 17) * round,
    0,
  );
  const value = Math.sin(score) * 10000;

  return value - Math.floor(value);
}

export function getBlockingReason(
  inhibition: InhibitionState,
): BlockingReason | null {
  if (inhibition.competitiveBlockers.length > 0) {
    return "competitive";
  }

  if (inhibition.allostericActive) {
    return "allosteric";
  }

  return null;
}

export function buildCompetitiveBlockerPositions(
  blockers: CompetitiveBlocker[],
  size: CanvasSize,
): CompetitiveBlockerPosition[] {
  const margin = 62;

  return blockers.map((blocker) => ({
    ...blocker,
    x: margin + (size.width - margin * 2) * blocker.xRatio,
    y: margin + (size.height - margin * 2) * blocker.yRatio,
  }));
}

export function formatTime(timeRemainingMs: number) {
  const totalSeconds = Math.ceil(timeRemainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function randomInRange(seed: string, round: number, min: number, max: number) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const ratio = seededFraction(seed, round);

  return low + (high - low) * ratio;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
