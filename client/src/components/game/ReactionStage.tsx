import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
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

import {
  getAllostericInhibitorImageSrc,
  useCanvasImage,
} from "@/lib/gameAssets";
import {
  brownianJitterRadius,
  brownianWanderRadius,
  clamp,
  defaultCanvasSize,
  randomInRange,
  scoreForRound,
} from "@/lib/gameRules";
import type {
  ActiveSiteBounds,
  CanvasSize,
  CanvasTheme,
  CofactorSiteBounds,
  CompetitiveBlockerPosition,
  GameState,
  Molecule,
  MoleculePosition,
} from "@/lib/gameTypes";

export function ReactionStage({
  activeSiteBlocked,
  allostericHoldProgress,
  allostericInhibited,
  competitiveBlockers,
  draggable,
  game,
  moleculePositions,
  onAdvanceAllostericHold,
  onClearCompetitiveBlocker,
  onTryBindCofactor,
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
  onTryBindCofactor: (inCofactorSite: boolean) => void;
  onTryBind: (substrateId: string, inActiveSite: boolean) => void;
  size: CanvasSize;
  theme: CanvasTheme;
}) {
  const [targetedSubstrateId, setTargetedSubstrateId] = useState<string | null>(
    null,
  );
  const [cofactorTargeted, setCofactorTargeted] = useState(false);
  const targetedSubstrateIdRef = useRef<string | null>(null);
  const cofactorTargetedRef = useRef(false);
  const activeSite = getActiveSiteBounds(size, game.round);
  const allostericSite = getAllostericSite(activeSite);
  const cofactorSite = getCofactorSite(activeSite);
  const cofactorPosition = getCofactorSpawnPosition(size);

  function updateTargetedSubstrateId(substrateId: string | null) {
    if (targetedSubstrateIdRef.current === substrateId) {
      return;
    }

    targetedSubstrateIdRef.current = substrateId;
    setTargetedSubstrateId(substrateId);
  }

  function updateCofactorTargeted(targeted: boolean) {
    if (cofactorTargetedRef.current === targeted) {
      return;
    }

    cofactorTargetedRef.current = targeted;
    setCofactorTargeted(targeted);
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

  function handleCofactorDragEnd(event: Konva.KonvaEventObject<DragEvent>) {
    const position = event.target.position();
    const inCofactorSite = isPointInCofactorSite(position, cofactorSite);

    updateCofactorTargeted(false);

    if (inCofactorSite && !activeSiteBlocked) {
      new Konva.Tween({
        node: event.target,
        duration: 0.18,
        easing: Konva.Easings.EaseOut,
        x: cofactorSite.x,
        y: cofactorSite.y,
        rotation: cofactorSite.rotation,
        scaleX: 1,
        scaleY: 1,
        onFinish: () => onTryBindCofactor(true),
      }).play();

      return;
    }

    onTryBindCofactor(inCofactorSite);
  }

  function handleCofactorDragMove(event: Konva.KonvaEventObject<DragEvent>) {
    updateCofactorTargeted(
      isPointInCofactorSite(event.target.position(), cofactorSite),
    );
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
        <EnzymeImage
          key={`${game.enzymePair.kind}-${game.enzymePair.setId}`}
          activeSite={activeSite}
          pair={game.enzymePair}
        />
      </Layer>
      <Layer>
        <ActiveSiteTargetOverlay
          activeSite={activeSite}
          theme={theme}
          visible={targetedSubstrateId !== null}
        />
        <CofactorSiteTargetOverlay
          site={cofactorSite}
          theme={theme}
          visible={
            game.cofactor.required && (!game.cofactor.bound || cofactorTargeted)
          }
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
        {game.cofactor.required ? (
          <CofactorPiece
            bound={game.cofactor.bound}
            draggable={draggable && !game.cofactor.bound}
            failed={game.cofactor.failed}
            imageSrc={game.cofactor.imageSrc}
            size={size}
            site={cofactorSite}
            spawn={cofactorPosition}
            theme={theme}
            onDragEnd={handleCofactorDragEnd}
            onDragMove={handleCofactorDragMove}
          />
        ) : null}
        <ActiveSiteBlockedOverlay
          activeSite={activeSite}
          theme={theme}
          visible={activeSiteBlocked}
        />
        {competitiveBlockers.map((blocker) => (
          <CompetitiveBlockerNode
            key={blocker.id}
            blocker={blocker}
            imageSize={activeSite.imageSize}
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
}: {
  activeSite: ActiveSiteBounds;
  pair: GameState["enzymePair"];
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
      ) : null}
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

function CofactorSiteTargetOverlay({
  site,
  theme,
  visible,
}: {
  site: CofactorSiteBounds;
  theme: CanvasTheme;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Group
      x={site.x}
      y={site.y}
      listening={false}
      opacity={0.9}
      rotation={site.rotation}
    >
      <Line
        closed
        fill={theme.isDark ? "rgba(52,211,153,0.12)" : "rgba(16,185,129,0.1)"}
        points={buildHexagonPoints(site.radius * 1.45)}
        stroke={theme.primary}
        strokeWidth={3}
      />
      <Line
        closed
        dash={[8, 7]}
        points={buildHexagonPoints(site.radius * 2.05)}
        stroke={theme.primary}
        strokeWidth={2}
      />
    </Group>
  );
}

function CofactorPiece({
  bound,
  draggable,
  failed,
  imageSrc,
  onDragEnd,
  onDragMove,
  site,
  size,
  spawn,
  theme,
}: {
  bound: boolean;
  draggable: boolean;
  failed: boolean;
  imageSrc: string;
  onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void;
  site: CofactorSiteBounds;
  size: CanvasSize;
  spawn: { x: number; y: number };
  theme: CanvasTheme;
}) {
  const image = useCanvasImage(imageSrc);
  const imageSize = bound ? site.imageSize : Math.max(site.imageSize * 2, 68);
  const x = bound ? site.x : spawn.x;
  const y = bound ? site.y : spawn.y;

  return (
    <Group
      x={x}
      y={y}
      rotation={bound ? site.rotation : 0}
      draggable={draggable}
      dragBoundFunc={(position) => ({
        x: clamp(position.x, imageSize / 2, size.width - imageSize / 2),
        y: clamp(position.y, imageSize / 2, size.height - imageSize / 2),
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
      opacity={draggable || bound ? 1 : 0.58}
      scaleX={failed ? 1.14 : 1}
      scaleY={failed ? 1.14 : 1}
    >
      <Circle radius={Math.max(imageSize * 0.72, 44)} fill="rgba(255,255,255,0.01)" />
      {image ? (
        <KonvaImage
          image={image}
          x={-(imageSize / 2)}
          y={-(imageSize / 2)}
          width={imageSize}
          height={imageSize}
          shadowColor={failed ? theme.destructive : theme.primary}
          shadowBlur={failed ? 18 : 12}
          shadowOpacity={failed ? 0.4 : 0.22}
          shadowOffsetY={bound ? 0 : 6}
        />
      ) : null}
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
  imageSize,
  onClear,
  theme,
}: {
  blocker: CompetitiveBlockerPosition;
  imageSize: number;
  onClear: () => void;
  theme: CanvasTheme;
}) {
  const image = useCanvasImage(blocker.imageSrc ?? getAllostericInhibitorImageSrc());

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
      {image ? (
        <KonvaImage
          image={image}
          x={-(imageSize / 2)}
          y={-(imageSize / 2)}
          width={imageSize}
          height={imageSize}
          opacity={0.95}
          shadowColor={theme.destructive}
          shadowBlur={26}
          shadowOpacity={0.55}
          shadowOffsetY={0}
        />
      ) : null}
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
  const image = useCanvasImage(getAllostericInhibitorImageSrc());

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
        radius={31}
        fill={theme.isDark ? "rgba(248,113,113,0.18)" : "rgba(220,38,38,0.1)"}
        strokeEnabled={false}
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
      {image ? (
        <KonvaImage
          image={image}
          x={-19}
          y={-19}
          width={38}
          height={38}
          shadowColor={theme.destructive}
          shadowBlur={holding ? 18 : 10}
          shadowOpacity={holding ? 0.35 : 0.18}
        />
      ) : null}
      <Circle
        radius={19}
        fill={theme.destructive}
        opacity={0.2}
        listening={false}
      />
      <Text
        x={-36}
        y={31}
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
  const resolvedCanvasSize = canvasSize ?? defaultCanvasSize;
  const groupRef = useRef<Konva.Group | null>(null);
  const isDraggingRef = useRef(false);
  const dragReleaseTimeoutRef = useRef<number | null>(null);
  const brownianSeed = useMemo(
    () => scoreForRound(molecule.id, Number(molecule.setId) || 1),
    [molecule.id, molecule.setId],
  );

  useEffect(() => {
    const node = groupRef.current;
    const layer = node?.getLayer();

    if (!node || !layer || !draggable) {
      node?.position({ x, y });
      return;
    }

    const phase = brownianSeed * 0.071;
    const wanderSpeedX = 0.95 + (brownianSeed % 7) * 0.08;
    const wanderSpeedY = 0.72 + (brownianSeed % 11) * 0.07;
    const jitterSpeed = 4.6 + (brownianSeed % 5) * 0.28;

    const animation = new Konva.Animation((frame) => {
      if (!frame || isDraggingRef.current) {
        return;
      }

      const time = frame.time / 1000;
      const offsetX =
        Math.sin(time * wanderSpeedX + phase) * brownianWanderRadius +
        Math.sin(time * jitterSpeed + phase * 0.47) * brownianJitterRadius;
      const offsetY =
        Math.cos(time * wanderSpeedY + phase * 1.31) * brownianWanderRadius +
        Math.sin(time * (jitterSpeed + 1.3) + phase) * brownianJitterRadius;

      node.position({
        x: clamp(
          offsetX + x,
          imageSize / 2,
          resolvedCanvasSize.width - imageSize / 2,
        ),
        y: clamp(
          offsetY + y,
          imageSize / 2,
          resolvedCanvasSize.height - imageSize / 2,
        ),
      });
    }, layer);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    brownianSeed,
    draggable,
    imageSize,
    resolvedCanvasSize.height,
    resolvedCanvasSize.width,
    x,
    y,
  ]);

  useEffect(() => {
    return () => {
      if (dragReleaseTimeoutRef.current !== null) {
        window.clearTimeout(dragReleaseTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      rotation={rotation}
      draggable={draggable}
      dragBoundFunc={(position) => ({
        x: clamp(
          position.x,
          imageSize / 2,
          resolvedCanvasSize.width - imageSize / 2,
        ),
        y: clamp(
          position.y,
          imageSize / 2,
          resolvedCanvasSize.height - imageSize / 2,
        ),
      })}
      onDragEnd={(event) => {
        onDragEnd?.(event);

        if (dragReleaseTimeoutRef.current !== null) {
          window.clearTimeout(dragReleaseTimeoutRef.current);
        }

        dragReleaseTimeoutRef.current = window.setTimeout(() => {
          isDraggingRef.current = false;
        }, 280);
      }}
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
        isDraggingRef.current = true;

        if (dragReleaseTimeoutRef.current !== null) {
          window.clearTimeout(dragReleaseTimeoutRef.current);
          dragReleaseTimeoutRef.current = null;
        }

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
      ) : null}
    </Group>
  );
}

export function useElementSize(
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

export function useCanvasTheme() {
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

function getAllostericSite(activeSite: ActiveSiteBounds) {
  const radians = (activeSite.rotation * Math.PI) / 180;
  const localX = (0.11 - 0.5) * activeSite.imageSize;
  const localY = (0.5 - 0.5) * activeSite.imageSize;

  return {
    x: activeSite.x + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: activeSite.y + localX * Math.sin(radians) + localY * Math.cos(radians),
  };
}

function getCofactorSite(activeSite: ActiveSiteBounds): CofactorSiteBounds {
  const radians = (activeSite.rotation * Math.PI) / 180;
  const localX = (0.29 - 0.5) * activeSite.imageSize;
  const localY = (0.28 - 0.5) * activeSite.imageSize;

  return {
    x: activeSite.x + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: activeSite.y + localX * Math.sin(radians) + localY * Math.cos(radians),
    radius: activeSite.imageSize * 0.066,
    imageSize: activeSite.imageSize * 0.133,
    rotation: activeSite.rotation,
  };
}

function getCofactorSpawnPosition(size: CanvasSize) {
  return {
    x: clamp(size.width * 0.12, 72, size.width - 72),
    y: clamp(size.height * 0.26, 118, size.height - 94),
  };
}

function isPointInCofactorSite(
  point: { x: number; y: number },
  site: CofactorSiteBounds,
) {
  const dx = point.x - site.x;
  const dy = point.y - site.y;
  const snapRadius = Math.max(site.radius * 2.1, 30);

  return dx * dx + dy * dy <= snapRadius * snapRadius;
}

function buildHexagonPoints(radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 6;

    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  }).flat();
}

export function buildMoleculePositions(
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
