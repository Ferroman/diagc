import type { ComponentType } from 'react';
import {
  AppWindow,
  Archive,
  Blocks,
  Box,
  Boxes,
  Braces,
  Cloud,
  Component,
  Container,
  Cpu,
  Database,
  Globe,
  HardDrive,
  ListOrdered,
  Mail,
  Monitor,
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
