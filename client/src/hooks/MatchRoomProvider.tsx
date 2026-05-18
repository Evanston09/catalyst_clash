import { useEffect, useRef, useState, type ReactNode } from "react";
import { Client, type Room } from "@colyseus/sdk";
import { useNavigate } from "react-router";

import {
  buildRound,
  getCompetitiveInhibitorImageSrc,
  preloadUpcomingRoundImages,
} from "@/lib/gameAssets";
import {
  allostericHoldTargetMs,
  matchDurationMs,
  timerTickMs,
  createEmptyInhibitionState,
  getBlockingReason,
} from "@/lib/gameRules";
import { MatchRoomContext, type MatchRoomContextValue } from "@/hooks/matchRoomContext";
import type {
  GameState,
  MatchOpponent,
  MultiplayerSnapshot,
  RemoteMatchState,
  RemotePlayerState,
} from "@/lib/gameTypes";

const colyseusServerUrl =
  import.meta.env.VITE_COLYSEUS_URL ?? "http://localhost:3000";

export function MatchRoomProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [game, setGame] = useState<GameState>(createInitialState);
  const [room, setRoom] = useState<Room<RemoteMatchState> | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [lobbyError, setLobbyError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [match, setMatch] = useState<MultiplayerSnapshot>(createEmptyMatch);
  const [startRequested, setStartRequested] = useState(false);
  const roomRef = useRef<Room<RemoteMatchState> | null>(null);
  const intentionalLeaveRef = useRef(false);

  useEffect(() => {
    preloadUpcomingRoundImages(game.round);
  }, [game.round]);

  useEffect(() => {
    if (room) {
      return;
    }

    if (game.status !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "running") {
          return current;
        }

        const timeRemainingMs = Math.max(
          0,
          current.timeRemainingMs - timerTickMs,
        );

        if (timeRemainingMs > 0) {
          return { ...current, timeRemainingMs };
        }

        return {
          ...current,
          status: "ended",
          timeRemainingMs,
          statusMessage: `Time. Final score: ${current.productCount} products.`,
        };
      });
    }, timerTickMs);

    return () => window.clearInterval(intervalId);
  }, [game.status, room]);

  useEffect(() => {
    return () => {
      roomRef.current?.leave();
    };
  }, []);

  useEffect(() => {
    if (!game.failedSubstrateId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => ({ ...current, failedSubstrateId: null }));
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [game.failedSubstrateId]);

  useEffect(() => {
    if (!game.cofactor.failed) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => ({
        ...current,
        cofactor: { ...current.cofactor, failed: false },
      }));
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [game.cofactor.failed]);

  async function createRoom(displayName: string) {
    await connectToRoom("create", displayName);
  }

  async function joinExistingRoom(displayName: string) {
    await connectToRoom("join", displayName);
  }

  async function connectToRoom(mode: "create" | "join", displayName: string) {
    setConnecting(true);
    setLobbyError("");

    try {
      const client = new Client(colyseusServerUrl);
      const options = { displayName: sanitizeDisplayName(displayName) };
      const joinedRoom =
        mode === "create"
          ? await client.create<RemoteMatchState>("catalyst_match", options)
          : await client.joinById<RemoteMatchState>(
              joinCode.trim().toUpperCase(),
              options,
            );

      attachRoom(joinedRoom);
      navigate("/waiting");
    } catch (error) {
      setLobbyError(
        error instanceof Error ? error.message : "Could not connect to match.",
      );
      navigate("/lobby");
    } finally {
      setConnecting(false);
    }
  }

  function attachRoom(joinedRoom: Room<RemoteMatchState>) {
    intentionalLeaveRef.current = false;
    roomRef.current = joinedRoom;
    setRoom(joinedRoom);
    setJoinCode(joinedRoom.roomId);

    const sync = (state: RemoteMatchState) => {
      syncRoomState(joinedRoom, state);
    };

    joinedRoom.onStateChange(sync);
    joinedRoom.onLeave(() => {
      if (roomRef.current === joinedRoom) {
        roomRef.current = null;
        setRoom(null);
        setMatch(createEmptyMatch());
        setGame(createInitialState());
        setStartRequested(false);

        if (!intentionalLeaveRef.current) {
          setLobbyError("Disconnected from room.");
        }

        navigate("/lobby");
      }
    });

    sync(joinedRoom.state);
  }

  function syncRoomState(
    joinedRoom: Room<RemoteMatchState>,
    state: RemoteMatchState,
  ) {
    const players = getPlayers(state);
    const ownPlayer = getOwnPlayer(state, joinedRoom.sessionId);

    if (!players.length || !ownPlayer) {
      setMatch((current) => ({
        ...current,
        phase: state?.phase ?? "waiting",
        roomCode: joinedRoom.roomId,
        playersConnected: players.length,
        countdownRemainingMs: state?.countdownRemainingMs ?? 0,
        sessionMatchNumber: state?.sessionMatchNumber ?? 1,
        maxSessionMatches: state?.maxSessionMatches ?? 3,
        tutorialReadyCount: countTutorialReady(players),
        ownName: current.ownName === "You" ? "Player" : current.ownName,
      }));

      return;
    }

    const opponents = players.filter(
      (player) => player.sessionId !== joinedRoom.sessionId,
    );
    const opponent = opponents[0];

    setMatch({
      phase: state.phase,
      roomCode: joinedRoom.roomId,
      playersConnected: players.length,
      countdownRemainingMs: state.countdownRemainingMs,
      sessionMatchNumber: state.sessionMatchNumber,
      maxSessionMatches: state.maxSessionMatches,
      tutorialComplete: ownPlayer.tutorialComplete,
      tutorialReadyCount: countTutorialReady(players),
      opponentScore: opponent?.score ?? 0,
      opponentName: opponent?.displayName ?? "Rival",
      opponents: opponents.map((remotePlayer): MatchOpponent => ({
        sessionId: remotePlayer.sessionId,
        displayName: remotePlayer.displayName,
        score: remotePlayer.score,
        sessionProducts: remotePlayer.sessionProducts,
        sessionWins: remotePlayer.sessionWins,
        tutorialComplete: remotePlayer.tutorialComplete,
      })),
      ownName: ownPlayer?.displayName ?? "You",
      ownSessionProducts: ownPlayer?.sessionProducts ?? 0,
      ownSessionWins: ownPlayer?.sessionWins ?? 0,
      attackResource: ownPlayer?.attackResource ?? 0,
      optimalConditionCharges: ownPlayer?.optimalConditionCharges ?? 0,
      result: ownPlayer?.result ?? "pending",
    });

    setGame((current) => mapRemotePlayerToGame(current, ownPlayer, state));
  }

  function leaveRoom() {
    intentionalLeaveRef.current = true;
    roomRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setMatch(createEmptyMatch());
    setGame(createInitialState());
    setStartRequested(false);
    navigate("/lobby");
  }

  function restartMatch() {
    setStartRequested(false);
    room?.send("restartRequest");
    navigate("/waiting");
  }

  function markTutorialComplete() {
    room?.send("tutorialComplete");
  }

  function activateOptimalConditions() {
    room?.send("activateOptimalConditions");
  }

  function startMatch() {
    setStartRequested(true);
    room?.send("startRequest");
    navigate("/game");
  }

  function sendAttack(
    kind: "competitive" | "noncompetitive",
    targetSessionId?: string,
  ) {
    room?.send("sendAttack", { kind, targetSessionId });
  }

  function tryBindSubstrate(substrateId: string, inActiveSite: boolean) {
    if (room) {
      if (!inActiveSite || substrateId !== game.correctSubstrateId) {
        setGame((current) => ({ ...current, failedSubstrateId: substrateId }));
      }

      room.send("bindSubstrate", { substrateId, inActiveSite });
      return;
    }

    setGame((current) => {
      if (current.status !== "running") {
        return {
          ...current,
          failedSubstrateId: substrateId,
          statusMessage: "Press Start before binding substrates.",
        };
      }

      const currentBlockingReason = getBlockingReason(current.inhibition);

      if (currentBlockingReason === "competitive") {
        return {
          ...current,
          failedSubstrateId: substrateId,
          statusMessage: "Competitive blockers are occupying the field.",
        };
      }

      if (!inActiveSite || substrateId !== current.correctSubstrateId) {
        return {
          ...current,
          failedSubstrateId: substrateId,
          statusMessage: !inActiveSite
            ? "Drop a substrate into the active site."
            : "That substrate does not fit this enzyme.",
        };
      }

      if (current.cofactor.required && !current.cofactor.bound) {
        return {
          ...current,
          failedSubstrateId: substrateId,
          statusMessage: "Bind the cofactor before this substrate can react.",
        };
      }

      if (
        current.inhibition.allostericPrimed ||
        current.inhibition.allostericActive
      ) {
        return {
          ...current,
          statusMessage:
            "Substrate binds, but an allosteric blocker prevents product formation.",
          inhibition: {
            ...current.inhibition,
            allostericActive: true,
            allostericPrimed: false,
          },
        };
      }

      const nextRound = current.round + 1;
      const nextRoundState = buildRound(nextRound);

      return {
        ...current,
        productCount: current.productCount + 1,
        round: nextRound,
        statusMessage: nextRoundState.cofactor.required
          ? "Product formed. Cofactor enzyme loaded."
          : "Product formed. New substrate set loaded.",
        ...nextRoundState,
      };
    });
  }

  function tryBindCofactor(inCofactorSite: boolean) {
    if (room) {
      if (!inCofactorSite) {
        setGame((current) => ({
          ...current,
          cofactor: { ...current.cofactor, failed: true },
        }));
      }

      room.send("bindCofactor", { inCofactorSite });
      return;
    }

    setGame((current) => {
      if (!current.cofactor.required || current.cofactor.bound) {
        return current;
      }

      if (current.status !== "running") {
        return {
          ...current,
          cofactor: { ...current.cofactor, failed: true },
          statusMessage: "Press Start before binding cofactors.",
        };
      }

      if (getBlockingReason(current.inhibition) === "competitive") {
        return {
          ...current,
          cofactor: { ...current.cofactor, failed: true },
          statusMessage: "Clear competitive blockers before binding the cofactor.",
        };
      }

      if (!inCofactorSite) {
        return {
          ...current,
          cofactor: { ...current.cofactor, failed: true },
          statusMessage: "Drop the cofactor into the hexagonal cofactor site.",
        };
      }

      return {
        ...current,
        cofactor: { ...current.cofactor, bound: true, failed: false },
        statusMessage: "Cofactor bound. The active site is ready.",
      };
    });
  }

  function clearCompetitiveBlocker(blockerId: string) {
    if (room) {
      room.send("clearCompetitiveBlocker", { blockerId });
      return;
    }

    setGame((current) => {
      const competitiveBlockers =
        current.inhibition.competitiveBlockers.filter(
          (blocker) => blocker.id !== blockerId,
        );

      return {
        ...current,
        statusMessage:
          competitiveBlockers.length === 0
            ? "Competitive blockers cleared."
            : `${competitiveBlockers.length} competitive blockers left.`,
        inhibition: {
          ...current.inhibition,
          competitiveBlockers,
        },
      };
    });
  }

  function advanceAllostericHold(deltaMs: number) {
    if (room) {
      room.send("advanceAllostericHold", { deltaMs });
      return;
    }

    setGame((current) => {
      if (!current.inhibition.allostericActive) {
        return current;
      }

      const allostericHoldMs = Math.min(
        allostericHoldTargetMs,
        current.inhibition.allostericHoldMs + deltaMs,
      );
      const allostericActive = allostericHoldMs < allostericHoldTargetMs;

      return {
        ...current,
        statusMessage: allostericActive
          ? "Holding allosteric lock."
          : "Allosteric inhibition cleared.",
        inhibition: {
          ...current.inhibition,
          allostericActive,
          allostericPrimed: false,
          allostericHoldMs,
        },
      };
    });
  }

  const value: MatchRoomContextValue = {
    game,
    room,
    joinCode,
    setJoinCode,
    lobbyError,
    connecting,
    match,
    startRequested,
    createRoom,
    joinExistingRoom,
    leaveRoom,
    startMatch,
    restartMatch,
    markTutorialComplete,
    activateOptimalConditions,
    sendAttack,
    tryBindSubstrate,
    tryBindCofactor,
    clearCompetitiveBlocker,
    advanceAllostericHold,
  };

  return (
    <MatchRoomContext.Provider value={value}>
      {children}
    </MatchRoomContext.Provider>
  );
}

