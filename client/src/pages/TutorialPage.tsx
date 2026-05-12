import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router";
import {
  ArrowRightIcon,
  CheckIcon,
  HouseIcon,
  LockIcon,
  RotateCcwIcon,
  SwordsIcon,
} from "lucide-react";

import {
  buildMoleculePositions,
  ReactionStage,
  useCanvasTheme,
  useElementSize,
} from "@/components/game/ReactionStage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMatchRoom } from "@/hooks/useMatchRoom";
import { buildRound, getCompetitiveInhibitorImageSrc } from "@/lib/gameAssets";
import {
  allostericHoldTargetMs,
  attackCosts,
  buildCompetitiveBlockerPositions,
  createEmptyInhibitionState,
  defaultCanvasSize,
  getBlockingReason,
  matchDurationMs,
} from "@/lib/gameRules";
import type { GameState } from "@/lib/gameTypes";

type TutorialStep = {
  title: string;
  instruction: string;
  detail: string;
};

const tutorialSteps: TutorialStep[] = [
  {
    title: "Make a product",
    instruction: "Drag the matching substrate into the enzyme active site.",
    detail:
      "Enzymes are specific: only a substrate with the right shape can bind at the active site and be converted into product.",
  },
  {
    title: "Bind a cofactor",
    instruction: "Drag the cofactor into the hexagonal cofactor site.",
    detail:
      "Some enzymes need a non-protein helper molecule. The cofactor changes the enzyme into an active form so catalysis can happen.",
  },
  {
    title: "Clear competitive inhibition",
    instruction: "Click or tap each blocker sitting on the field.",
    detail:
      "Competitive inhibitors resemble substrates and compete for the active site, reducing how often the real substrate can bind.",
  },
  {
    title: "Clear noncompetitive inhibition",
    instruction: "Press and hold the lock until the ring fills.",
    detail:
      "Noncompetitive inhibitors bind away from the active site and change enzyme shape, lowering activity even when substrate is present.",
  },
  {
    title: "Spend energy",
    instruction: "Press either attack button to finish the tutorial.",
    detail:
      "Making product represents successful catalysis. In the game, that success becomes energy you can spend to inhibit your rival.",
  },
  {
    title: "Ready for a match",
    instruction: "You know the core loop: score, clear inhibition, and attack.",
    detail:
      "You have practiced enzyme specificity, cofactors, competitive inhibition, and noncompetitive inhibition.",
  },
];

const cofactorTutorialRound = findCofactorTutorialRound();

