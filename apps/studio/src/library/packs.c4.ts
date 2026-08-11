import type { Library, LibraryCategory, LibraryEntry } from './types';

// The full C4 stencil (https://c4model.com), split by the level it belongs to so
// each section of the panel matches one kind of C4 diagram:
//
//   Context     system context + system landscape diagrams
//   Container   container diagrams
//   Component   component diagrams
//   Deployment  deployment diagrams
//   Code        level-4 code diagrams
//
// Dynamic diagrams reuse whichever level's elements they describe — what makes
// them dynamic is numbered relations, which are authored on the connector
// (`labels`), not placed from here.
//
// Colors are the reference C4 palette: each `external` twin shares its sibling's
// stencil and swaps in the grey accent. The `[Level]` subtitle under the name
// comes from the renderer's type registry, not from the entry.
const PERSON_SHAPE = '/library/shapes/person.svg';

const C4 = {
  person: '#08427b',
  personExternal: '#686868',
  system: '#1168bd',
  systemExternal: '#999999',
  container: '#438dd5',
  containerExternal: '#b3b3b3',
  component: '#85bbf0',
  componentExternal: '#cccccc',
  boundary: '#444444',
  group: '#888888',
  node: '#666666',
} as const;

const box = (
  category: string,
  id: string,
  name: string,
  color: string,
  keywords: string[],
): LibraryEntry => ({
  id,
  category,
  name,
  keywords,
  template: { type: id, color },
});

const person = (id: string, name: string, color: string, keywords: string[]): LibraryEntry => ({
  id,
  category: 'c4',
  name,
  keywords,
  template: { type: id, color, shape: PERSON_SHAPE, width: 90, height: 110 },
});

const categories: LibraryCategory[] = [
  { id: 'c4', name: 'C4 · Context', builtin: true },
  { id: 'c4-containers', name: 'C4 · Container', builtin: true },
  { id: 'c4-components', name: 'C4 · Component', builtin: true },
  { id: 'c4-deployment', name: 'C4 · Deployment', builtin: true },
  { id: 'c4-code', name: 'C4 · Code', builtin: true },
];

const entries: LibraryEntry[] = [
  // ---- Context / System Landscape ----------------------------------------
  person('c4-person', 'Person', C4.person, ['actor', 'user', 'role', 'customer']),
  person('c4-person-external', 'External Person', C4.personExternal, ['actor', 'user', 'third party', 'outside']),
  box('c4', 'c4-system', 'Software System', C4.system, ['system', 'app', 'product']),
  box('c4', 'c4-system-external', 'External Software System', C4.systemExternal, [
    'system',
    'third party',
    'saas',
    'outside',
  ]),
  box('c4', 'c4-enterprise-boundary', 'Enterprise Boundary', C4.boundary, [
    'boundary',
    'organisation',
    'organization',
    'landscape',
  ]),
  box('c4', 'c4-system-boundary', 'System Boundary', C4.boundary, ['boundary', 'scope', 'context']),
  box('c4', 'c4-group', 'Group', C4.group, ['boundary', 'grouping', 'domain', 'team']),

  // ---- Container ----------------------------------------------------------
  box('c4-containers', 'c4-container', 'Container', C4.container, ['service', 'app', 'process', 'deployable']),
  box('c4-containers', 'c4-container-external', 'External Container', C4.containerExternal, [
    'service',
    'third party',
    'outside',
  ]),
  box('c4-containers', 'c4-container-web', 'Web Application', C4.container, ['web', 'server', 'ssr', 'website']),
  box('c4-containers', 'c4-container-spa', 'Single-Page Application', C4.container, [
    'spa',
    'browser',
    'frontend',
    'react',
  ]),
  box('c4-containers', 'c4-container-mobile', 'Mobile App', C4.container, ['ios', 'android', 'phone', 'client']),
  box('c4-containers', 'c4-container-desktop', 'Desktop App', C4.container, ['client', 'native', 'electron']),
  box('c4-containers', 'c4-container-api', 'API Application', C4.container, ['api', 'rest', 'graphql', 'backend']),
  box('c4-containers', 'c4-container-function', 'Serverless Function', C4.container, [
    'lambda',
    'faas',
    'serverless',
  ]),
  box('c4-containers', 'c4-container-cli', 'Console / CLI', C4.container, ['cli', 'terminal', 'job', 'script']),
  box('c4-containers', 'c4-container-db', 'Database', C4.container, ['sql', 'postgres', 'store', 'rdbms']),
  box('c4-containers', 'c4-container-blob', 'Blob Store', C4.container, ['object storage', 'files', 's3', 'bucket']),
  box('c4-containers', 'c4-container-search', 'Search Index', C4.container, [
    'elasticsearch',
    'opensearch',
    'lucene',
  ]),
  box('c4-containers', 'c4-container-queue', 'Message Bus', C4.container, ['queue', 'topic', 'kafka', 'events']),
  box('c4-containers', 'c4-container-boundary', 'Container Boundary', C4.boundary, ['boundary', 'scope']),

  // ---- Component ----------------------------------------------------------
  box('c4-components', 'c4-component', 'Component', C4.component, ['module', 'class', 'package']),
  box('c4-components', 'c4-component-external', 'External Component', C4.componentExternal, [
    'module',
    'library',
    'third party',
  ]),
  box('c4-components', 'c4-component-db', 'Component Database', C4.component, ['repository', 'dao', 'store']),
  box('c4-components', 'c4-component-queue', 'Component Queue', C4.component, ['buffer', 'channel', 'events']),

  // ---- Deployment ---------------------------------------------------------
  box('c4-deployment', 'c4-deployment-node', 'Deployment Node', C4.node, [
    'environment',
    'region',
    'cluster',
    'host',
    'vm',
  ]),
  box('c4-deployment', 'c4-infrastructure-node', 'Infrastructure Node', C4.container, [
    'load balancer',
    'firewall',
    'dns',
    'router',
  ]),
  box('c4-deployment', 'c4-container-instance', 'Container Instance', C4.container, [
    'replica',
    'pod',
    'deployed',
    'runtime',
  ]),

  // ---- Code ---------------------------------------------------------------
  box('c4-code', 'c4-class', 'Class', C4.component, ['type', 'object', 'uml']),
  box('c4-code', 'c4-interface', 'Interface', C4.component, ['protocol', 'contract', 'uml']),
  box('c4-code', 'c4-enum', 'Enumeration', C4.component, ['enum', 'constants', 'uml']),
];

/** The C4 stencil, one category per C4 diagram level. */
export const C4_PACK: Library = { categories, entries };
