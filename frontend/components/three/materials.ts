/**
 * Material factories — premium coated physical materials on HIGH/MEDIUM,
 * lighter MeshStandardMaterial on LOW (spec §67: material quality tiers).
 *
 * TUNING: per-material look (roughness/clearcoat/metalness) lives here.
 * Colors arrive from `theme.ts` brand constants or the palette, never inline.
 */

import {
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
} from "three";
import { BRAND } from "./theme";

export type TierMaterial = MeshPhysicalMaterial | MeshStandardMaterial;
export type MaterialTier = "high" | "medium" | "low";

/**
 * Ribbon-diamond material: molded premium plastic with a clearcoat layer.
 * No transmission (the logo objects must stay solid, not glassy).
 */
export function createRibbonMaterial(color: string, tier: MaterialTier): TierMaterial {
  if (tier === "low") {
    const material = new MeshStandardMaterial({
      color,
      roughness: 0.34,
      metalness: 0.28,
      emissive: color,
      emissiveIntensity: 0,
    });
    material.userData.baseEmissive = 0;
    return material;
  }
  const material = new MeshPhysicalMaterial({
    color,
    roughness: 0.3,
    metalness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.24,
    emissive: color,
    emissiveIntensity: 0,
    // Gentle sheen-free surface: highlights come from the environment + key.
  });
  material.userData.baseEmissive = 0;
  return material;
}

/**
 * Growth-green micro accent (leaf). Emissive stays tiny — green never glows
 * across the scene, it only marks the leaf and the hotspot.
 */
export function createLeafMaterial(tier: MaterialTier): TierMaterial {
  if (tier === "low") {
    const material = new MeshStandardMaterial({
      color: BRAND.green,
      roughness: 0.5,
      metalness: 0.05,
      emissive: BRAND.green,
      emissiveIntensity: 0,
    });
    material.userData.baseEmissive = 0;
    return material;
  }
  const material = new MeshPhysicalMaterial({
    color: BRAND.green,
    roughness: 0.44,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.4,
    emissive: BRAND.green,
    emissiveIntensity: 0.08, // permanent micro-glow — green stays a micro accent
  });
  material.userData.baseEmissive = 0.08;
  return material;
}

/** Supporting tech objects — simpler/cheaper than the ribbon by design. */
export function createSupportMaterial(color: string, tier: MaterialTier): TierMaterial {
  if (tier === "low") {
    const material = new MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.22,
      emissive: color,
      emissiveIntensity: 0,
    });
    material.userData.baseEmissive = 0;
    return material;
  }
  const material = new MeshPhysicalMaterial({
    color,
    roughness: 0.36,
    metalness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.3,
    emissive: color,
    emissiveIntensity: 0,
  });
  material.userData.baseEmissive = 0;
  return material;
}

/** Soft translucent accent (data nodes, haze planes) — used sparingly. */
export function createSoftMaterial(color: string, opacity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

export const isPhysical = (material: Material): material is MeshPhysicalMaterial =>
  material instanceof MeshPhysicalMaterial;
