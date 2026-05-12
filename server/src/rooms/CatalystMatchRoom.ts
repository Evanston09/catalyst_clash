import { Client, Room } from "@colyseus/core";

import {
  allostericHoldTargetMs,
  attackCosts,
  buildCompetitiveBlockers,
  buildRoundSpec,
  matchDurationMs,
  timerTickMs,
} from "../gameRules";
import {
  CatalystMatchState,
  CompetitiveBlockerState,
  PlayerState,
} from "./schema/CatalystMatchState";

const roomLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCodeChannel = "$catalyst_match_codes";
const countdownDurationMs = 3_000;

type BindSubstratePayload = {
  substrateId?: unknown;
  inActiveSite?: unknown;
};

type BindCofactorPayload = {
  inCofactorSite?: unknown;
};

type ClearCompetitivePayload = {
  blockerId?: unknown;
};

type AdvanceAllostericPayload = {
  deltaMs?: unknown;
};

type SendAttackPayload = {
  kind?: unknown;
};

type JoinOptions = {
  displayName?: unknown;
};

export class CatalystMatchRoom extends Room {
  maxClients = 2;
  state = new CatalystMatchState();

  private countdownInterval: NodeJS.Timeout | null = null;
  private matchInterval: NodeJS.Timeout | null = null;

  async onCreate() {
    this.roomId = await this.generateRoomId();

    this.onMessage("bindSubstrate", (client, payload: BindSubstratePayload) => {
      this.bindSubstrate(client, payload);
    });
    this.onMessage("bindCofactor", (client, payload: BindCofactorPayload) => {
      this.bindCofactor(client, payload);
    });
    this.onMessage(
      "clearCompetitiveBlocker",
      (client, payload: ClearCompetitivePayload) => {
        this.clearCompetitiveBlocker(client, payload);
      },
    );
    this.onMessage(
      "advanceAllostericHold",
      (client, payload: AdvanceAllostericPayload) => {
        this.advanceAllostericHold(client, payload);
      },
    );
    this.onMessage("sendAttack", (client, payload: SendAttackPayload) => {
      this.sendAttack(client, payload);
    });
    this.onMessage("restartRequest", () => {
      if (this.state.phase === "ended" && this.clients.length === 2) {
        this.resetMatch();
      }
    });
    this.onMessage("startRequest", () => {
      if (this.state.phase === "waiting" && this.state.players.size === 2) {
        this.startCountdown();
      }
    });
  }

  onJoin(client: Client, options?: JoinOptions) {
    if (this.state.phase !== "waiting" || this.state.players.size >= 2) {
      client.leave();
      return;
    }

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.displayName = sanitizeDisplayName(options?.displayName);
    this.applyRound(player, 1);
    this.state.players.set(client.sessionId, player);

    if (this.state.players.size === 2) {
      this.lock();
      this.state.statusMessage = "Both players joined. Press Start when ready.";
      this.state.players.forEach((joinedPlayer) => {
        joinedPlayer.statusMessage = "Both players joined. Press Start when ready.";
      });
      return;
    }

    this.state.statusMessage = `Room ${this.roomId}: waiting for another player.`;
    player.statusMessage = `Share room code ${this.roomId}.`;
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);

    if (player) {
      player.result = "disconnect";
      player.statusMessage = "Disconnected.";
    }

    if (this.state.phase === "running" || this.state.phase === "countdown") {
      this.endMatch(client.sessionId);
      return;
    }

