import { useState } from "react";
import { Link, Navigate } from "react-router";
import { BookOpenIcon, LogOutIcon, PlayIcon, UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMatchRoom } from "@/hooks/useMatchRoom";

export function WaitingPage() {
  const { leaveRoom, match, room, startMatch } = useMatchRoom();
  const [starting, setStarting] = useState(false);
  const canStartMatch = match.phase === "waiting" && match.playersConnected === 2;
  const startButtonActive = starting || match.phase === "countdown";

  function handleStartMatch() {
    if (!canStartMatch) {
      return;
    }

    setStarting(true);
    startMatch();
  }

  if (!room) {
    return <Navigate to="/lobby" replace />;
  }

  if (match.phase === "countdown" || match.phase === "running") {
    return <Navigate to="/game" replace />;
  }

  if (match.phase === "ended") {
    return <Navigate to="/victory" replace />;
  }

  return (
    <main className="game-shell">
      <section
        className="flex min-h-svh items-center justify-center p-4"
        aria-label="Match waiting room"
      >
        <Card className="w-full max-w-lg" size="sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline">Room {match.roomCode}</Badge>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Leave room"
                onClick={leaveRoom}
              >
                <LogOutIcon />
              </Button>
            </div>
            <CardTitle className="text-2xl font-bold">Ready Check</CardTitle>
            <CardDescription>
              Share the room code, then start once both players are here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2.5 rounded-lg border bg-muted/60 p-4">
              <UsersIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              <strong className="text-3xl font-black leading-none">
                {match.playersConnected}/2
              </strong>
              <span className="text-xs font-extrabold uppercase text-muted-foreground">
                players joined
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button asChild size="lg" variant="outline">
                <Link to="/tutorial">
                  <BookOpenIcon data-icon="inline-start" />
                  How to Play
                </Link>
              </Button>
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={!canStartMatch || starting}
                onClick={handleStartMatch}
              >
                <PlayIcon data-icon="inline-start" />
                {startButtonActive ? "Starting..." : "Start"}
              </Button>
            </div>
            {startButtonActive ? (
              <p className="m-0 text-center text-sm font-semibold text-muted-foreground">
                Match is starting.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
