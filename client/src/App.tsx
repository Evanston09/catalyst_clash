import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import {
  BeakerIcon,
  CircleDotDashedIcon,
  FlaskConicalIcon,
} from "lucide-react";
import {
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

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import "./App.css";

type GamePhase = "selecting" | "complex";

type Molecule = {
  id: string;
  label: string;
  role: "correct" | "decoy";
  color: string;
};

type GameState = {
  phase: GamePhase;
  productCount: number;
  round: number;
  correctSubstrateId: string;
  boundSubstrateId: string | null;
  failedSubstrateId: string | null;
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

function buildRound(round: number): Pick<
  GameState,
  "correctSubstrateId" | "boundSubstrateId" | "failedSubstrateId" | "molecules"
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
    boundSubstrateId: null,
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
    phase: "selecting",
    productCount: 0,
    round: 1,
    ...buildRound(1),
  };
}

function App() {
  const [game, setGame] = useState<GameState>(createInitialState);
  const playfieldRef = useRef<HTMLDivElement>(null);
  const canvasSize = useElementSize(playfieldRef, defaultCanvasSize);
  const theme = useCanvasTheme();

  const boundSubstrate = useMemo(
    () =>
      game.molecules.find((molecule) => molecule.id === game.boundSubstrateId) ??
      null,
    [game.boundSubstrateId, game.molecules],
  );

  const roundProgress = useMemo(() => {
    const cycleRound = ((game.round - 1) % substrateCatalog.length) + 1;

    return (cycleRound / substrateCatalog.length) * 100;
  }, [game.round]);

  const moleculePositions = useMemo(
    () => buildMoleculePositions(game.molecules, game.round, canvasSize),
    [canvasSize, game.molecules, game.round],
  );

  useEffect(() => {
    if (!game.failedSubstrateId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => ({ ...current, failedSubstrateId: null }));
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [game.failedSubstrateId]);

  function tryBindSubstrate(substrateId: string, inActiveSite: boolean) {
    setGame((current) => {
      if (
        current.phase !== "selecting" ||
        !inActiveSite ||
        substrateId !== current.correctSubstrateId
      ) {
        return { ...current, failedSubstrateId: substrateId };
      }

      return {
        ...current,
        phase: "complex",
        boundSubstrateId: substrateId,
        failedSubstrateId: null,
      };
    });
  }

  function catalyzeComplex() {
    setGame((current) => {
      if (current.phase !== "complex") {
        return current;
      }

      const nextRound = current.round + 1;

      return {
        ...current,
        phase: "selecting",
        productCount: current.productCount + 1,
        round: nextRound,
        ...buildRound(nextRound),
      };
    });
  }

  return (
    <main className="game-shell">
      <section className="game-stage" aria-label="Enzyme reaction game">
        <div ref={playfieldRef} className="reaction-canvas">
          <ReactionStage
            boundSubstrate={boundSubstrate}
            game={game}
            moleculePositions={moleculePositions}
            size={canvasSize}
            theme={theme}
            onTryBind={tryBindSubstrate}
          />
        </div>

        <div className="game-hud">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-3">
              <Badge variant="secondary" className="w-fit">
                Catalyst Clash
              </Badge>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-normal text-foreground md:text-4xl">
                  Find the right substrate in the field.
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Drag scattered molecules into the active site. Decoys are
                  mixed into the same canvas as the enzyme.
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-w-52 flex-col gap-3">
            <div className="flex flex-wrap justify-start gap-2 md:justify-end">
              <StatusBadge label="Products" value={game.productCount} />
              <StatusBadge label="Round" value={game.round} />
            </div>
            <div className="flex flex-col gap-2">
              <Badge variant={game.phase === "complex" ? "default" : "outline"}>
                {game.phase === "complex"
                  ? "Complex formed"
                  : "Selecting substrate"}
              </Badge>
              <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                <span>Catalog cycle</span>
                <span>
                  {((game.round - 1) % substrateCatalog.length) + 1}/
                  {substrateCatalog.length}
                </span>
              </div>
              <Progress value={roundProgress} aria-label="Round cycle" />
            </div>
          </div>
        </div>

        <div className="game-action-bar">
          <Alert className="min-w-0 flex-1" aria-live="polite">
            {game.phase === "complex" ? (
              <FlaskConicalIcon />
            ) : (
              <CircleDotDashedIcon />
            )}
            <AlertTitle>
              {game.phase === "complex"
                ? "Ready to catalyze"
                : "Active site is open"}
            </AlertTitle>
            <AlertDescription>
              {game.phase === "complex"
                ? `${boundSubstrate?.label ?? "Substrate"} is bound to the enzyme.`
                : "Search the canvas and drop one substrate into the active site."}
            </AlertDescription>
          </Alert>
          <Button
            className="shrink-0"
            type="button"
            size="lg"
            disabled={game.phase !== "complex"}
            onClick={catalyzeComplex}
          >
            <BeakerIcon data-icon="inline-start" />
            Catalyze
          </Button>
        </div>
      </section>
    </main>
  );
}

function ReactionStage({
  boundSubstrate,
  game,
  moleculePositions,
  onTryBind,
  size,
  theme,
}: {
  boundSubstrate: Molecule | null;
  game: GameState;
  moleculePositions: MoleculePosition[];
  onTryBind: (substrateId: string, inActiveSite: boolean) => void;
  size: CanvasSize;
  theme: CanvasTheme;
}) {
  const [targetedSubstrateId, setTargetedSubstrateId] = useState<string | null>(
    null,
  );
  const targetedSubstrateIdRef = useRef<string | null>(null);
  const activeSite = getActiveSiteBounds(size);

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

    if (inActiveSite && molecule.id === game.correctSubstrateId) {
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
        <Rect
          x={28}
          y={28}
          width={size.width - 56}
          height={size.height - 56}
          cornerRadius={16}
          stroke={theme.border}
          dash={[8, 8]}
          opacity={0.62}
        />
        <CanvasEffects round={game.round} size={size} theme={theme} />
        <EnzymeShape
          activeSite={activeSite}
          size={size}
          theme={theme}
        />
      </Layer>
      <Layer>
        <ActiveSiteTargetOverlay
          activeSite={activeSite}
          theme={theme}
          visible={targetedSubstrateId !== null}
        />
        {boundSubstrate ? (
          <CanvasMolecule
            compact
            draggable={false}
            failed={false}
            molecule={boundSubstrate}
            theme={theme}
            x={activeSite.x}
            y={activeSite.y}
          />
        ) : null}
        {game.molecules.map((molecule) => {
          if (molecule.id === game.boundSubstrateId) {
            return null;
          }

          const position = moleculePositions.find(
            (moleculePosition) => moleculePosition.id === molecule.id,
          );

          if (!position) {
            return null;
          }

          return (
            <CanvasMolecule
              key={molecule.id}
              draggable={game.phase === "selecting"}
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

function StatusBadge({ label, value }: { label: string; value: number }) {
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
        height: Math.max(420, Math.round(element?.clientHeight ?? fallback.height)),
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
