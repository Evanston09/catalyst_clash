import Confetti from "react-confetti-boom";
import { Navigate } from "react-router";
import { HouseIcon, RotateCcwIcon, TrophyIcon } from "lucide-react";

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

export function VictoryPage() {
  const { game, leaveRoom, match, restartMatch, room } = useMatchRoom();

  if (!room) {
    return <Navigate to="/lobby" replace />;
  }

  if (match.phase === "waiting" || match.phase === "countdown") {
    return <Navigate to="/waiting" replace />;
  }

  if (match.phase === "running") {
    return <Navigate to="/game" replace />;
  }

  const isDraw = match.result === "draw";
  const winnerName =
    match.result === "win"
      ? match.ownName
      : match.result === "loss"
        ? match.opponentName
        : "Draw";
  const headline = isDraw ? "Draw" : `${winnerName} Wins`;
  const summary = isDraw
    ? `Both players finished with ${game.productCount} products.`
    : `${match.ownName}: ${game.productCount} | ${match.opponentName}: ${match.opponentScore}`;

  return (
    <main className="game-shell">
      <section
        className="relative flex min-h-svh items-center justify-center overflow-hidden p-4"
        aria-label="Match result"
      >
        {!isDraw ? (
          <Confetti
            mode="fall"
            particleCount={120}
            shapeSize={10}
            colors={["#16a34a", "#facc15", "#38bdf8", "#f97316", "#f43f5e"]}
          />
        ) : null}
        <Card className="relative z-10 w-full max-w-xl" size="sm">
          <CardHeader className="items-center text-center">
            <Badge variant="outline">Room {match.roomCode}</Badge>
            <TrophyIcon aria-hidden="true" className="size-12 text-yellow-500" />
            <CardTitle className="text-5xl font-black leading-none sm:text-6xl">
              {headline}
            </CardTitle>
            <CardDescription>{summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div
                className={
                  match.result === "win"
                    ? "grid gap-1 rounded-lg border border-yellow-500/70 bg-yellow-500/15 p-4"
                    : "grid gap-1 rounded-lg border bg-muted/60 p-4"
                }
              >
                <span className="text-xs font-extrabold uppercase text-muted-foreground">
                  {match.ownName}
                </span>
                <strong className="text-4xl font-black leading-none">
                  {game.productCount}
                </strong>
              </div>
              <div
                className={
                  match.result === "loss"
                    ? "grid gap-1 rounded-lg border border-yellow-500/70 bg-yellow-500/15 p-4"
                    : "grid gap-1 rounded-lg border bg-muted/60 p-4"
                }
              >
                <span className="text-xs font-extrabold uppercase text-muted-foreground">
                  {match.opponentName}
                </span>
                <strong className="text-4xl font-black leading-none">
                  {match.opponentScore}
                </strong>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" size="lg" onClick={restartMatch}>
                <RotateCcwIcon data-icon="inline-start" />
                Rematch
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={leaveRoom}>
                <HouseIcon data-icon="inline-start" />
                Lobby
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