    this.state.players.delete(client.sessionId);
    this.unlock();
  }

  async onDispose() {
    this.clearTimers();
    await this.presence.srem(roomCodeChannel, this.roomId);
  }

  private async generateRoomId() {
    const currentIds = await this.presence.smembers(roomCodeChannel);
    let id = "";

    do {
      id = Array.from({ length: 4 }, () =>
        roomLetters.charAt(Math.floor(Math.random() * roomLetters.length)),
      ).join("");
    } while (currentIds.includes(id));

    await this.presence.sadd(roomCodeChannel, id);
    return id;
  }

  private startCountdown() {
    this.clearTimers();
    this.state.phase = "countdown";
    this.state.countdownRemainingMs = countdownDurationMs;
    this.state.statusMessage = "Match starts soon.";

    this.state.players.forEach((player) => {
      player.statusMessage = "Match starts soon.";
    });

    this.countdownInterval = setInterval(() => {
      this.state.countdownRemainingMs = Math.max(
        0,
        this.state.countdownRemainingMs - timerTickMs,
      );

      if (this.state.countdownRemainingMs === 0) {
        this.startMatch();
      }
    }, timerTickMs);
  }

  private startMatch() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.state.phase = "running";
    this.state.timeRemainingMs = matchDurationMs;
    this.state.statusMessage = "Go. Make as many products as possible.";

    this.state.players.forEach((player) => {
      player.statusMessage = "Go. Make as many products as possible.";
    });

    this.matchInterval = setInterval(() => {
      this.state.timeRemainingMs = Math.max(
        0,
        this.state.timeRemainingMs - timerTickMs,
      );

      if (this.state.timeRemainingMs === 0) {
        this.endMatch();
      }
    }, timerTickMs);
  }

  private resetMatch() {
    this.clearTimers();
    this.state.phase = "waiting";
    this.state.timeRemainingMs = matchDurationMs;
    this.state.countdownRemainingMs = 0;
    this.state.winnerSessionId = "";

    this.state.players.forEach((player) => {
      player.score = 0;
      player.attackResource = 0;
      player.result = "pending";
      player.statusMessage = "Waiting for match start.";
      this.clearInhibition(player);
      this.applyRound(player, 1);
    });
  }

  private bindSubstrate(client: Client, payload: BindSubstratePayload) {
    const player = this.getPlayer(client);

    if (!player) {
      return;
    }

    if (this.state.phase !== "running") {
      player.statusMessage = "Wait for the match to start.";
      return;
    }

    if (player.inhibition.competitiveBlockers.length > 0) {
      player.statusMessage = "Clear competitive blockers first.";
      return;
    }

    const substrateId =
      typeof payload.substrateId === "string" ? payload.substrateId : "";
    const inActiveSite = payload.inActiveSite === true;

    if (!inActiveSite || substrateId !== player.correctSubstrateId) {
      player.statusMessage = !inActiveSite
        ? "Drop a substrate into the active site."
        : "That substrate does not fit this enzyme.";
      return;
    }

    if (player.cofactorRequired && !player.cofactorBound) {
      player.statusMessage = "Bind the cofactor before this substrate can react.";
      return;
    }

    if (player.inhibition.allostericActive) {
      player.statusMessage =
        "Substrate binds, but noncompetitive inhibition blocks the reaction.";
      return;
    }

    player.score += 1;
    player.attackResource += 1;
    this.applyRound(player, player.round + 1);
    player.statusMessage = player.cofactorRequired
      ? "Product formed. Cofactor enzyme loaded."
      : "Product formed. New substrate set loaded.";
  }

  private bindCofactor(client: Client, payload: BindCofactorPayload) {
    const player = this.getPlayer(client);

    if (!player || !player.cofactorRequired || player.cofactorBound) {
      return;
    }

    if (this.state.phase !== "running") {
      player.statusMessage = "Wait for the match to start.";
      return;
    }

    if (player.inhibition.competitiveBlockers.length > 0) {
      player.statusMessage = "Clear competitive blockers before binding cofactor.";
      return;
    }

    if (payload.inCofactorSite !== true) {
      player.statusMessage = "Drop the cofactor into the cofactor site.";
      return;
    }

    player.cofactorBound = true;
    player.statusMessage = "Cofactor bound. The active site is ready.";
  }

  private clearCompetitiveBlocker(
    client: Client,
    payload: ClearCompetitivePayload,
  ) {
    const player = this.getPlayer(client);
    const blockerId =
      typeof payload.blockerId === "string" ? payload.blockerId : "";

    if (!player || !blockerId) {
      return;
    }

    const blockerIndex = player.inhibition.competitiveBlockers.findIndex(
      (blocker) => blocker.id === blockerId,
    );

    if (blockerIndex === -1) {
      return;
    }

    player.inhibition.competitiveBlockers.splice(blockerIndex, 1);
    player.statusMessage =
      player.inhibition.competitiveBlockers.length === 0
        ? "Competitive blockers cleared."
        : `${player.inhibition.competitiveBlockers.length} competitive blockers left.`;
  }

  private advanceAllostericHold(
    client: Client,
    payload: AdvanceAllostericPayload,
  ) {
    const player = this.getPlayer(client);

    if (!player || !player.inhibition.allostericActive) {
      return;
    }

    const deltaMs =
      typeof payload.deltaMs === "number" && Number.isFinite(payload.deltaMs)
        ? Math.max(0, Math.min(payload.deltaMs, 200))
        : 0;
    player.inhibition.allostericHoldMs = Math.min(
      allostericHoldTargetMs,
      player.inhibition.allostericHoldMs + deltaMs,
    );

    if (player.inhibition.allostericHoldMs >= allostericHoldTargetMs) {
      player.inhibition.allostericActive = false;
      player.inhibition.allostericHoldMs = allostericHoldTargetMs;
      player.statusMessage = "Noncompetitive inhibition cleared.";
      return;
    }

    player.statusMessage = "Holding noncompetitive lock.";
  }

  private sendAttack(client: Client, payload: SendAttackPayload) {
    const player = this.getPlayer(client);
    const opponent = this.getOpponent(client.sessionId);
    const kind = payload.kind === "competitive" ? "competitive" : "noncompetitive";
    const cost = attackCosts[kind];

    if (!player || !opponent) {
      return;
    }

    if (this.state.phase !== "running") {
      player.statusMessage = "Wait for the match to start.";
      return;
    }

    if (player.attackResource < cost) {
      player.statusMessage = `Need ${cost} attack resource.`;
      return;
    }

    if (
      opponent.inhibition.allostericActive ||
      opponent.inhibition.competitiveBlockers.length > 0
    ) {
      player.statusMessage = "Opponent is already inhibited.";
      return;
    }

    player.attackResource -= cost;

    if (kind === "competitive") {
      this.setCompetitiveBlockers(opponent);
      player.statusMessage = "Competitive inhibition sent.";
      opponent.statusMessage = "Incoming competitive inhibition.";
      return;
    }

    opponent.inhibition.allostericActive = true;
    opponent.inhibition.allostericHoldMs = 0;
    player.statusMessage = "Noncompetitive inhibition sent.";
    opponent.statusMessage = "Incoming noncompetitive inhibition.";
  }

  private endMatch(disconnectedSessionId?: string) {
    this.clearTimers();
    this.state.phase = "ended";
    this.state.countdownRemainingMs = 0;
    this.unlock();

    const players = Array.from(this.state.players.values());

    if (players.length < 2) {
      const remainingPlayer = players.find(
        (player) => player.sessionId !== disconnectedSessionId,
      );

      if (remainingPlayer) {
        remainingPlayer.result = "win";
        remainingPlayer.statusMessage = "Opponent disconnected. You win.";
        this.state.winnerSessionId = remainingPlayer.sessionId;
      }

      this.state.statusMessage = "Match ended.";
      return;
    }

    const [first, second] = players;

    if (first.score === second.score) {
      first.result = "draw";
      second.result = "draw";
      first.statusMessage = `Draw. Final score: ${first.score}.`;
      second.statusMessage = `Draw. Final score: ${second.score}.`;
      this.state.winnerSessionId = "";
      this.state.statusMessage = "Draw.";
      return;
    }

    const winner = first.score > second.score ? first : second;
    const loser = winner === first ? second : first;

    winner.result = "win";
    loser.result = "loss";
    winner.statusMessage = `You win ${winner.score}-${loser.score}.`;
    loser.statusMessage = `You lose ${loser.score}-${winner.score}.`;
    this.state.winnerSessionId = winner.sessionId;
    this.state.statusMessage = "Match ended.";
  }

  private applyRound(player: PlayerState, round: number) {
    const roundSpec = buildRoundSpec(round);

    player.round = round;
    player.roundKind = roundSpec.kind;
    player.correctSubstrateId = roundSpec.correctSubstrateId;
    player.cofactorRequired = roundSpec.cofactorRequired;
    player.cofactorBound = false;
    this.clearInhibition(player);
  }

  private setCompetitiveBlockers(player: PlayerState) {
    player.inhibition.competitiveBlockers.splice(
      0,
      player.inhibition.competitiveBlockers.length,
    );
    player.inhibition.competitiveBlockers.push(
      ...buildCompetitiveBlockers(player.round).map(
        (blocker) => new CompetitiveBlockerState(blocker),
      ),
    );
    player.inhibition.allostericActive = false;
    player.inhibition.allostericHoldMs = 0;
  }

  private clearInhibition(player: PlayerState) {
    player.inhibition.competitiveBlockers.splice(
      0,
      player.inhibition.competitiveBlockers.length,
    );
    player.inhibition.allostericActive = false;
    player.inhibition.allostericHoldMs = 0;
  }

  private getPlayer(client: Client) {
    return this.state.players.get(client.sessionId);
  }

  private getOpponent(sessionId: string) {
    return Array.from(this.state.players.values()).find(
      (player) => player.sessionId !== sessionId,
    );
  }

  private clearTimers() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    if (this.matchInterval) {
      clearInterval(this.matchInterval);
      this.matchInterval = null;
    }
  }
}

function sanitizeDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return "Player";
  }

  const displayName = value.trim().replace(/\s+/g, " ").slice(0, 18);

  return displayName.length > 0 ? displayName : "Player";
}
