import { useEffect, useState } from "react";

import { clamp, randomInRange } from "@/lib/gameRules";
import type { CanvasSize, CanvasTheme, Molecule, MoleculePosition } from "@/lib/gameTypes";

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

    const measuredElement = element;

    function updateSize() {
      setSize({
        width: Math.max(320, Math.round(measuredElement.clientWidth)),
        height: Math.max(260, Math.round(measuredElement.clientHeight)),
      });
    }

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(measuredElement);

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

export function buildMoleculePositions(
  molecules: Molecule[],
  round: number,
  size: CanvasSize,
): MoleculePosition[] {
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
