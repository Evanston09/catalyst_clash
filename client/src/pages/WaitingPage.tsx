import { useState } from "react";
import { Link, Navigate } from "react-router";
import { BookOpenIcon, CopyIcon, LogOutIcon, PlayIcon, UsersIcon } from "lucide-react";

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
  const [copied, setCopied] = useState(false);
  const canStartMatch =
    match.phase === "waiting" &&
    match.playersConnected >= 2 &&
    match.tutorialReadyCount === match.playersConnected;
  const startButtonActive = starting || match.phase === "countdown";

  function handleStartMatch() {
    if (!canStartMatch) {
      return;
    }

    setStarting(true);
    startMatch();
  }

  async function copyRoomCode() {
    if (!match.roomCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(match.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  if (!room) {
    return <Navigate to="/lobby" replace />;
  }

  if (match.phase === "countdown" || match.phase === "running") {
    return <Navigate to="/game" replace />;
  }

  if (match.phase === "roundComplete" || match.phase === "ended") {
    return <Navigate to="/victory" replace />;
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <section
        className="flex min-h-svh items-center justify-center p-4"
        aria-label="Match waiting room"
      >
        <Card className="w-full max-w-lg" size="sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl font-bold">Waiting Room</CardTitle>
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
            <CardDescription>
              Share the room code, finish the tutorial, then start the match.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2.5 rounded-lg border bg-muted/60 p-4">
              <UsersIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              <strong className="text-3xl font-black leading-none">
                {match.playersConnected}
              </strong>
              <span className="text-xs font-extrabold uppercase text-muted-foreground">
                players joined
              </span>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 rounded-lg border bg-muted/60 p-4">
              <BookOpenIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              <div className="grid gap-1">
                <strong className="text-sm font-black uppercase leading-none">
                  Tutorial {match.tutorialReadyCount}/{match.playersConnected} ready
                </strong>
                <span className="text-xs font-semibold text-muted-foreground">
                  Match {match.sessionMatchNumber} of {match.maxSessionMatches}
                </span>
              </div>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Room Code
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <strong className="text-5xl font-black leading-none tracking-[0.15em]">
                  {match.roomCode}
                </strong>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copyRoomCode}
                  aria-label="Copy room code"
                >
                  <CopyIcon data-icon="inline-start" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
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
            {!match.tutorialComplete ? (
              <p className="m-0 text-center text-sm font-semibold text-muted-foreground">
                Complete How to Play before this room can start.
              </p>
            ) : startButtonActive ? (
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
