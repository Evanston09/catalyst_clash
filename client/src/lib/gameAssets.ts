import { useEffect, useState } from "react";

import allostericInhibitorAssetSrc from "@/assets/enzymes/allosteric_inhibitor.png?url";
import cofactorAssetSrc from "@/assets/enzymes/cofactor.png?url";
import type { EnzymePair, GameState, Molecule } from "@/lib/gameTypes";
import { cofactorRoundChance, scoreForRound, seededFraction } from "@/lib/gameRules";

const enzymeCatalog = loadEnzymeCatalog();
const enzymePairs = enzymeCatalog.normalPairs;
const cofactorEnzymePairs = enzymeCatalog.cofactorPairs;
const canvasImageCache = new Map<string, HTMLImageElement>();
const canvasImagesLoading = new Set<string>();

function loadEnzymeCatalog() {
  const normalEnzymeSources = import.meta.glob<string>(
    "@/assets/enzymes/without_cofactors/set_*/enzyme.png",
    {
      eager: true,
      import: "default",
      query: "?url",
    },
  );
  const normalSubstrateSources = import.meta.glob<string>(
    "@/assets/enzymes/without_cofactors/set_*/substrate.png",
    {
      eager: true,
      import: "default",
      query: "?url",
    },
  );
  const cofactorEnzymeSources = import.meta.glob<string>(
    "@/assets/enzymes/with_cofactors/set_*/enzyme.png",
    {
      eager: true,
      import: "default",
      query: "?url",
    },
  );
  const cofactorSubstrateSources = import.meta.glob<string>(
    "@/assets/enzymes/with_cofactors/set_*/substrate.png",
    {
      eager: true,
      import: "default",
      query: "?url",
    },
  );

  const normalPairs = createEnzymePairs(
    normalEnzymeSources,
    normalSubstrateSources,
    "normal",
  );
  const cofactorPairs = createEnzymePairs(
    cofactorEnzymeSources,
    cofactorSubstrateSources,
    "cofactor",
  );

  if (normalPairs.length === 0) {
    throw new Error("No normal enzyme pairs found in src/assets/enzymes.");
  }

  return { cofactorPairs, normalPairs };
}

function createEnzymePairs(
  enzymeSources: Record<string, string>,
  substrateSources: Record<string, string>,
  kind: EnzymePair["kind"],
) {
  return Object.entries(enzymeSources)
    .map(([enzymePath, enzymeSrc]) => {
      const setId = enzymePath.match(/set_(\d+)\/enzyme\.png$/)?.[1];

      if (!setId) {
        return null;
      }

      const substrateSrc =
        substrateSources[enzymePath.replace("/enzyme.png", "/substrate.png")];

      if (!substrateSrc) {
        return null;
      }

      return {
        setId,
        label: `Set ${setId}`,
        enzymeSrc,
        kind,
        substrateSrc,
      } satisfies EnzymePair;
    })
    .filter((pair): pair is EnzymePair => pair !== null)
    .sort((a, b) => Number(a.setId) - Number(b.setId));
}

export function buildRound(round: number): Pick<
  GameState,
  | "cofactor"
  | "correctSubstrateId"
  | "enzymePair"
  | "failedSubstrateId"
  | "molecules"
> {
  const requiresCofactor =
    cofactorEnzymePairs.length > 0 &&
    round > 1 &&
    seededFraction(`round-${round}-cofactor-chance`, round) <
      cofactorRoundChance;
  const roundCatalog = requiresCofactor ? cofactorEnzymePairs : enzymePairs;
  const correctIndex = (round - 1) % roundCatalog.length;
  const selectedIndexes = [
    correctIndex,
    (correctIndex + 17) % roundCatalog.length,
    (correctIndex + 43) % roundCatalog.length,
    (correctIndex + 71) % roundCatalog.length,
  ];

  const molecules = selectedIndexes.map((catalogIndex, slot) => {
    const pair = roundCatalog[catalogIndex];
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
    cofactor: {
      required: requiresCofactor,
      bound: false,
      failed: false,
      id: `round-${round}-cofactor`,
      imageSrc: cofactorAssetSrc,
    },
    enzymePair: roundCatalog[correctIndex],
    correctSubstrateId: molecules[0].id,
    failedSubstrateId: null,
    molecules: shuffleByRound(molecules, round),
  };
}

export function getAllostericInhibitorImageSrc() {
  return allostericInhibitorAssetSrc;
}

export function getCompetitiveInhibitorImageSrc(seed: string, round: number) {
  const catalog = enzymePairs.length > 1 ? enzymePairs : cofactorEnzymePairs;
  const baseIndex = Math.max(
    0,
    catalog.findIndex((pair) => pair.setId === buildRound(round).enzymePair.setId),
  );
  const offset = (scoreForRound(seed, round) % Math.max(1, catalog.length - 1)) + 1;
  const inhibitorPair = catalog[(baseIndex + offset) % catalog.length];

  return inhibitorPair?.substrateSrc ?? catalog[0]?.substrateSrc ?? cofactorAssetSrc;
}

function shuffleByRound(molecules: Molecule[], round: number) {
  return [...molecules].sort((a, b) => {
    const aScore = scoreForRound(a.id, round);
    const bScore = scoreForRound(b.id, round);

    return aScore - bScore;
  });
}

export function useCanvasImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(
    () => canvasImageCache.get(src) ?? null,
  );

  useEffect(() => {
    const cachedImage = canvasImageCache.get(src);
    let active = true;

    if (cachedImage) {
      return;
    }

    const nextImage = new window.Image();
    nextImage.onload = () => {
      canvasImageCache.set(src, nextImage);

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

function preloadCanvasImage(src: string) {
  if (canvasImageCache.has(src) || canvasImagesLoading.has(src)) {
    return;
  }

  const image = new window.Image();

  canvasImagesLoading.add(src);
  image.onload = () => {
    canvasImagesLoading.delete(src);
    canvasImageCache.set(src, image);
  };
  image.onerror = () => {
    canvasImagesLoading.delete(src);
  };
  image.src = src;
}

export function preloadUpcomingRoundImages(round: number) {
  preloadCanvasImage(cofactorAssetSrc);

  Array.from({ length: 6 }, (_, index) => round + index).forEach(
    (roundToPreload) => {
      const roundAssets = buildRound(roundToPreload);

      preloadCanvasImage(roundAssets.enzymePair.enzymeSrc);
      roundAssets.molecules.forEach((molecule) => {
        preloadCanvasImage(molecule.imageSrc);
      });
    },
  );
}
