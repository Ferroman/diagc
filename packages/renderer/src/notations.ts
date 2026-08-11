import type { DiagramNode, NotationId, Size } from '@diagramming/core';
import type { KindStyle, TypeStyle } from './registry';

/** A visual language: default look plus registry/chrome overrides for a plane's notation. */
export interface NotationProfile {
  id: NotationId | 'default';
  className?: string;
  typeStyles?: Record<string, TypeStyle>;
  kindStyles?: Record<string, KindStyle>;
  edgeCurvature?: number;
  node?: { typelessAsText?: boolean; leafSize?: (n: DiagramNode) => Size | undefined };
  edge?: { marks?: boolean; bowed?: boolean };
  overlay?: 'loop-labels';
}

const CLD: NotationProfile = {
  id: 'causal-loop',
  className: 'dg-notation-cld',
  edgeCurvature: 0.55,
  node: { typelessAsText: true, leafSize: (n) => (n.type === undefined ? { width: 140, height: 48 } : undefined) },
  edge: { marks: true, bowed: true },
  overlay: 'loop-labels',
};

// Record<NotationId, ...> keying means adding a notation id to BUILTIN_NOTATIONS
// forces a compile error here until its profile is added — intended.
export const NOTATION_PROFILES: Record<NotationId, NotationProfile> = { 'causal-loop': CLD };

const DEFAULT_PROFILE: NotationProfile = { id: 'default' };

export const notationProfile = (id?: NotationId): NotationProfile =>
  id !== undefined ? (NOTATION_PROFILES[id] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;
