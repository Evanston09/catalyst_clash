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
    <main className="min-h-svh bg-background text-foreground">
      <section
        className="flex min-h-svh items-center justify-center p-4"
        aria-label="Catalyst Clash lobby"
      >
        <Card className="w-full max-w-md" size="sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Catalyst Clash</CardTitle>
            <CardDescription>Create a 1v1 room or join with a code.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
              <Input
                aria-label="Room code"
                className="font-extrabold uppercase"
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
            {lobbyError ? (
              <p className="m-0 text-sm text-destructive">{lobbyError}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
