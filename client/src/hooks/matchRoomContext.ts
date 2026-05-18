import { createContext } from "react";
import type { Room } from "@colyseus/sdk";

import type {
  GameState,
  MultiplayerSnapshot,
  RemoteMatchState,
} from "@/lib/gameTypes";

export type MatchRoomContextValue = {
  game: GameState;
  room: Room<RemoteMatchState> | null;
  joinCode: string;
  setJoinCode: (joinCode: string) => void;
  lobbyError: string;
  connecting: boolean;
  match: MultiplayerSnapshot;
  startRequested: boolean;
  createRoom: (displayName: string) => Promise<void>;
  joinExistingRoom: (displayName: string) => Promise<void>;
  leaveRoom: () => void;
  startMatch: () => void;
  restartMatch: () => void;
  markTutorialComplete: () => void;
  activateOptimalConditions: () => void;
  sendAttack: (
    kind: "competitive" | "noncompetitive",
    targetSessionId?: string,
  ) => void;
  tryBindSubstrate: (substrateId: string, inActiveSite: boolean) => void;
  tryBindCofactor: (inCofactorSite: boolean) => void;
  clearCompetitiveBlocker: (blockerId: string) => void;
  advanceAllostericHold: (deltaMs: number) => void;
};

export const MatchRoomContext = createContext<MatchRoomContextValue | null>(null);
