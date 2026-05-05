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
  Layer,
  Line,
  Rect,
  Ring,
  Stage,
  Star,
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
  color: string;
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

const substrateCatalog = [
  { label: "Lactose", color: "#39a0ed" },
  { label: "Sucrose", color: "#f59f00" },
  { label: "Maltose", color: "#2fb344" },
  { label: "Cellulose", color: "#e64980" },
  { label: "Starch", color: "#845ef7" },
  { label: "Peptide", color: "#15aabf" },
];

const defaultCanvasSize: CanvasSize = {
  width: 960,
  height: 560,
};

const matchDurationMs = 60_000;
const timerTickMs = 250;
const competitiveBlockerCount = 10;
const allostericHoldTargetMs = 2_000;

function buildRound(round: number): Pick<
  GameState,
  "correctSubstrateId" | "failedSubstrateId" | "molecules"
> {
  const correctIndex = (round - 1) % substrateCatalog.length;
  const selectedIndexes = [
    correctIndex,
    (correctIndex + 2) % substrateCatalog.length,
    (correctIndex + 3) % substrateCatalog.length,
    (correctIndex + 5) % substrateCatalog.length,
  ];

  const molecules = selectedIndexes.map((catalogIndex, slot) => {
    const substrate = substrateCatalog[catalogIndex];
    const id = `round-${round}-substrate-${catalogIndex}`;

    return {
      id,
      label: substrate.label,
      role: slot === 0 ? "correct" : "decoy",
      color: substrate.color,
    } satisfies Molecule;
  });

  return {
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
        "Noncompetitive demo armed: bind the correct substrate to reveal the allosteric blocker.",
      inhibition: {
        ...current.inhibition,
        allostericActive: false,
        allostericPrimed: true,
        allostericHoldMs: current.inhibition.allostericActive
          ? current.inhibition.allostericHoldMs
          : 0,
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
  const activeSite = getActiveSiteBounds(size);
  const allostericSite = getAllostericSite(size);

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
        scaleX: 0.82,
        scaleY: 0.82,
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
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: size.width, y: size.height }}
          fillLinearGradientColorStops={[
            "0",
            theme.background,
            "1",
            theme.muted,
          ]}
        />
        <CanvasEffects round={game.round} size={size} theme={theme} />
        <EnzymeShape activeSite={activeSite} size={size} theme={theme} />
      </Layer>
      <Layer>
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
              molecule={molecule}
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

function EnzymeShape({
  activeSite,
  size,
  theme,
}: {
  activeSite: ActiveSiteBounds;
  size: CanvasSize;
  theme: CanvasTheme;
}) {
  const enzymeX = size.width * 0.52;
  const enzymeY = size.height * 0.52;
  const radiusX = clamp(size.width * 0.2, 145, 230);
  const radiusY = clamp(size.height * 0.24, 110, 165);

  return (
    <Group>
      <Ellipse
        x={enzymeX}
        y={enzymeY}
        radiusX={radiusX}
        radiusY={radiusY}
        fillLinearGradientStartPoint={{ x: enzymeX - radiusX, y: enzymeY - radiusY }}
        fillLinearGradientEndPoint={{ x: enzymeX + radiusX, y: enzymeY + radiusY }}
        fillLinearGradientColorStops={[
          "0",
          theme.isDark ? "#89d9b5" : "#85d5ae",
          "0.62",
          theme.primary,
          "1",
          theme.isDark ? "#17483f" : "#1f625a",
        ]}
        shadowColor={theme.foreground}
        shadowBlur={34}
        shadowOpacity={theme.isDark ? 0.34 : 0.18}
        shadowOffsetY={18}
      />
      <Circle
        x={enzymeX - radiusX * 0.34}
        y={enzymeY - radiusY * 0.32}
        radius={radiusY * 0.13}
        fill={theme.primaryForeground}
        opacity={0.85}
      />
      <Circle
        x={enzymeX + radiusX * 0.32}
        y={enzymeY + radiusY * 0.28}
        radius={radiusY * 0.17}
        fill={theme.primary}
        opacity={0.34}
      />
      <Text
        x={enzymeX - 48}
        y={enzymeY - 10}
        width={96}
        align="center"
        text="Enzyme"
        fill={theme.primaryForeground}
        fontFamily="Figtree Variable, sans-serif"
        fontSize={18}
        fontStyle="800"
      />
      <Ellipse
        x={activeSite.x}
        y={activeSite.y}
        radiusX={activeSite.radiusX}
        radiusY={activeSite.radiusY}
        fill={theme.isDark ? "rgba(4,18,22,0.48)" : "rgba(14,58,67,0.28)"}
        stroke={theme.primaryForeground}
        strokeWidth={3}
      />
      <Text
        x={activeSite.x - activeSite.radiusX}
        y={activeSite.y - 7}
        width={activeSite.radiusX * 2}
        align="center"
        text="Active Site"
        fill={theme.primaryForeground}
        fontFamily="Figtree Variable, sans-serif"
        fontSize={12}
        fontStyle="800"
      />
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
        radius={42}
        fill={theme.isDark ? "rgba(248,113,113,0.28)" : "rgba(220,38,38,0.16)"}
        stroke={theme.destructive}
        strokeWidth={3}
        shadowColor={theme.destructive}
        shadowBlur={holding ? 24 : 12}
        shadowOpacity={holding ? 0.34 : 0.18}
      />
      <Arc
        angle={360 * clampedProgress}
        innerRadius={45}
        outerRadius={51}
        fill={theme.destructive}
        rotation={-90}
      />
      <Rect
        x={-13}
        y={-1}
        width={26}
        height={20}
        cornerRadius={6}
        fill={theme.destructive}
      />
      <Ring
        x={0}
        y={-12}
        innerRadius={10}
        outerRadius={14}
        fill={theme.destructive}
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

function CanvasEffects({
  round,
  size,
  theme,
}: {
  round: number;
  size: CanvasSize;
  theme: CanvasTheme;
}) {
  const particles = useMemo(() => {
    return Array.from({ length: 14 }, (_, index) => ({
      id: `particle-${index}`,
      x: randomInRange(`particle-${index}-x`, round, 36, size.width - 36),
      y: randomInRange(`particle-${index}-y`, round, 36, size.height - 36),
      radius: randomInRange(`particle-${index}-r`, round, 4, 10),
      rotation: randomInRange(`particle-${index}-rot`, round, 0, 180),
      star: index % 5 === 0,
    }));
  }, [round, size]);

  return (
    <Group listening={false}>
      <Line
        points={[
          size.width * 0.18,
          size.height * 0.22,
          size.width * 0.35,
          size.height * 0.18,
          size.width * 0.56,
          size.height * 0.26,
        ]}
        stroke={theme.border}
        strokeWidth={2}
        dash={[6, 10]}
        opacity={0.7}
        tension={0.35}
      />
      <Line
        points={[
          size.width * 0.2,
          size.height * 0.76,
          size.width * 0.42,
          size.height * 0.82,
          size.width * 0.74,
          size.height * 0.72,
        ]}
        stroke={theme.border}
        strokeWidth={2}
        dash={[6, 10]}
        opacity={0.7}
        tension={0.35}
      />
      {particles.map((particle) =>
        particle.star ? (
          <Star
            key={particle.id}
            x={particle.x}
            y={particle.y}
            numPoints={5}
            innerRadius={particle.radius * 0.45}
            outerRadius={particle.radius}
            fill={theme.primary}
            opacity={theme.isDark ? 0.28 : 0.38}
            rotation={particle.rotation}
          />
        ) : (
          <Ring
            key={particle.id}
            x={particle.x}
            y={particle.y}
            innerRadius={particle.radius * 0.55}
            outerRadius={particle.radius}
            fill={theme.primary}
            opacity={theme.isDark ? 0.2 : 0.3}
          />
        ),
      )}
    </Group>
  );
}

function CanvasMolecule({
  canvasSize,
  compact = false,
  draggable,
  failed,
  molecule,
  onDragEnd,
  onDragMove,
  theme,
  x,
  y,
}: {
  canvasSize?: CanvasSize;
  compact?: boolean;
  draggable: boolean;
  failed: boolean;
  molecule: Molecule;
  onDragEnd?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  theme: CanvasTheme;
  x: number;
  y: number;
}) {
  const spriteSize = compact ? 48 : 58;
  const labelWidth = 96;

  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      dragBoundFunc={(position) => ({
        x: clamp(position.x, 54, (canvasSize?.width ?? defaultCanvasSize.width) - 54),
        y: clamp(position.y, 54, (canvasSize?.height ?? defaultCanvasSize.height) - 54),
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
      opacity={draggable || compact ? 1 : 0.58}
      scaleX={failed ? 1.08 : 1}
      scaleY={failed ? 1.08 : 1}
    >
      <Circle
        x={-spriteSize * 0.16}
        y={-spriteSize * 0.12}
        radius={spriteSize * 0.28}
        fill={molecule.color}
        stroke={theme.card}
        strokeWidth={3}
        shadowColor={failed ? theme.foreground : undefined}
        shadowBlur={failed ? 18 : 0}
        shadowOpacity={failed ? 0.28 : 0}
      />
      <Circle
        x={spriteSize * 0.2}
        y={-spriteSize * 0.02}
        radius={spriteSize * 0.31}
        fill={molecule.color}
        stroke={theme.card}
        strokeWidth={3}
        shadowColor={failed ? theme.foreground : undefined}
        shadowBlur={failed ? 18 : 0}
        shadowOpacity={failed ? 0.28 : 0}
      />
      <Circle
        x={0}
        y={spriteSize * 0.24}
        radius={spriteSize * 0.25}
        fill={molecule.color}
        stroke={theme.card}
        strokeWidth={3}
        shadowColor={failed ? theme.foreground : undefined}
        shadowBlur={failed ? 18 : 0}
        shadowOpacity={failed ? 0.28 : 0}
      />
      {compact ? null : (
        <Text
          x={-(labelWidth / 2)}
          y={spriteSize * 0.58}
          width={labelWidth}
          align="center"
          text={molecule.label}
          fill={failed ? theme.destructive : theme.foreground}
          fontFamily="Figtree Variable, sans-serif"
          fontSize={14}
          fontStyle="800"
        />
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

function getAllostericSite(size: CanvasSize) {
  const enzymeX = size.width * 0.52;
  const enzymeY = size.height * 0.52;
  const radiusX = clamp(size.width * 0.2, 145, 230);
  const radiusY = clamp(size.height * 0.24, 110, 165);

  return {
    x: enzymeX - radiusX * 0.64,
    y: enzymeY + radiusY * 0.5,
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
  const margin = 72;
  const centerX = size.width * 0.52;
  const centerY = size.height * 0.52;
  const zones = [
    { minX: margin, maxX: centerX - 170, minY: margin, maxY: centerY - 100 },
    { minX: centerX + 170, maxX: size.width - margin, minY: margin, maxY: centerY - 95 },
    { minX: margin, maxX: centerX - 180, minY: centerY + 115, maxY: size.height - margin },
    { minX: centerX + 165, maxX: size.width - margin, minY: centerY + 120, maxY: size.height - margin },
  ];

  return molecules.map((molecule, index) => {
    const zone = zones[index % zones.length];
    const x = randomInRange(`${molecule.id}-x`, round, zone.minX, zone.maxX);
    const y = randomInRange(`${molecule.id}-y`, round, zone.minY, zone.maxY);

    return {
      id: molecule.id,
      x: clamp(x, margin, size.width - margin),
      y: clamp(y, margin, size.height - margin),
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

function getActiveSiteBounds(size: CanvasSize): ActiveSiteBounds {
  const enzymeX = size.width * 0.52;
  const enzymeY = size.height * 0.52;
  const radiusX = clamp(size.width * 0.2, 145, 230);
  const radiusY = clamp(size.height * 0.24, 110, 165);

  return {
    x: enzymeX + radiusX * 0.42,
    y: enzymeY - radiusY * 0.06,
    radiusX: clamp(size.width * 0.065, 44, 64),
    radiusY: clamp(size.height * 0.075, 34, 48),
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
