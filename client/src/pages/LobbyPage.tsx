import { useEffect, useState } from "react";
import { PlayIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMatchRoom } from "@/hooks/useMatchRoom";

const displayNameStorageKey = "catalyst-clash-display-name";

export function LobbyPage() {
  const {
    connecting,
    createRoom,
    joinCode,
    joinExistingRoom,
    lobbyError,
    setJoinCode,
  } = useMatchRoom();
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(displayNameStorageKey) ?? "";
  });

  useEffect(() => {
    window.localStorage.setItem(displayNameStorageKey, displayName);
  }, [displayName]);

  async function handleCreateRoom() {
    await createRoom(displayName);
  }

  async function handleJoinRoom() {
    await joinExistingRoom(displayName);
  }

  return (
    <main className="game-shell">
      <section className="lobby-stage" aria-label="Catalyst Clash lobby">
        <Card className="lobby-card" size="sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Catalyst Clash</CardTitle>
            <CardDescription>Create a 1v1 room or join with a code.</CardDescription>
          </CardHeader>
          <CardContent className="lobby-card-content">
            <Input
              aria-label="Display name"
              maxLength={18}
              placeholder="Username"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={handleCreateRoom}
              disabled={connecting}
            >
              <PlayIcon data-icon="inline-start" />
              Create Room
            </Button>
            <div className="join-row">
              <Input
                aria-label="Room code"
                className="room-code-input"
                maxLength={4}
                placeholder="CODE"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleJoinRoom}
                disabled={connecting || joinCode.trim().length === 0}
              >
                Join
              </Button>
            </div>
            {lobbyError ? <p className="lobby-error">{lobbyError}</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
