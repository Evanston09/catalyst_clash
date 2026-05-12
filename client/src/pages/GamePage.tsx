import { useMemo, useRef } from "react";
import { Navigate } from "react-router";
import { LockIcon, RotateCcwIcon, SwordsIcon } from "lucide-react";

import {
  buildMoleculePositions,
  ReactionStage,
  useCanvasTheme,
  useElementSize,
} from "@/components/game/ReactionStage";
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
} from "@/lib/gameRules";

export function GamePage() {
  const {
    advanceAllostericHold,
    clearCompetitiveBlocker,
    game,
    leaveRoom,
    match,
    room,
    sendAttack,
    startRequested,
    tryBindCofactor,
    tryBindSubstrate,
  } = useMatchRoom();
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

  if (!room) {
    return <Navigate to="/lobby" replace />;
  }

  if (match.phase === "waiting" && !startRequested) {
    return <Navigate to="/waiting" replace />;
  }

  if (match.phase === "ended") {
    return <Navigate to="/victory" replace />;
  }

  return (
    <main className="game-shell">
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
            {match.phase === "waiting" || match.phase === "countdown" ? (
              <Badge variant="secondary">Starting</Badge>
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
                onClick={() => sendAttack("noncompetitive")}
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
                onClick={() => sendAttack("competitive")}
              >
                <SwordsIcon data-icon="inline-start" />
                Competitive
                <Badge variant="secondary">5</Badge>
              </Button>
            </CardContent>
          </Card>
          <div className="utility-actions">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Leave to lobby"
              onClick={leaveRoom}
            >
              <RotateCcwIcon />
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