export function TutorialPage() {
  const { match, room } = useMatchRoom();
  const [stepIndex, setStepIndex] = useState(0);
  const [game, setGame] = useState(createTutorialGame);
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
  const step = tutorialSteps[stepIndex];
  const completed = stepIndex === tutorialSteps.length - 1;

  useEffect(() => {
    if (!game.failedSubstrateId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => ({ ...current, failedSubstrateId: null }));
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [game.failedSubstrateId]);

  useEffect(() => {
    if (!game.cofactor.failed) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => ({
        ...current,
        cofactor: { ...current.cofactor, failed: false },
      }));
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [game.cofactor.failed]);

  if (room && (match.phase === "countdown" || match.phase === "running")) {
    return <Navigate to="/game" replace />;
  }

  if (room && match.phase === "ended") {
    return <Navigate to="/victory" replace />;
  }

  function advanceStep(nextGame?: GameState) {
    setStepIndex((current) => Math.min(current + 1, tutorialSteps.length - 1));
    setGame(nextGame ?? game);
  }

  function resetTutorial() {
    setStepIndex(0);
    setGame(createTutorialGame());
  }

  function tryBindSubstrate(substrateId: string, inActiveSite: boolean) {
    if (!inActiveSite || substrateId !== game.correctSubstrateId) {
      setGame({
        ...game,
        failedSubstrateId: substrateId,
        statusMessage: !inActiveSite
          ? "Drop the substrate into the active site."
          : "That one is a decoy. Find the matching substrate.",
      });
      return;
    }

    if (stepIndex === 0) {
      const nextGame = createCofactorTutorialGame();
      advanceStep(nextGame);
      return;
    }

    setGame({
      ...game,
      statusMessage: "Good fit. Follow the current tutorial prompt.",
    });
  }

  function tryBindCofactor(inCofactorSite: boolean) {
    if (stepIndex !== 1 || !game.cofactor.required || game.cofactor.bound) {
      return;
    }

    if (!inCofactorSite) {
      setGame({
        ...game,
        cofactor: { ...game.cofactor, failed: true },
        statusMessage: "Drop the cofactor into the hexagonal cofactor site.",
      });
      return;
    }

    const nextGame = createCompetitiveTutorialGame(game);
    advanceStep(nextGame);
  }

  function clearCompetitiveBlocker(blockerId: string) {
    if (stepIndex !== 2) {
      return;
    }

    const competitiveBlockers = game.inhibition.competitiveBlockers.filter(
      (blocker) => blocker.id !== blockerId,
    );
    const updatedGame = {
      ...game,
      inhibition: { ...game.inhibition, competitiveBlockers },
      statusMessage:
        competitiveBlockers.length === 0
          ? "Competitive blocker cleared."
          : `${competitiveBlockers.length} blockers left.`,
    };

    if (competitiveBlockers.length > 0) {
      setGame(updatedGame);
      return;
    }

    const nextGame = createAllostericTutorialGame(updatedGame);
    advanceStep(nextGame);
  }

  function advanceAllostericHold(deltaMs: number) {
    if (stepIndex !== 3 || !game.inhibition.allostericActive) {
      return;
    }

    const allostericHoldMs = Math.min(
      allostericHoldTargetMs,
      game.inhibition.allostericHoldMs + deltaMs,
    );

    if (allostericHoldMs < allostericHoldTargetMs) {
      setGame({
        ...game,
        statusMessage: "Keep holding the allosteric lock.",
        inhibition: {
          ...game.inhibition,
          allostericHoldMs,
        },
      });
      return;
    }

    const nextGame = createAttackTutorialGame(game);
    advanceStep(nextGame);
  }

  function completeAttack(kind: "competitive" | "noncompetitive") {
    if (stepIndex !== 4) {
      return;
    }

    const label = kind === "competitive" ? "Competitive" : "Noncompetitive";
    advanceStep({
      ...game,
      statusMessage: `${label} attack sent. You are ready for a real match.`,
    });
  }

  return (
    <main className="game-shell">
      <section className="grid h-svh min-h-svh grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground">
        <header className="flex flex-col gap-3 border-b bg-card/90 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Tutorial {Math.min(stepIndex + 1, tutorialSteps.length)}/
                {tutorialSteps.length}
              </Badge>
            </div>
            <h1 className="text-2xl font-black leading-none">{step.title}</h1>
            <p className="m-0 max-w-3xl text-sm font-semibold text-muted-foreground">
              {step.instruction}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button asChild variant="outline">
              <Link to={room ? "/waiting" : "/lobby"}>
                <HouseIcon data-icon="inline-start" />
                {room ? "Waiting" : "Lobby"}
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={resetTutorial}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div ref={playfieldRef} className="relative min-h-0">
            <ReactionStage
              activeSiteBlocked={blockingReason === "competitive"}
              allostericHoldProgress={
                game.inhibition.allostericHoldMs / allostericHoldTargetMs
              }
              allostericInhibited={game.inhibition.allostericActive}
              competitiveBlockers={competitiveBlockerPositions}
              draggable={!completed}
              game={game}
              moleculePositions={moleculePositions}
              size={canvasSize}
              theme={theme}
              onAdvanceAllostericHold={advanceAllostericHold}
              onClearCompetitiveBlocker={clearCompetitiveBlocker}
              onTryBindCofactor={tryBindCofactor}
              onTryBind={tryBindSubstrate}
            />
            {stepIndex === 4 ? (
              <Card className="attack-panel" size="sm">
                <CardContent className="attack-panel-content">
                  <div className="energy-readout">
                    <span>Energy</span>
                    <strong>5</strong>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={() => completeAttack("noncompetitive")}
                  >
                    <LockIcon data-icon="inline-start" />
                    Noncompetitive
                    <Badge variant="secondary">{attackCosts.noncompetitive}</Badge>
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={() => completeAttack("competitive")}
                  >
                    <SwordsIcon data-icon="inline-start" />
                    Competitive
                    <Badge variant="secondary">{attackCosts.competitive}</Badge>
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <aside className="grid min-h-0 gap-3 overflow-auto border-t bg-card/95 p-3 lg:border-l lg:border-t-0 lg:p-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span className="font-bold">Current Goal</span>
                  {completed ? (
                    <CheckIcon className="size-5 text-primary" aria-hidden="true" />
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="m-0 text-sm font-semibold">{step.instruction}</p>
                <p className="m-0 text-sm text-muted-foreground">{step.detail}</p>
              </CardContent>
            </Card>

            {completed ? (
              <Button asChild size="lg">
                <Link to={room ? "/waiting" : "/lobby"}>
                  {room ? "Return to Waiting Room" : "Return to Lobby"}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}

function createTutorialGame(): GameState {
  return {
    status: "running",
    timeRemainingMs: matchDurationMs,
    productCount: 0,
    round: 1,
    statusMessage: "Drag the matching substrate into the active site.",
    inhibition: createEmptyInhibitionState(),
    ...buildRound(1),
  };
}

function createCofactorTutorialGame(): GameState {
  const roundState = buildRound(cofactorTutorialRound);

  return {
    status: "running",
    timeRemainingMs: matchDurationMs,
    productCount: 1,
    round: cofactorTutorialRound,
    statusMessage: "Bind the cofactor to activate this enzyme.",
    inhibition: createEmptyInhibitionState(),
    ...roundState,
    cofactor: {
      ...roundState.cofactor,
      required: true,
      bound: false,
      failed: false,
    },
  };
}

function createCompetitiveTutorialGame(current: GameState): GameState {
  return {
    ...current,
    cofactor: { ...current.cofactor, bound: true, failed: false },
    statusMessage: "Competitive inhibitors are occupying the active site.",
    inhibition: {
      ...createEmptyInhibitionState(),
      competitiveBlockers: [
        {
          id: "tutorial-blocker-1",
          imageSrc: getCompetitiveInhibitorImageSrc("tutorial-blocker-1", current.round),
          xRatio: 0.42,
          yRatio: 0.45,
        },
        {
          id: "tutorial-blocker-2",
          imageSrc: getCompetitiveInhibitorImageSrc("tutorial-blocker-2", current.round),
          xRatio: 0.52,
          yRatio: 0.52,
        },
        {
          id: "tutorial-blocker-3",
          imageSrc: getCompetitiveInhibitorImageSrc("tutorial-blocker-3", current.round),
          xRatio: 0.62,
          yRatio: 0.44,
        },
      ],
    },
  };
}

function createAllostericTutorialGame(current: GameState): GameState {
  return {
    ...current,
    statusMessage: "Hold the allosteric lock until it clears.",
    inhibition: {
      competitiveBlockers: [],
      allostericActive: true,
      allostericPrimed: false,
      allostericHoldMs: 0,
    },
  };
}

function createAttackTutorialGame(current: GameState): GameState {
  return {
    ...current,
    statusMessage: "You earned energy. Try sending an attack.",
    inhibition: createEmptyInhibitionState(),
  };
}

function findCofactorTutorialRound() {
  for (let round = 2; round <= 80; round += 1) {
    if (buildRound(round).cofactor.required) {
      return round;
    }
  }

  return 2;
}
