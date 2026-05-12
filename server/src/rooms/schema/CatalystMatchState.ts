import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

import {
  type CompetitiveBlockerSpec,
  matchDurationMs,
} from "../../gameRules";

export type MatchPhase = "waiting" | "countdown" | "running" | "ended";
export type PlayerResult = "pending" | "win" | "loss" | "draw" | "disconnect";
export type InhibitionKind = "" | "competitive" | "noncompetitive";

export class CompetitiveBlockerState extends Schema {
  @type("string") id = "";
  @type("number") xRatio = 0;
  @type("number") yRatio = 0;

  constructor(blocker?: CompetitiveBlockerSpec) {
    super();

    if (blocker) {
      this.id = blocker.id;
      this.xRatio = blocker.xRatio;
      this.yRatio = blocker.yRatio;
    }
  }
}

export class InhibitionState extends Schema {
  @type([CompetitiveBlockerState])
  competitiveBlockers = new ArraySchema<CompetitiveBlockerState>();

  @type("boolean") allostericActive = false;
  @type("number") allostericHoldMs = 0;
}

export class PlayerState extends Schema {
  @type("string") sessionId = "";
  @type("string") displayName = "Player";
  @type("number") score = 0;
  @type("number") attackResource = 0;
  @type("number") round = 1;
  @type("string") roundKind = "normal";
  @type("string") correctSubstrateId = "";
  @type("boolean") cofactorRequired = false;
  @type("boolean") cofactorBound = false;
  @type("string") statusMessage = "Waiting for another player.";
  @type("string") result: PlayerResult = "pending";
  @type(InhibitionState) inhibition = new InhibitionState();
}

export class CatalystMatchState extends Schema {
  @type("string") phase: MatchPhase = "waiting";
  @type("number") timeRemainingMs = matchDurationMs;
  @type("number") countdownRemainingMs = 0;
  @type("string") winnerSessionId = "";
  @type("string") statusMessage = "Waiting for another player.";

  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();
}
