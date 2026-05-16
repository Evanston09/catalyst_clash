export type AttackKind = "competitive" | "noncompetitive";
export type RoundKind = "normal" | "cofactor";

export type CompetitiveBlockerSpec = {
  id: string;
  xRatio: number;
  yRatio: number;
};

export type RoundSpec = {
  round: number;
  kind: RoundKind;
  correctSetId: string;
  correctSubstrateId: string;
  cofactorRequired: boolean;
};

export const matchDurationMs = 300_000;
export const timerTickMs = 250;
export const competitiveBlockerCount = 10;
export const allostericHoldTargetMs = 2_000;
export const cofactorRoundChance = 0.35;
export const attackCosts: Record<AttackKind, number> = {
  competitive: 7,
  noncompetitive: 3,
};

const normalSetIds = Array.from({ length: 24 }, (_, index) =>
  String(index + 1),
);
const cofactorSetIds = Array.from({ length: 23 }, (_, index) =>
  String(index + 1),
);

export function buildRoundSpec(round: number): RoundSpec {
  const cofactorRequired =
    cofactorSetIds.length > 0 &&
    round > 1 &&
    seededFraction(`round-${round}-cofactor-chance`, round) <
      cofactorRoundChance;
  const catalog = cofactorRequired ? cofactorSetIds : normalSetIds;
  const correctSetId = catalog[(round - 1) % catalog.length];

  return {
    round,
    kind: cofactorRequired ? "cofactor" : "normal",
    correctSetId,
    correctSubstrateId: `round-${round}-substrate-${correctSetId}`,
    cofactorRequired,
  };
}

export function buildCompetitiveBlockers(round: number) {
  return Array.from({ length: competitiveBlockerCount }, (_, index) => ({
    id: `round-${round}-competitive-${index}`,
    xRatio: seededFraction(`round-${round}-competitive-${index}-x`, round),
    yRatio: seededFraction(`round-${round}-competitive-${index}-y`, round),
  }));
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
