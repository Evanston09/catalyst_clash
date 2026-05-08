import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import {
  EraserIcon,
  LockIcon,
  PlayIcon,
  RotateCcwIcon,
  SwordsIcon,
} from "lucide-react";
import {
  Arc,
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Ring,
  Stage,
  Text,
} from "react-konva";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import "./App.css";

type Molecule = {
  id: string;
  label: string;
  role: "correct" | "decoy";
  setId: string;
  imageSrc: string;
};

type EnzymePair = {
  setId: string;
  label: string;
  enzymeSrc: string;
  substrateSrc: string;
};

type GameStatus = "idle" | "running" | "ended";

type BlockingReason = "competitive" | "allosteric";

type CompetitiveBlocker = {
  id: string;
  xRatio: number;
  yRatio: number;
};

type InhibitionState = {
  competitiveBlockers: CompetitiveBlocker[];
  allostericActive: boolean;
  allostericPrimed: boolean;
  allostericHoldMs: number;
};

type GameState = {
  status: GameStatus;
  timeRemainingMs: number;
  productCount: number;
  round: number;
  enzymePair: EnzymePair;
  correctSubstrateId: string;
  failedSubstrateId: string | null;
  statusMessage: string;
  inhibition: InhibitionState;
  molecules: Molecule[];
};

type CanvasSize = {
  width: number;
  height: number;
};

type MoleculePosition = {
  id: string;
  x: number;
  y: number;
  rotation: number;
};

type CompetitiveBlockerPosition = CompetitiveBlocker & {
  x: number;
  y: number;
};

type ActiveSiteBounds = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  imageSize: number;
  rotation: number;
};

type CanvasTheme = {
  background: string;
  border: string;
  card: string;
  destructive: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  isDark: boolean;
};

const enzymePairs = loadEnzymePairs();

const defaultCanvasSize: CanvasSize = {
  width: 960,
  height: 560,
};

const matchDurationMs = 60_000;
const timerTickMs = 250;
const competitiveBlockerCount = 10;
const allostericHoldTargetMs = 2_000;

function loadEnzymePairs() {
  const enzymeSources = import.meta.glob<string>(
    "./assets/enzymes/set_*/enzyme.png",
    {
      eager: true,
      import: "default",
      query: "?url",
    },
  );
  const substrateSources = import.meta.glob<string>(
    "./assets/enzymes/set_*/substrate.png",
    {
      eager: true,
      import: "default",
      query: "?url",
    },
  );

  const pairs = Object.entries(enzymeSources)
    .map(([enzymePath, enzymeSrc]) => {
      const setId = enzymePath.match(/set_(\d+)\/enzyme\.png$/)?.[1];

      if (!setId) {
        return null;
      }

      const substrateSrc = substrateSources[
        `./assets/enzymes/set_${setId}/substrate.png`
      ];

      if (!substrateSrc) {
        return null;
      }

      return {
        setId,
        label: `Set ${setId}`,
        enzymeSrc,
        substrateSrc,
      } satisfies EnzymePair;
    })
    .filter((pair): pair is EnzymePair => pair !== null)
    .sort((a, b) => Number(a.setId) - Number(b.setId));

  if (pairs.length === 0) {
    throw new Error("No enzyme pairs found in src/assets/enzymes.");
  }

  return pairs;
}

function buildRound(round: number): Pick<
  GameState,
  "correctSubstrateId" | "enzymePair" | "failedSubstrateId" | "molecules"
> {
  const correctIndex = (round - 1) % enzymePairs.length;
  const selectedIndexes = [
    correctIndex,
    (correctIndex + 17) % enzymePairs.length,
    (correctIndex + 43) % enzymePairs.length,
    (correctIndex + 71) % enzymePairs.length,
  ];

  const molecules = selectedIndexes.map((catalogIndex, slot) => {
    const pair = enzymePairs[catalogIndex];
    const id = `round-${round}-substrate-${pair.setId}`;

    return {
      id,
      label: pair.label,
      role: slot === 0 ? "correct" : "decoy",
      setId: pair.setId,
      imageSrc: pair.substrateSrc,
    } satisfies Molecule;
  });

  return {
    enzymePair: enzymePairs[correctIndex],
    correctSubstrateId: molecules[0].id,
    failedSubstrateId: null,
    molecules: shuffleByRound(molecules, round),
  };
}

