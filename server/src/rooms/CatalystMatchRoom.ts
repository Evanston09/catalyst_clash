import { Client, Room } from "@colyseus/core";

import {
  allostericHoldTargetMs,
  attackCosts,
  buildCompetitiveBlockers,
  buildRoundSpec,
  matchDurationMs,
  optimalConditionsCharges,
  optimalConditionsCost,
  optimalConditionsScoreBonus,
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

function formatCountdownStatus(countdownRemainingMs: number) {
  const secondsRemaining = Math.ceil(countdownRemainingMs / 1_000);

  return secondsRemaining > 0 ? `${secondsRemaining}` : "Go!";
}

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
  targetSessionId?: unknown;
};

type JoinOptions = {
  displayName?: unknown;
};

export class CatalystMatchRoom extends Room {
  maxClients = 16;
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
    this.onMessage("activateOptimalConditions", (client) => {
      this.activateOptimalConditions(client);
    });
    this.onMessage("tutorialComplete", (client) => {
      this.markTutorialComplete(client);
    });
    this.onMessage("restartRequest", () => {
      if (this.state.phase === "roundComplete" && this.clients.length >= 2) {
        this.prepareNextMatch();
        return;
      }

      if (this.state.phase === "ended" && this.clients.length >= 2) {
        this.resetSession();
      }
    });
    this.onMessage("startRequest", () => {
      if (this.state.phase === "waiting" && this.state.players.size >= 2) {
        if (!this.allPlayersTutorialComplete()) {
          this.setWaitingStatus();
          return;
        }

        this.startCountdown();
      }
    });
  }

  onJoin(client: Client, options?: JoinOptions) {
    if (this.state.phase !== "waiting" || this.state.players.size >= this.maxClients) {
      client.leave();
      return;
    }

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.displayName = sanitizeDisplayName(options?.displayName);
    this.applyRound(player, 1);
    this.state.players.set(client.sessionId, player);
    this.setWaitingStatus();

    if (this.state.players.size >= 2) {
      if (this.state.players.size >= this.maxClients) {
        this.lock();
      }
    }
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
    if (this.state.phase === "waiting") {
      this.setWaitingStatus();
    }
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
    this.lock();
    this.state.phase = "countdown";
    this.state.countdownRemainingMs = countdownDurationMs;
    this.setStatusForAllPlayers(formatCountdownStatus(this.state.countdownRemainingMs));

    this.countdownInterval = setInterval(() => {
      this.state.countdownRemainingMs = Math.max(
        0,
        this.state.countdownRemainingMs - timerTickMs,
      );

      if (this.state.countdownRemainingMs === 0) {
        this.startMatch();
        return;
      }

      this.setStatusForAllPlayers(
        formatCountdownStatus(this.state.countdownRemainingMs),
      );
    }, timerTickMs);
  }

  private markTutorialComplete(client: Client) {
    const player = this.getPlayer(client);

    if (!player) {
      return;
    }

    player.tutorialComplete = true;

    if (this.state.phase === "waiting") {
      this.setWaitingStatus();
      return;
    }

    player.statusMessage = "Tutorial complete.";
  }

  private startMatch() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.state.phase = "running";
    this.state.timeRemainingMs = matchDurationMs;
    this.setStatusForAllPlayers(
      `Match ${this.state.sessionMatchNumber} of ${this.state.maxSessionMatches}: go!`,
    );

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

  private prepareNextMatch() {
    this.clearTimers();
    this.state.phase = "waiting";
    this.state.timeRemainingMs = matchDurationMs;
    this.state.countdownRemainingMs = 0;
    this.state.winnerSessionId = "";
    this.state.sessionMatchNumber = Math.min(
      this.state.sessionMatchNumber + 1,
      this.state.maxSessionMatches,
    );

    this.state.players.forEach((player) => {
      this.resetPlayerForMatch(player);
    });

    this.setWaitingStatus();
  }

  private resetSession() {
    this.clearTimers();
    this.state.phase = "waiting";
    this.state.timeRemainingMs = matchDurationMs;
    this.state.countdownRemainingMs = 0;
    this.state.winnerSessionId = "";
    this.state.sessionMatchNumber = 1;

    this.state.players.forEach((player) => {
      player.sessionProducts = 0;
      player.sessionWins = 0;
      this.resetPlayerForMatch(player);
    });

    this.setWaitingStatus();
  }

  private resetPlayerForMatch(player: PlayerState) {
    player.score = 0;
    player.attackResource = 0;
    player.optimalConditionCharges = 0;
    player.result = "pending";
    player.statusMessage = "Waiting for match start.";
    this.clearInhibition(player);
    this.applyRound(player, 1);
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

    const scoreGain =
      1 +
      (player.optimalConditionCharges > 0 ? optimalConditionsScoreBonus : 0);

    player.score += scoreGain;
    player.attackResource += 1;
    player.optimalConditionCharges = Math.max(
      0,
      player.optimalConditionCharges - 1,
    );
    this.applyRound(player, player.round + 1);
    player.statusMessage = player.cofactorRequired
      ? `${scoreGain > 1 ? "Boosted product formed" : "Product formed"}. Cofactor enzyme loaded.`
      : `${scoreGain > 1 ? "Boosted product formed" : "Product formed"}. New substrate set loaded.`;
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
    const targetSessionId =
      typeof payload.targetSessionId === "string" ? payload.targetSessionId : "";
    const opponent = this.getAttackTarget(client.sessionId, targetSessionId);
    const kind = payload.kind === "competitive" ? "competitive" : "noncompetitive";
    const cost = attackCosts[kind];

    if (!player) {
      return;
    }

    if (!opponent) {
      player.statusMessage = "Pick a valid player to inhibit.";
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

  private activateOptimalConditions(client: Client) {
    const player = this.getPlayer(client);

    if (!player) {
      return;
    }

    if (this.state.phase !== "running") {
      player.statusMessage = "Wait for the match to start.";
      return;
    }

    if (player.optimalConditionCharges > 0) {
      player.statusMessage = "Optimal Conditions are already active.";
      return;
    }

    if (player.attackResource < optimalConditionsCost) {
      player.statusMessage = `Need ${optimalConditionsCost} energy.`;
      return;
    }

    player.attackResource -= optimalConditionsCost;
    player.optimalConditionCharges = optimalConditionsCharges;
    player.statusMessage = `Optimal pH and temperature set. Next ${optimalConditionsCharges} products score double.`;
  }

  private endMatch(disconnectedSessionId?: string) {
    this.clearTimers();
    this.state.countdownRemainingMs = 0;
    this.unlock();

    const players = Array.from(this.state.players.values());

    if (disconnectedSessionId || players.length < 2) {
      this.state.phase = "ended";
      const remainingPlayer = players.find(
        (player) => player.sessionId !== disconnectedSessionId,
      );

      if (remainingPlayer) {
        remainingPlayer.result = "win";
        remainingPlayer.statusMessage = "Opponent disconnected. You win.";
        this.state.winnerSessionId = remainingPlayer.sessionId;
      }

      this.state.statusMessage = "Session ended.";
      return;
    }

    const topScore = Math.max(...players.map((player) => player.score));
    const winners = players.filter((player) => player.score === topScore);

    players.forEach((player) => {
      player.sessionProducts += player.score;
    });

    if (winners.length > 1) {
      players.forEach((player) => {
        if (player.score === topScore) {
          player.result = "draw";
          player.statusMessage = `Draw. Final score: ${player.score}.`;
          return;
        }

        player.result = "loss";
        player.statusMessage = `You lose. Top score was ${topScore}.`;
      });
      this.state.winnerSessionId = "";
      this.state.statusMessage = `Match ${this.state.sessionMatchNumber} ended in a draw.`;
    } else {
      const winner = winners[0];

      winner.sessionWins += 1;

      players.forEach((player) => {
        if (player.sessionId === winner.sessionId) {
          player.result = "win";
          player.statusMessage = `You win match ${this.state.sessionMatchNumber} with ${winner.score}.`;
          return;
        }

        player.result = "loss";
        player.statusMessage = `You lose match ${this.state.sessionMatchNumber}. Winner scored ${winner.score}.`;
      });
      this.state.winnerSessionId = winner.sessionId;
      this.state.statusMessage = `Match ${this.state.sessionMatchNumber} ended.`;
    }

    if (this.state.sessionMatchNumber < this.state.maxSessionMatches) {
      this.state.phase = "roundComplete";
      return;
    }

    this.state.phase = "ended";
    this.applyFinalSessionResults(players);
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
    this.clearInhibition(player);
    player.inhibition.competitiveBlockers.push(
      ...buildCompetitiveBlockers(player.round).map(
        (blocker) => new CompetitiveBlockerState(blocker),
      ),
    );
  }

  private setStatusForAllPlayers(message: string) {
    this.state.statusMessage = message;
    this.state.players.forEach((player) => {
      player.statusMessage = message;
    });
  }

  private setWaitingStatus() {
    const playerCount = this.state.players.size;
    const readyCount = this.tutorialReadyCount();

    if (playerCount < 2) {
      this.state.statusMessage = `Room ${this.roomId}: waiting for another player.`;
    } else if (readyCount < playerCount) {
      this.state.statusMessage = `${readyCount}/${playerCount} players tutorial-ready.`;
    } else {
      this.state.statusMessage = `All players ready for match ${this.state.sessionMatchNumber} of ${this.state.maxSessionMatches}.`;
    }

    this.state.players.forEach((player) => {
      if (!player.tutorialComplete) {
        player.statusMessage = "Complete the tutorial before the match can start.";
        return;
      }

      player.statusMessage =
        playerCount < 2
          ? `Share room code ${this.roomId}.`
          : this.state.statusMessage;
    });
  }

  private tutorialReadyCount() {
    return Array.from(this.state.players.values()).filter(
      (player) => player.tutorialComplete,
    ).length;
  }

  private allPlayersTutorialComplete() {
    return (
      this.state.players.size >= 2 &&
      this.tutorialReadyCount() === this.state.players.size
    );
  }

  private applyFinalSessionResults(players: PlayerState[]) {
    const topWins = Math.max(...players.map((player) => player.sessionWins));
    const winLeaders = players.filter((player) => player.sessionWins === topWins);
    const topProducts = Math.max(
      ...winLeaders.map((player) => player.sessionProducts),
    );
    const winners = winLeaders.filter(
      (player) => player.sessionProducts === topProducts,
    );

    if (winners.length > 1) {
      players.forEach((player) => {
        const tiedForFirst = winners.includes(player);

        player.result = tiedForFirst ? "draw" : "loss";
        player.statusMessage = tiedForFirst
          ? `Session draw: ${player.sessionWins} wins, ${player.sessionProducts} products.`
          : `Session over. Top total was ${topWins} wins and ${topProducts} products.`;
      });
      this.state.winnerSessionId = "";
      this.state.statusMessage = "Session draw.";
      return;
    }

    const winner = winners[0];

    players.forEach((player) => {
      if (player.sessionId === winner.sessionId) {
        player.result = "win";
        player.statusMessage = `Session win: ${winner.sessionWins} wins, ${winner.sessionProducts} products.`;
        return;
      }

      player.result = "loss";
      player.statusMessage = `Session loss. Winner had ${winner.sessionWins} wins and ${winner.sessionProducts} products.`;
    });
    this.state.winnerSessionId = winner.sessionId;
    this.state.statusMessage = "Session ended.";
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

  private getAttackTarget(sessionId: string, targetSessionId: string) {
    const opponents = Array.from(this.state.players.values()).filter(
      (player) => player.sessionId !== sessionId,
    );

    if (!opponents.length) {
      return undefined;
    }

    if (!targetSessionId) {
      return opponents[0];
    }

    return opponents.find((player) => player.sessionId === targetSessionId);
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
