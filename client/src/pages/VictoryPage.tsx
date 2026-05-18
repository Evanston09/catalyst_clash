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

  const players = [
    {
      sessionId: "own",
      displayName: match.ownName,
      score: game.productCount,
      sessionProducts: match.ownSessionProducts,
      sessionWins: match.ownSessionWins,
    },
    ...match.opponents,
  ];
  const topScore = Math.max(...players.map((player) => player.score));
  const matchLeaders = players.filter((player) => player.score === topScore);
  const topWins = Math.max(...players.map((player) => player.sessionWins));
  const winLeaders = players.filter((player) => player.sessionWins === topWins);
  const topProducts = Math.max(
    ...winLeaders.map((player) => player.sessionProducts),
  );
  const sessionLeaders = winLeaders.filter(
    (player) => player.sessionProducts === topProducts,
  );
  const topPlayers =
    match.phase === "roundComplete" ? matchLeaders : sessionLeaders;
  const isDraw = topPlayers.length > 1;
  const headline =
    match.phase === "roundComplete"
      ? isDraw
        ? `Match ${match.sessionMatchNumber} Draw`
        : `${topPlayers[0].displayName} Wins Match ${match.sessionMatchNumber}`
      : isDraw
        ? "Session Draw"
        : `${topPlayers[0].displayName} Wins Session`;
  const summary = players
    .map(
      (player) =>
        `${player.displayName}: ${player.sessionWins} wins, ${player.sessionProducts} products`,
    )
    .join(" | ");
  const actionLabel =
    match.phase === "roundComplete"
      ? `Next Match (${match.sessionMatchNumber + 1}/${match.maxSessionMatches})`
      : "New Session";

  return (
    <main className="min-h-svh bg-background text-foreground">
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
            <Badge variant="secondary">
              {match.phase === "roundComplete"
                ? `Match ${match.sessionMatchNumber} of ${match.maxSessionMatches}`
                : `Final after ${match.maxSessionMatches} matches`}
            </Badge>
            <TrophyIcon aria-hidden="true" className="size-12 text-yellow-500" />
            <CardTitle className="text-5xl font-black leading-none sm:text-6xl">
              {headline}
            </CardTitle>
            <CardDescription>{summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {players.map((player) => {
                const isWinner =
                  match.phase === "roundComplete"
                    ? player.score === topScore
                    : topPlayers.some(
                        (topPlayer) => topPlayer.sessionId === player.sessionId,
                      );

                return (
                  <div
                    key={player.sessionId}
                    className={
                      isWinner
                        ? "grid gap-1 rounded-lg border border-yellow-500/70 bg-yellow-500/15 p-4"
                        : "grid gap-1 rounded-lg border bg-muted/60 p-4"
                    }
                  >
                    <span className="text-xs font-extrabold uppercase text-muted-foreground">
                      {player.displayName}
                    </span>
                    <strong className="text-4xl font-black leading-none">
                      {match.phase === "roundComplete"
                        ? player.score
                        : player.sessionWins}
                    </strong>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {match.phase === "roundComplete"
                        ? `${player.sessionWins} session wins | ${player.sessionProducts} total products`
                        : `${player.sessionProducts} total products`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" size="lg" onClick={restartMatch}>
                <RotateCcwIcon data-icon="inline-start" />
                {actionLabel}
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
