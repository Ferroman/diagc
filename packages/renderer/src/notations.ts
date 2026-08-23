import type { DiagramNode, NotationId, Polarity, Size } from '@diagramming/core';
import type { KindStyle, TypeStyle } from './registry';

/** A visual language: default look plus registry/chrome overrides for a plane's notation. */
export interface NotationProfile {
  id: NotationId | 'default';
  className?: string;
  typeStyles?: Record<string, TypeStyle>;
  kindStyles?: Record<string, KindStyle>;
  edgeCurvature?: number;
  node?: { typelessAsText?: boolean; leafSize?: (n: DiagramNode) => Size | undefined };
  edge?: {
    marks?: boolean;
    bowed?: boolean;
    /** stroke colour per polarity, applied to the line *and* its +/− glyph when
     * nothing more specific (relation override, layer tint) claims the colour */
    polarityColors?: Record<Polarity, string>;
  };
  overlay?: 'loop-labels';
}

const CLD: NotationProfile = {
  id: 'causal-loop',
  className: 'dg-notation-cld',
  edgeCurvature: 0.55,
  node: { typelessAsText: true, leafSize: (n) => (n.type === undefined ? { width: 140, height: 48 } : undefined) },
  // Signed links carry the colour, not just the glyph: at CLD densities a 13px
  // +/− is unreadable while a two-colour link mesh reads at a glance. Theme
  // tokens rather than literals so light/dark and future presets stay in charge.
  edge: {
    marks: true,
    bowed: true,
    polarityColors: { '+': 'var(--dg-polarity-positive)', '-': 'var(--dg-polarity-negative)' },
  },
  overlay: 'loop-labels',
};

// Filled in by the git-graph layout/rendering work; the entry exists now so the
// Record<NotationId, …> below stays total.
const GIT: NotationProfile = { id: 'git-graph', className: 'dg-notation-git' };

// Record<NotationId, ...> keying means adding a notation id to BUILTIN_NOTATIONS
// forces a compile error here until its profile is added — intended.
export const NOTATION_PROFILES: Record<NotationId, NotationProfile> = { 'causal-loop': CLD, 'git-graph': GIT };

const DEFAULT_PROFILE: NotationProfile = { id: 'default' };

export const notationProfile = (id?: NotationId): NotationProfile =>
  id !== undefined ? (NOTATION_PROFILES[id] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;
