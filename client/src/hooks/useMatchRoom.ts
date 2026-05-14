import { useContext } from "react";

import { MatchRoomContext } from "@/hooks/matchRoomContext";

export function useMatchRoom() {
  const context = useContext(MatchRoomContext);

  if (!context) {
    throw new Error("useMatchRoom must be used inside MatchRoomProvider.");
  }

  return context;
}
