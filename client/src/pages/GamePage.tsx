import { useMemo, useRef, useState } from "react";
import { Navigate } from "react-router";
import { LockIcon, SwordsIcon, ThermometerIcon } from "lucide-react";

import { LandscapePrompt } from "@/components/game/LandscapePrompt";
import { ReactionStage } from "@/components/game/ReactionStage";
import {
  buildMoleculePositions,
  useCanvasTheme,
  useElementSize,
} from "@/components/game/reactionStageUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMatchRoom } from "@/hooks/useMatchRoom";
import {
  allostericHoldTargetMs,
  attackCosts,
  buildCompetitiveBlockerPositions,
  defaultCanvasSize,
  formatTime,
  getBlockingReason,
  optimalConditionsCost,
} from "@/lib/gameRules";

function formatCountdown(countdownRemainingMs: number) {
  const secondsRemaining = Math.ceil(countdownRemainingMs / 1_000);

  return secondsRemaining > 0 ? secondsRemaining.toString() : "Go!";
}

export function GamePage() {
  const {
    advanceAllostericHold,
    activateOptimalConditions,
    clearCompetitiveBlocker,
    game,
    match,
    room,
    sendAttack,
    startRequested,
    tryBindCofactor,
    tryBindSubstrate,
  } = useMatchRoom();
  const [pendingAttackKind, setPendingAttackKind] = useState<
    "competitive" | "noncompetitive" | null
  >(null);
  const playfieldRef = useRef<HTMLDivElement>(null);
  const canvasSize = useElementSize(playfieldRef, defaultCanvasSize);
  const theme = useCanvasTheme();
  const blockingReason = getBlockingReason(game.inhibition);
  const moleculePositions = useMemo(
    () => buildMoleculePositions(game.molecules, game.round, canvasSize),
    [canvasSize, game.molecules, game.round],
  );
  const competitiveBlockerPositions = useMemo(
    () =>
      buildCompetitiveBlockerPositions(
        game.inhibition.competitiveBlockers,
        canvasSize,
      ),
    [canvasSize, game.inhibition.competitiveBlockers],
  );
  const canSendNoncompetitive =
    game.status === "running" && match.attackResource >= attackCosts.noncompetitive;
  const canSendCompetitive =
    game.status === "running" && match.attackResource >= attackCosts.competitive;
  const canActivateOptimalConditions =
    game.status === "running" &&
    match.attackResource >= optimalConditionsCost &&
    match.optimalConditionCharges === 0;
  const showTargetPopup = pendingAttackKind !== null && match.playersConnected > 2;

  function requestAttack(kind: "competitive" | "noncompetitive") {
    if (match.playersConnected > 2) {
      setPendingAttackKind(kind);
      return;
    }

    sendAttack(kind, match.opponents[0]?.sessionId);
  }

  function confirmAttack(targetSessionId: string) {
    if (!pendingAttackKind) {
      return;
    }

    sendAttack(pendingAttackKind, targetSessionId);
    setPendingAttackKind(null);
  }

  if (!room) {
    return <Navigate to="/lobby" replace />;
  }

  if (match.phase === "waiting" && !startRequested) {
    return <Navigate to="/waiting" replace />;
  }

  if (match.phase === "roundComplete" || match.phase === "ended") {
    return <Navigate to="/victory" replace />;
  }

  return (
    <main className="game-shell bg-background text-foreground">
      <section className="match-stage" aria-label="Enzyme reaction game">
        <div ref={playfieldRef} className="reaction-canvas">
          <ReactionStage
            allostericHoldProgress={
              game.inhibition.allostericHoldMs / allostericHoldTargetMs
            }
            allostericInhibited={game.inhibition.allostericActive}
            activeSiteBlocked={blockingReason === "competitive"}
            competitiveBlockers={competitiveBlockerPositions}
            draggable={game.status === "running"}
            game={game}
            moleculePositions={moleculePositions}
            size={canvasSize}
            theme={theme}
            onAdvanceAllostericHold={advanceAllostericHold}
            onClearCompetitiveBlocker={clearCompetitiveBlocker}
            onTryBindCofactor={tryBindCofactor}
            onTryBind={tryBindSubstrate}
          />
        </div>

        <div className="match-hud" aria-hidden="false">
          <Card className="score-pill score-pill-own" size="sm">
            <span>{match.ownName}</span>
            <strong>{game.productCount}</strong>
          </Card>
          <Card className="timer-pill" size="sm">
            <span>{formatTime(game.timeRemainingMs)}</span>
          </Card>
          <Card className="score-pill score-pill-rival" size="sm">
            <span>{match.opponentName}</span>
            <strong>{match.opponentScore}</strong>
          </Card>
          <div className="status-strip">
            <Badge variant="outline">Room {match.roomCode}</Badge>
            {match.phase === "waiting" ? (
              <Badge variant="secondary">Starting</Badge>
            ) : null}
            {match.phase === "countdown" ? (
              <Badge variant="secondary">
                {formatCountdown(match.countdownRemainingMs)}
              </Badge>
            ) : null}
            {blockingReason ? (
              <Badge variant="secondary">
                {blockingReason === "competitive"
                  ? `${game.inhibition.competitiveBlockers.length} blockers`
                  : "Noncompetitive lock"}
              </Badge>
            ) : null}
            {game.cofactor.required ? (
              <Badge variant="outline">
                {game.cofactor.bound ? "Cofactor bound" : "Cofactor needed"}
              </Badge>
            ) : null}
            {match.optimalConditionCharges > 0 ? (
              <Badge variant="secondary">
                Optimal pH + Temp: {match.optimalConditionCharges} left
              </Badge>
            ) : null}
          </div>
          <div className="match-message">{game.statusMessage}</div>
          <Card className="attack-panel" size="sm">
            <CardContent className="attack-panel-content">
              <div className="energy-readout">
                <span>Energy</span>
                <strong>{match.attackResource}</strong>
              </div>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={!canSendNoncompetitive}
                onClick={() => requestAttack("noncompetitive")}
              >
                <LockIcon data-icon="inline-start" />
                Noncompetitive
                <Badge variant="secondary">3</Badge>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={!canSendCompetitive}
                onClick={() => requestAttack("competitive")}
              >
                <SwordsIcon data-icon="inline-start" />
                Competitive
                <Badge variant="secondary">{attackCosts.competitive}</Badge>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={!canActivateOptimalConditions}
                onClick={activateOptimalConditions}
              >
                <ThermometerIcon data-icon="inline-start" />
                Optimal
                <Badge variant="secondary">{optimalConditionsCost}</Badge>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
      <LandscapePrompt />
      {showTargetPopup ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <Card className="w-full max-w-sm" size="sm">
            <CardContent className="grid gap-3 p-5">
              <p className="m-0 text-sm font-semibold">Choose player to inhibit</p>
              {match.opponents.map((opponent) => (
                <Button
                  key={opponent.sessionId}
                  type="button"
                  variant="outline"
                  onClick={() => confirmAttack(opponent.sessionId)}
                >
                  {opponent.displayName} ({opponent.score})
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPendingAttackKind(null)}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