function shuffleByRound(molecules: Molecule[], round: number) {
  return [...molecules].sort((a, b) => {
    const aScore = scoreForRound(a.id, round);
    const bScore = scoreForRound(b.id, round);

    return aScore - bScore;
  });
}

function scoreForRound(value: string, round: number) {
  return [...value].reduce(
    (score, character) => score + character.charCodeAt(0) * round,
    0,
  );
}

function createInitialState(): GameState {
  return {
    status: "idle",
    timeRemainingMs: matchDurationMs,
    productCount: 0,
    round: 1,
    statusMessage: "Press Start, then drag the correct substrate into the active site.",
    inhibition: createEmptyInhibitionState(),
    ...buildRound(1),
  };
}

function createEmptyInhibitionState(): InhibitionState {
  return {
    competitiveBlockers: [],
    allostericActive: false,
    allostericPrimed: false,
    allostericHoldMs: 0,
  };
}

function App() {
  const [game, setGame] = useState<GameState>(createInitialState);
  const playfieldRef = useRef<HTMLDivElement>(null);
  const canvasSize = useElementSize(playfieldRef, defaultCanvasSize);
  const theme = useCanvasTheme();

  const timerProgress = (game.timeRemainingMs / matchDurationMs) * 100;
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

  useEffect(() => {
    if (game.status !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "running") {
          return current;
        }

        const timeRemainingMs = Math.max(
          0,
          current.timeRemainingMs - timerTickMs,
        );

        if (timeRemainingMs > 0) {
          return { ...current, timeRemainingMs };
        }

        return {
          ...current,
          status: "ended",
          timeRemainingMs,
          statusMessage: `Time. Final score: ${current.productCount} products.`,
        };
      });
    }, timerTickMs);

    return () => window.clearInterval(intervalId);
  }, [game.status]);

  useEffect(() => {
    if (!game.failedSubstrateId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => ({ ...current, failedSubstrateId: null }));
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [game.failedSubstrateId]);

  function startGame() {
    setGame({
      ...createInitialState(),
      status: "running",
      statusMessage: "Go. Make as many products as possible in 60 seconds.",
    });
  }

  function resetGame() {
    setGame(createInitialState());
  }

  function tryBindSubstrate(substrateId: string, inActiveSite: boolean) {
    setGame((current) => {
      if (current.status !== "running") {
        return {
          ...current,
          failedSubstrateId: substrateId,
          statusMessage: "Press Start before binding substrates.",
        };
      }

      const currentBlockingReason = getBlockingReason(current.inhibition);

      if (currentBlockingReason === "competitive") {
        return {
          ...current,
          failedSubstrateId: substrateId,
          statusMessage: "Competitive blockers are occupying the field.",
        };
      }

      if (!inActiveSite || substrateId !== current.correctSubstrateId) {
        return {
          ...current,
          failedSubstrateId: substrateId,
          statusMessage: !inActiveSite
            ? "Drop a substrate into the active site."
            : "That substrate does not fit this enzyme.",
        };
      }

      if (
        current.inhibition.allostericPrimed ||
        current.inhibition.allostericActive
      ) {
        return {
          ...current,
          statusMessage:
            "Substrate binds, but an allosteric blocker prevents product formation.",
          inhibition: {
            ...current.inhibition,
            allostericActive: true,
            allostericPrimed: false,
          },
        };
      }

      const nextRound = current.round + 1;

      return {
        ...current,
        productCount: current.productCount + 1,
        round: nextRound,
        statusMessage: "Product formed. New substrate set loaded.",
        ...buildRound(nextRound),
      };
    });
  }

  function triggerCompetitive() {
    setGame((current) => ({
      ...current,
      statusMessage: "Competitive inhibition: click all 10 blockers to clear.",
      inhibition: {
        ...current.inhibition,
        competitiveBlockers: buildCompetitiveBlockers(current.round),
      },
    }));
  }

  function triggerAllosteric() {
    setGame((current) => ({
      ...current,
      statusMessage:
        "Noncompetitive inhibition: hold the allosteric blocker to clear.",
      inhibition: {
        ...current.inhibition,
        allostericActive: true,
        allostericPrimed: false,
        allostericHoldMs: 0,
      },
    }));
  }

  function clearBlockers() {
    setGame((current) => ({
      ...current,
      statusMessage: "All blockers cleared.",
      inhibition: createEmptyInhibitionState(),
    }));
  }

  function clearCompetitiveBlocker(blockerId: string) {
    setGame((current) => {
      const competitiveBlockers =
        current.inhibition.competitiveBlockers.filter(
          (blocker) => blocker.id !== blockerId,
        );

      return {
        ...current,
        statusMessage:
          competitiveBlockers.length === 0
            ? "Competitive blockers cleared."
            : `${competitiveBlockers.length} competitive blockers left.`,
        inhibition: {
          ...current.inhibition,
          competitiveBlockers,
        },
      };
    });
  }

  function advanceAllostericHold(deltaMs: number) {
    setGame((current) => {
      if (!current.inhibition.allostericActive) {
        return current;
      }

      const allostericHoldMs = Math.min(
        allostericHoldTargetMs,
        current.inhibition.allostericHoldMs + deltaMs,
      );
      const allostericActive = allostericHoldMs < allostericHoldTargetMs;

      return {
        ...current,
        statusMessage: allostericActive
          ? "Holding allosteric lock."
          : "Allosteric inhibition cleared.",
        inhibition: {
          ...current.inhibition,
          allostericActive,
          allostericPrimed: false,
          allostericHoldMs,
        },
      };
    });
  }

  return (
    <main className="game-shell">
      <section className="game-stage" aria-label="Enzyme reaction game">
        <div className="game-hud">
          <div className="hud-primary">
            <div className="hud-title">
              <h1>Inhibition debug run</h1>
              <p>{game.statusMessage}</p>
            </div>
            <div className="hud-stats">
              <StatusBadge label="Time" value={formatTime(game.timeRemainingMs)} />
              <StatusBadge label="Products" value={game.productCount} />
              {blockingReason ? (
                <Badge variant="secondary" className="h-auto px-3 py-1.5">
                  {blockingReason === "competitive"
                    ? `${game.inhibition.competitiveBlockers.length} competitors`
                    : "Allosteric blocker"}
                </Badge>
              ) : game.inhibition.allostericPrimed ? (
                <Badge variant="outline" className="h-auto px-3 py-1.5">
                  Noncompetitive armed
                </Badge>
              ) : null}
            </div>
          </div>
          <Progress value={timerProgress} aria-label="Match timer" />
          <div className="debug-toolbar" aria-label="Debug controls">
            <Button
              type="button"
              size="sm"
              onClick={game.status === "running" ? resetGame : startGame}
            >
              {game.status === "running" ? (
                <RotateCcwIcon data-icon="inline-start" />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              {game.status === "running" ? "Reset" : "Start"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={game.status !== "running"}
              onClick={triggerCompetitive}
            >
              <SwordsIcon data-icon="inline-start" />
              Competitive
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={game.status !== "running"}
              onClick={triggerAllosteric}
            >
              <LockIcon data-icon="inline-start" />
              Noncompetitive
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!blockingReason && !game.inhibition.allostericPrimed}
              onClick={clearBlockers}
            >
              <EraserIcon data-icon="inline-start" />
              Clear blockers
            </Button>
          </div>
        </div>

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
            onTryBind={tryBindSubstrate}
          />
        </div>
      </section>
    </main>
  );
}

function ReactionStage({
  activeSiteBlocked,
  allostericHoldProgress,
  allostericInhibited,
  competitiveBlockers,
  draggable,
  game,
  moleculePositions,
  onAdvanceAllostericHold,
  onClearCompetitiveBlocker,
  onTryBind,
  size,
  theme,
}: {
  activeSiteBlocked: boolean;
  allostericHoldProgress: number;
  allostericInhibited: boolean;
  competitiveBlockers: CompetitiveBlockerPosition[];
  draggable: boolean;
  game: GameState;
  moleculePositions: MoleculePosition[];
  onAdvanceAllostericHold: (deltaMs: number) => void;
  onClearCompetitiveBlocker: (blockerId: string) => void;
  onTryBind: (substrateId: string, inActiveSite: boolean) => void;
  size: CanvasSize;
  theme: CanvasTheme;
}) {
  const [targetedSubstrateId, setTargetedSubstrateId] = useState<string | null>(
    null,
  );
  const targetedSubstrateIdRef = useRef<string | null>(null);
  const activeSite = getActiveSiteBounds(size, game.round);
  const allostericSite = getAllostericSite(activeSite);

  function updateTargetedSubstrateId(substrateId: string | null) {
    if (targetedSubstrateIdRef.current === substrateId) {
      return;
    }

    targetedSubstrateIdRef.current = substrateId;
    setTargetedSubstrateId(substrateId);
  }

  function handleDragEnd(
    molecule: Molecule,
    event: Konva.KonvaEventObject<DragEvent>,
  ) {
    const position = event.target.position();
    const inActiveSite = isPointInActiveSite(position, activeSite);

    updateTargetedSubstrateId(null);

    if (
      inActiveSite &&
      molecule.id === game.correctSubstrateId &&
      !activeSiteBlocked
    ) {
      new Konva.Tween({
        node: event.target,
        duration: 0.18,
        easing: Konva.Easings.EaseOut,
        x: activeSite.x,
        y: activeSite.y,
        rotation: activeSite.rotation,
        scaleX: 1,
        scaleY: 1,
        onFinish: () => onTryBind(molecule.id, true),
      }).play();

      return;
    }

    onTryBind(molecule.id, inActiveSite);
  }

  function handleDragMove(
    molecule: Molecule,
    event: Konva.KonvaEventObject<DragEvent>,
  ) {
    const position = event.target.position();
    const isTargeted = isPointInActiveSite(position, activeSite);

    updateTargetedSubstrateId(isTargeted ? molecule.id : null);
  }

  return (
    <Stage width={size.width} height={size.height}>
      <Layer listening={false}>
        <Rect
          x={0}
          y={0}
          width={size.width}
          height={size.height}
          cornerRadius={0}
          fill={theme.background}
        />
        <EnzymeImage activeSite={activeSite} pair={game.enzymePair} theme={theme} />
      </Layer>
      <Layer>
        <CanvasScoreCounter
          productCount={game.productCount}
          status={game.status}
          theme={theme}
        />
        <ActiveSiteTargetOverlay
          activeSite={activeSite}
          theme={theme}
          visible={targetedSubstrateId !== null}
        />
        {game.molecules.map((molecule) => {
          const position = moleculePositions.find(
            (moleculePosition) => moleculePosition.id === molecule.id,
          );

          if (!position) {
            return null;
          }

          return (
            <CanvasMolecule
              key={molecule.id}
              draggable={draggable}
              failed={game.failedSubstrateId === molecule.id}
              imageSize={activeSite.imageSize}
              molecule={molecule}
              rotation={position.rotation}
              theme={theme}
              x={position.x}
              y={position.y}
              canvasSize={size}
              onDragEnd={(event) => handleDragEnd(molecule, event)}
              onDragMove={(event) => handleDragMove(molecule, event)}
            />
          );
        })}
        <ActiveSiteBlockedOverlay
          activeSite={activeSite}
          theme={theme}
          visible={activeSiteBlocked}
        />
        {competitiveBlockers.map((blocker) => (
          <CompetitiveBlockerNode
            key={blocker.id}
            blocker={blocker}
            theme={theme}
            onClear={() => onClearCompetitiveBlocker(blocker.id)}
          />
        ))}
        {allostericInhibited ? (
          <AllostericLock
            onAdvanceHold={onAdvanceAllostericHold}
            progress={allostericHoldProgress}
            site={allostericSite}
            theme={theme}
          />
        ) : null}
      </Layer>
    </Stage>
  );
}

function EnzymeImage({
  activeSite,
  pair,
  theme,
}: {
  activeSite: ActiveSiteBounds;
  pair: EnzymePair;
  theme: CanvasTheme;
}) {
  const image = useCanvasImage(pair.enzymeSrc);

  return (
    <Group
      x={activeSite.x}
      y={activeSite.y}
      listening={false}
      rotation={activeSite.rotation}
    >
      {image ? (
        <KonvaImage
          image={image}
          x={-(activeSite.imageSize / 2)}
          y={-(activeSite.imageSize / 2)}
          width={activeSite.imageSize}
          height={activeSite.imageSize}
        />
      ) : (
        <Circle
          radius={activeSite.imageSize / 2}
          fill={theme.primary}
          opacity={0.28}
        />
      )}
    </Group>
  );
}

function ActiveSiteTargetOverlay({
  activeSite,
  theme,
  visible,
}: {
  activeSite: ActiveSiteBounds;
  theme: CanvasTheme;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Group listening={false}>
      <Ellipse
        x={activeSite.x}
        y={activeSite.y}
        radiusX={activeSite.radiusX}
        radiusY={activeSite.radiusY}
        fill={theme.isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.3)"}
      />
      <Ring
        x={activeSite.x}
        y={activeSite.y}
        innerRadius={Math.max(activeSite.radiusX, activeSite.radiusY) + 8}
        outerRadius={Math.max(activeSite.radiusX, activeSite.radiusY) + 16}
        fill={theme.isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.22)"}
      />
    </Group>
  );
}

function ActiveSiteBlockedOverlay({
  activeSite,
  theme,
  visible,
}: {
  activeSite: ActiveSiteBounds;
  theme: CanvasTheme;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  const xRadius = activeSite.radiusX + 12;
  const yRadius = activeSite.radiusY + 10;

  return (
    <Group listening={false}>
      <Ellipse
        x={activeSite.x}
        y={activeSite.y}
        radiusX={xRadius}
        radiusY={yRadius}
        fill={
          theme.isDark ? "rgba(248,113,113,0.2)" : "rgba(220,38,38,0.14)"
        }
        stroke={theme.destructive}
        strokeWidth={3}
      />
      <Line
        points={[
          activeSite.x - xRadius * 0.62,
          activeSite.y - yRadius * 0.62,
          activeSite.x + xRadius * 0.62,
          activeSite.y + yRadius * 0.62,
        ]}
        stroke={theme.destructive}
        strokeWidth={7}
        lineCap="round"
      />
      <Line
        points={[
          activeSite.x + xRadius * 0.62,
          activeSite.y - yRadius * 0.62,
          activeSite.x - xRadius * 0.62,
          activeSite.y + yRadius * 0.62,
        ]}
        stroke={theme.destructive}
        strokeWidth={7}
        lineCap="round"
      />
    </Group>
  );
}

function CompetitiveBlockerNode({
  blocker,
  onClear,
  theme,
}: {
  blocker: CompetitiveBlockerPosition;
  onClear: () => void;
  theme: CanvasTheme;
}) {
  return (
    <Group
      x={blocker.x}
      y={blocker.y}
      onClick={onClear}
      onTap={onClear}
      onMouseEnter={(event) => {
        const stage = event.target.getStage();

        if (stage) {
          stage.container().style.cursor = "pointer";
        }
      }}
      onMouseLeave={(event) => {
        const stage = event.target.getStage();

        if (stage) {
          stage.container().style.cursor = "default";
        }
      }}
    >
      <Circle
        radius={24}
        fill={theme.isDark ? "#f59f00" : "#ffb703"}
        stroke={theme.foreground}
        strokeWidth={2}
        opacity={0.92}
      />
      <Line
        points={[-12, -12, 12, 12]}
        stroke={theme.destructive}
        strokeWidth={5}
        lineCap="round"
      />
      <Line
        points={[12, -12, -12, 12]}
        stroke={theme.destructive}
        strokeWidth={5}
        lineCap="round"
      />
      <Text
        x={-42}
        y={30}
        width={84}
        align="center"
        text="compete"
        fill={theme.foreground}
        fontFamily="Figtree Variable, sans-serif"
        fontSize={12}
        fontStyle="800"
      />
    </Group>
  );
}

function AllostericLock({
  onAdvanceHold,
  progress,
  site,
  theme,
}: {
  onAdvanceHold: (deltaMs: number) => void;
  progress: number;
  site: { x: number; y: number };
  theme: CanvasTheme;
}) {
  const [holding, setHolding] = useState(false);
  const clampedProgress = clamp(progress, 0, 1);

  useEffect(() => {
    if (!holding) {
      return;
    }

    const intervalId = window.setInterval(() => {
      onAdvanceHold(50);
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [holding, onAdvanceHold]);

  return (
    <Group
      x={site.x}
      y={site.y}
      onMouseDown={() => setHolding(true)}
      onMouseUp={() => setHolding(false)}
      onTouchEnd={() => setHolding(false)}
      onTouchStart={() => setHolding(true)}
      onMouseEnter={(event) => {
        const stage = event.target.getStage();

        if (stage) {
          stage.container().style.cursor = "pointer";
        }
      }}
      onMouseLeave={(event) => {
        setHolding(false);

        const stage = event.target.getStage();

        if (stage) {
          stage.container().style.cursor = "default";
        }
      }}
    >
      <Circle
        radius={38}
        fill={theme.isDark ? "rgba(248,113,113,0.28)" : "rgba(220,38,38,0.16)"}
        stroke={theme.destructive}
        strokeWidth={3}
        shadowColor={theme.destructive}
        shadowBlur={holding ? 24 : 12}
        shadowOpacity={holding ? 0.34 : 0.18}
      />
      <Arc
        angle={360 * clampedProgress}
        innerRadius={41}
        outerRadius={47}
        fill={theme.destructive}
        rotation={-90}
      />
      <Line
        points={[-15, -15, 15, 15]}
        stroke={theme.destructive}
        strokeWidth={7}
        lineCap="round"
      />
      <Line
        points={[15, -15, -15, 15]}
        stroke={theme.destructive}
        strokeWidth={7}
        lineCap="round"
      />
      <Text
        x={-36}
        y={28}
        width={72}
        align="center"
        text="hold"
        fill={theme.foreground}
        fontFamily="Figtree Variable, sans-serif"
        fontSize={13}
        fontStyle="800"
      />
    </Group>
  );
}

function CanvasScoreCounter({
  productCount,
  status,
  theme,
}: {
  productCount: number;
  status: GameStatus;
  theme: CanvasTheme;
}) {
  const label = status === "ended" ? "FINAL SCORE" : "SCORE";

  return (
    <Group listening={false}>
      <Text
        x={24}
        y={22}
        text={label}
        fill={theme.mutedForeground}
        fontFamily="Figtree Variable, sans-serif"
        fontSize={18}
        fontStyle="800"
      />
      <Text
        x={24}
        y={44}
        text={productCount.toString()}
        fill={theme.foreground}
        fontFamily="Figtree Variable, sans-serif"
        fontSize={58}
        fontStyle="900"
      />
    </Group>
  );
}

function CanvasMolecule({
  canvasSize,
  draggable,
  failed,
  imageSize,
  molecule,
  onDragEnd,
  onDragMove,
  rotation,
  theme,
  x,
  y,
}: {
  canvasSize?: CanvasSize;
  draggable: boolean;
  failed: boolean;
  imageSize: number;
  molecule: Molecule;
  onDragEnd?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  rotation: number;
  theme: CanvasTheme;
  x: number;
  y: number;
}) {
  const image = useCanvasImage(molecule.imageSrc);

  return (
    <Group
      x={x}
      y={y}
      rotation={rotation}
      draggable={draggable}
      dragBoundFunc={(position) => ({
        x: clamp(
          position.x,
          imageSize / 2,
          (canvasSize?.width ?? defaultCanvasSize.width) - imageSize / 2,
        ),
        y: clamp(
          position.y,
          imageSize / 2,
          (canvasSize?.height ?? defaultCanvasSize.height) - imageSize / 2,
        ),
      })}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
      onMouseEnter={(event) => {
        const stage = event.target.getStage();

        if (stage && draggable) {
          stage.container().style.cursor = "grab";
        }
      }}
      onMouseLeave={(event) => {
        const stage = event.target.getStage();

        if (stage) {
          stage.container().style.cursor = "default";
        }
      }}
      onDragStart={(event) => {
        const stage = event.target.getStage();

        if (stage) {
          stage.container().style.cursor = "grabbing";
        }
      }}
      opacity={draggable ? 1 : 0.58}
      scaleX={failed ? 1.08 : 1}
      scaleY={failed ? 1.08 : 1}
    >
      {image ? (
        <KonvaImage
          image={image}
          x={-(imageSize / 2)}
          y={-(imageSize / 2)}
          width={imageSize}
          height={imageSize}
          shadowColor={failed ? theme.destructive : theme.foreground}
          shadowBlur={failed ? 20 : 12}
          shadowOpacity={failed ? 0.34 : 0.12}
          shadowOffsetY={failed ? 0 : 8}
        />
      ) : (
        <Circle radius={imageSize / 2} fill={theme.primary} opacity={0.26} />
      )}
    </Group>
  );
}

function StatusBadge({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <Badge variant="outline" className="h-auto gap-2 px-3 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </Badge>
  );
}

function useCanvasImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const nextImage = new window.Image();
    let active = true;

    nextImage.onload = () => {
      if (active) {
        setImage(nextImage);
      }
    };
    nextImage.src = src;

    return () => {
      active = false;
    };
  }, [src]);

  return image;
}

function useElementSize(
  ref: React.RefObject<HTMLElement | null>,
  fallback: CanvasSize,
) {
  const [size, setSize] = useState<CanvasSize>(fallback);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    function updateSize() {
      setSize({
        width: Math.max(320, Math.round(element?.clientWidth ?? fallback.width)),
        height: Math.max(260, Math.round(element?.clientHeight ?? fallback.height)),
      });
    }

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [fallback, ref]);

  return size;
}

function useCanvasTheme() {
  const [theme, setTheme] = useState<CanvasTheme>(readCanvasTheme);

  useEffect(() => {
    const updateTheme = () => setTheme(readCanvasTheme());
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const rootObserver = new MutationObserver(updateTheme);
    const bodyObserver = new MutationObserver(updateTheme);

    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    mediaQuery.addEventListener("change", updateTheme);
    updateTheme();

    return () => {
      rootObserver.disconnect();
      bodyObserver.disconnect();
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  return theme;
}

function readCanvasTheme(): CanvasTheme {
  const lightTheme: CanvasTheme = {
    background: "#ffffff",
    border: "#e4e4e7",
    card: "#ffffff",
    destructive: "#dc2626",
    foreground: "#18181b",
    muted: "#f4f4f5",
    mutedForeground: "#71717a",
    primary: "#2f806e",
    primaryForeground: "#ecfdf5",
    isDark: false,
  };
  const darkTheme: CanvasTheme = {
    background: "#18181b",
    border: "rgba(255,255,255,0.12)",
    card: "#27272a",
    destructive: "#f87171",
    foreground: "#fafafa",
    muted: "#27272a",
    mutedForeground: "#a1a1aa",
    primary: "#2f806e",
    primaryForeground: "#ecfdf5",
    isDark: true,
  };

  if (typeof window === "undefined") {
    return lightTheme;
  }

  const root = document.documentElement;
  const body = document.body;
  const isDark =
    root.classList.contains("dark") ||
    body.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const fallback = isDark ? darkTheme : lightTheme;
  const styles = getComputedStyle(body);

  return {
    background: canvasColor(styles, "--background", fallback.background),
    border: canvasColor(styles, "--border", fallback.border),
    card: canvasColor(styles, "--card", fallback.card),
    destructive: canvasColor(styles, "--destructive", fallback.destructive),
    foreground: canvasColor(styles, "--foreground", fallback.foreground),
    muted: canvasColor(styles, "--muted", fallback.muted),
    mutedForeground: canvasColor(
      styles,
      "--muted-foreground",
      fallback.mutedForeground,
    ),
    primary: canvasColor(styles, "--primary", fallback.primary),
    primaryForeground: canvasColor(
      styles,
      "--primary-foreground",
      fallback.primaryForeground,
    ),
    isDark,
  };
}

function canvasColor(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: string,
) {
  const value = styles.getPropertyValue(name).trim();

  if (!value || value.startsWith("oklch(")) {
    return fallback;
  }

  return value;
}

function getBlockingReason(inhibition: InhibitionState): BlockingReason | null {
  if (inhibition.competitiveBlockers.length > 0) {
    return "competitive";
  }

  if (inhibition.allostericActive) {
    return "allosteric";
  }

  return null;
}

function buildCompetitiveBlockers(round: number) {
  return Array.from({ length: competitiveBlockerCount }, (_, index) => ({
    id: `round-${round}-competitive-${index}`,
    xRatio: seededFraction(`round-${round}-competitive-${index}-x`, round),
    yRatio: seededFraction(`round-${round}-competitive-${index}-y`, round),
  }));
}

function buildCompetitiveBlockerPositions(
  blockers: CompetitiveBlocker[],
  size: CanvasSize,
): CompetitiveBlockerPosition[] {
  const margin = 62;

  return blockers.map((blocker) => ({
    ...blocker,
    x: margin + (size.width - margin * 2) * blocker.xRatio,
    y: margin + (size.height - margin * 2) * blocker.yRatio,
  }));
}

function getAllostericSite(activeSite: ActiveSiteBounds) {
  const radians = (activeSite.rotation * Math.PI) / 180;
  const localX = (0.11 - 0.5) * activeSite.imageSize;
  const localY = (0.5 - 0.5) * activeSite.imageSize;

  return {
    x: activeSite.x + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: activeSite.y + localX * Math.sin(radians) + localY * Math.cos(radians),
  };
}

function formatTime(timeRemainingMs: number) {
  const totalSeconds = Math.ceil(timeRemainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function buildMoleculePositions(
  molecules: Molecule[],
  round: number,
  size: CanvasSize,
) {
  const margin = 76;
  const centerX = size.width * 0.52;
  const centerY = size.height * 0.52;
  const zones = [
    { minX: margin, maxX: centerX - 190, minY: margin, maxY: centerY - 115 },
    { minX: centerX + 190, maxX: size.width - margin, minY: margin, maxY: centerY - 115 },
    { minX: margin, maxX: centerX - 190, minY: centerY + 130, maxY: size.height - margin },
    { minX: centerX + 190, maxX: size.width - margin, minY: centerY + 130, maxY: size.height - margin },
  ];

  return molecules.map((molecule, index) => {
    const zone = zones[index % zones.length];
    const x = randomInRange(`${molecule.id}-x`, round, zone.minX, zone.maxX);
    const y = randomInRange(`${molecule.id}-y`, round, zone.minY, zone.maxY);
    const rotation = randomInRange(`${molecule.id}-rotation`, round, 0, 360);

    return {
      id: molecule.id,
      x: clamp(x, margin, size.width - margin),
      y: clamp(y, margin, size.height - margin),
      rotation,
    };
  });
}

function randomInRange(seed: string, round: number, min: number, max: number) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const ratio = seededFraction(seed, round);

  return low + (high - low) * ratio;
}

function seededFraction(seed: string, round: number) {
  const score = [...seed].reduce(
    (total, character, index) =>
      total + character.charCodeAt(0) * (index + 17) * round,
    0,
  );
  const value = Math.sin(score) * 10000;

  return value - Math.floor(value);
}

function getActiveSiteBounds(size: CanvasSize, round: number): ActiveSiteBounds {
  const enzymeX = size.width * 0.52;
  const enzymeY = size.height * 0.52;
  const imageSize = clamp(Math.min(size.width * 0.34, size.height * 0.58), 190, 300);
  const snapRadius = clamp(imageSize * 0.34, 72, 108);

  return {
    x: enzymeX,
    y: enzymeY,
    radiusX: snapRadius,
    radiusY: snapRadius,
    imageSize,
    rotation: randomInRange("enzyme-rotation", round, 0, 360),
  };
}

function isPointInActiveSite(
  point: { x: number; y: number },
  activeSite: ActiveSiteBounds,
) {
  const dx = (point.x - activeSite.x) / activeSite.radiusX;
  const dy = (point.y - activeSite.y) / activeSite.radiusY;

  return dx * dx + dy * dy <= 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default App;