function getOwnPlayer(
  state: RemoteMatchState | undefined,
  sessionId: string,
): RemotePlayerState | undefined {
  const players = state?.players;

  if (!isObject(players)) {
    return undefined;
  }

  if (hasPlayerGetter(players)) {
    return players.get(sessionId);
  }

  return (players as Record<string, unknown>)[sessionId] as
    | RemotePlayerState
    | undefined;
}

function getPlayers(state: RemoteMatchState | undefined): RemotePlayerState[] {
  const players = state?.players;

  if (!isObject(players)) {
    return [];
  }

  if (hasPlayerValues(players)) {
    return Array.from(players.values());
  }

  return Object.values(players as Record<string, unknown>).filter(
    isRemotePlayerState,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasPlayerGetter(
  players: Record<string, unknown>,
): players is Record<string, unknown> & {
  get: (sessionId: string) => RemotePlayerState | undefined;
} {
  return typeof players.get === "function";
}

function hasPlayerValues(
  players: Record<string, unknown>,
): players is Record<string, unknown> & {
  values: () => Iterable<RemotePlayerState>;
} {
  return typeof players.values === "function";
}

function isRemotePlayerState(player: unknown): player is RemotePlayerState {
  return (
    typeof player === "object" &&
    player !== null &&
    "sessionId" in player &&
    "score" in player
  );
}

function countTutorialReady(players: RemotePlayerState[]) {
  return players.filter((player) => player.tutorialComplete).length;
}

function createInitialState(): GameState {
  return {
    status: "idle",
    timeRemainingMs: matchDurationMs,
    productCount: 0,
    round: 1,
    statusMessage: "Press Start, then drag the correct substrate into the active site.",
    inhibition: createEmptyInhibitionState(),
    ...buildRound(1),
  };
}

function createEmptyMatch(): MultiplayerSnapshot {
  return {
    phase: "lobby",
    roomCode: "",
    playersConnected: 0,
    countdownRemainingMs: 0,
    sessionMatchNumber: 1,
    maxSessionMatches: 3,
    tutorialComplete: false,
    tutorialReadyCount: 0,
    opponentScore: 0,
    opponentName: "Rival",
    opponents: [],
    ownName: "You",
    ownSessionProducts: 0,
    ownSessionWins: 0,
    attackResource: 0,
    optimalConditionCharges: 0,
    result: "pending",
  };
}

function mapRemotePlayerToGame(
  current: GameState,
  player: RemotePlayerState,
  state: RemoteMatchState,
): GameState {
  const roundState = buildRound(player.round);
  const status =
    state.phase === "running"
      ? "running"
      : state.phase === "roundComplete" || state.phase === "ended"
        ? "ended"
        : "idle";
  const competitiveBlockers = Array.from(
    player.inhibition.competitiveBlockers,
  ).map((blocker, index) => {
    const blockerSeed = blocker.id || `competitive-${player.round}-${index}`;

    return {
      id: blocker.id,
      imageSrc:
        blocker.imageSrc ?? getCompetitiveInhibitorImageSrc(blockerSeed, player.round),
      xRatio: blocker.xRatio,
      yRatio: blocker.yRatio,
    };
  });

  return {
    ...current,
    ...roundState,
    status,
    timeRemainingMs: state.timeRemainingMs,
    productCount: player.score,
    round: player.round,
    statusMessage: player.statusMessage || state.statusMessage,
    inhibition: {
      competitiveBlockers,
      allostericActive: player.inhibition.allostericActive,
      allostericPrimed: false,
      allostericHoldMs: player.inhibition.allostericHoldMs,
    },
    cofactor: {
      ...roundState.cofactor,
      required: player.cofactorRequired,
      bound: player.cofactorBound,
      failed: current.cofactor.failed,
    },
  };
}

function sanitizeDisplayName(displayName: string) {
  const sanitized = displayName.trim().replace(/\s+/g, " ").slice(0, 18);

  return sanitized.length > 0 ? sanitized : "Player";
}
