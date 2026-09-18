import type { ComponentType } from 'react';
import {
  AppWindow,
  Archive,
  Blocks,
  Box,
  Boxes,
  Braces,
  CircleDot,
  Cloud,
  Component,
  Container,
  Cpu,
  Database,
  GitFork,
  Globe,
  HardDrive,
  ListOrdered,
  Mail,
  MessageSquare,
  Minus,
  Monitor,
  Plus,
  Puzzle,
  Search,
  Server,
  Smartphone,
  SquareFunction,
  Table2,
  Terminal,
  User,
  Webhook,
} from 'lucide-react';

export type IconComponent = ComponentType<{ size?: number | string; className?: string }>;

const BUILTIN: Record<string, IconComponent> = {
  database: Database,
  postgres: Database,
  table: Table2,
  user: User,
  cloud: Cloud,
  mail: Mail,
  service: Box,
  system: Boxes,
  queue: ListOrdered,
  server: Server,
  kubernetes: Container,
  infra: HardDrive,
  comment: MessageSquare,
  // C4 container/component stencils: one glyph per common technology shape.
  browser: Globe,
  spa: AppWindow,
  mobile: Smartphone,
  desktop: Monitor,
  api: Webhook,
  function: SquareFunction,
  cli: Terminal,
  blob: Archive,
  search: Search,
  component: Component,
  interface: Puzzle,
  class: Braces,
  node: Cpu,
  instance: Blocks,
  // Second-order thinking: the glyph repeats the valence, so the tint is never
  // the only signal (greyscale prints, colour-blind readers).
  plus: Plus,
  minus: Minus,
  dot: CircleDot,
  decision: GitFork,
};

/** Every id `createIconRegistry()` resolves out of the box — the source the
 * editor's icon suggestions read, so the two can never drift. */
export const BUILTIN_ICON_IDS: readonly string[] = Object.keys(BUILTIN);

export interface IconRegistry {
  resolve(id: string): IconComponent | undefined;
  register(id: string, icon: IconComponent): void;
}

export function createIconRegistry(custom?: Record<string, IconComponent>): IconRegistry {
  const entries = new Map(Object.entries({ ...BUILTIN, ...custom }));
  return {
    resolve: (id) => entries.get(id),
    register: (id, icon) => {
      entries.set(id, icon);
    },
  };
}
