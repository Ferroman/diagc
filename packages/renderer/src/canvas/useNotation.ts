import { useCallback, useMemo } from 'react';
import type { DiagramNode } from '@diagc/core/internal';
import { notationProfile, type NotationProfile } from '../notations';
import { createKindRegistry, createTypeRegistry, type KindStyle, type Registry, type TypeStyle } from '../registry';
import type { NodeDataContext } from './build-data';
import type { DiagramViewProps } from './view-types';

export interface Notation {
  profile: NotationProfile;
  /** the notation's types, unless the host passes its own */
  typeRegistry: Registry<TypeStyle>;
  /** the notation's relation kinds, unless the host passes its own */
  kindRegistry: Registry<KindStyle>;
  /** a container that never folds: no drill into it either (see useDrillNavigation) */
  isAlwaysExpanded: (id: string) => boolean;
  /** the notation's colour for a node that sets none (a node's lane's, say) */
  nodeColors: NodeDataContext['nodeColors'];
  /** small chips in a node's badge row (the plan's role chips) */
  nodeChips: NodeDataContext['nodeChips'];
}

/** A container the notation never folds: git lanes are rows, not boxes with an inside. */
export function neverFolds(node: DiagramNode, profile: NotationProfile, typeRegistry: Registry<TypeStyle>): boolean {
  return (
    profile.node?.alwaysExpanded?.(node) === true ||
    (node.type !== undefined && typeRegistry.resolve(node.type).alwaysExpanded === true)
  );
}

/** The notation the canvas draws in, its registries, and what it derives for this model and plane. */
export function useNotation(
  props: Pick<DiagramViewProps, 'notation' | 'typeRegistry' | 'kindRegistry' | 'model' | 'plane'>,
): Notation {
  const profile = useMemo(() => notationProfile(props.notation), [props.notation]);
  const typeRegistry = useMemo(
    () => props.typeRegistry ?? createTypeRegistry(profile.typeStyles),
    [props.typeRegistry, profile],
  );
  const kindRegistry = useMemo(
    () => props.kindRegistry ?? createKindRegistry(profile.kindStyles),
    [props.kindRegistry, profile],
  );
  // The guard enterNode applies before drilling (see useDrillNavigation): an
  // always-expanded container is a row, not a box with an inside.
  const isAlwaysExpanded = useCallback(
    (id: string) => {
      const node = props.model.nodes.find((n) => n.id === id);
      return node !== undefined && neverFolds(node, profile, typeRegistry);
    },
    [props.model.nodes, profile, typeRegistry],
  );
  // Derived once for the canvas rather than beside `edgeColors` (useFlowEdges),
  // because the legend needs it too: a trust boundary's swatch is red for the
  // same reason its box is.
  const nodeColors = useMemo(
    () => profile.node?.colorOf?.(props.model, props.plane),
    [profile, props.model, props.plane],
  );
  // Derived the same way as nodeColors: id-keyed, one derivation per model/plane.
  const nodeChips = useMemo(() => profile.node?.chips?.(props.model, props.plane), [profile, props.model, props.plane]);
  return { profile, typeRegistry, kindRegistry, isAlwaysExpanded, nodeColors, nodeChips };
}
