#!/usr/bin/env node
/**
 * Regenerate the bundled "Tech" library pack — vendor logos that are not part of
 * a cloud provider's own icon set.
 *
 *   node scripts/build-tech-pack.mjs
 *
 * Each upstream logo is normalised onto the same 64×64 rounded white tile the
 * AWS icons use, so the marks sit at one visual weight in the palette and stay
 * legible on both the light and the dark canvas (several are monochrome black,
 * which would vanish on the dark theme unbacked).
 *
 * Writes apps/studio/public/library/tech/<slug>.svg — the manifest entries live
 * in apps/studio/src/library/packs.ts.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps', 'studio', 'public', 'library', 'tech');

const TILE = 64;
const PADDING = 10;
const CONTENT = TILE - PADDING * 2;

/** simple-icons ship a bare monochrome path with no fill, which would inherit
 * black — each entry pins the official brand hex from the simple-icons data. */
const si = (name) => `https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/${name}.svg`;

const SOURCES = [
  { slug: 'temporal', url: si('temporal'), fill: '#000000' },
  {
    slug: 'nats',
    url: 'https://raw.githubusercontent.com/cncf/artwork/main/projects/nats/icon/color/nats-icon-color.svg',
  },
  {
    slug: 'starrocks',
    url: 'https://raw.githubusercontent.com/StarRocks/starrocks/main/docs/docusaurus/static/img/logo.svg',
  },
  { slug: 'cloudflare', url: si('cloudflare'), fill: '#F38020' },
  { slug: 'github', url: si('github'), fill: '#181717' },
  { slug: 'github-actions', url: si('githubactions'), fill: '#2088FF' },
  { slug: 'auth0', url: si('auth0'), fill: '#EB5424' },
  // SendGrid left simple-icons; gilbarbara/logos ships the full-color mark.
  { slug: 'sendgrid', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/sendgrid-icon.svg' },
  { slug: 'new-relic', url: si('newrelic'), fill: '#1CE783' },
  { slug: 'clickhouse', url: si('clickhouse'), fill: '#FFCC01' },
  { slug: 'redis', url: si('redis'), fill: '#FF4438' },
  { slug: 'rabbitmq', url: si('rabbitmq'), fill: '#FF6600' },
  { slug: 'postgresql', url: si('postgresql'), fill: '#4169E1' },
  { slug: 'helm', url: si('helm'), fill: '#0F1689' },
  { slug: 'jupyter', url: si('jupyter'), fill: '#F37626' },
  { slug: 'kubernetes', url: si('kubernetes'), fill: '#326CE5' },

  // Messaging and data processing
  { slug: 'kafka', url: si('apachekafka'), fill: '#231F20' },
  { slug: 'pulsar', url: si('apachepulsar'), fill: '#188FFF' },
  { slug: 'flink', url: si('apacheflink'), fill: '#E6526F' },
  { slug: 'spark', url: si('apachespark'), fill: '#E25A1C' },
  { slug: 'airflow', url: si('apacheairflow'), fill: '#017CEE' },
  { slug: 'celery', url: si('celery'), fill: '#37814A' },

  // Databases and storage
  { slug: 'mongodb', url: si('mongodb'), fill: '#47A248' },
  { slug: 'mysql', url: si('mysql'), fill: '#4479A1' },
  { slug: 'mariadb', url: si('mariadb'), fill: '#003545' },
  { slug: 'sqlite', url: si('sqlite'), fill: '#003B57' },
  { slug: 'cassandra', url: si('apachecassandra'), fill: '#1287B1' },
  { slug: 'neo4j', url: si('neo4j'), fill: '#4581C3' },
  { slug: 'influxdb', url: si('influxdb'), fill: '#22ADF6' },
  { slug: 'elasticsearch', url: si('elasticsearch'), fill: '#005571' },
  { slug: 'opensearch', url: si('opensearch'), fill: '#005EB8' },
  { slug: 'snowflake', url: si('snowflake'), fill: '#29B5E8' },
  { slug: 'databricks', url: si('databricks'), fill: '#FF3621' },
  // DuckDB's brand yellow disappears on the white tile; the mark reads in black.
  { slug: 'duckdb', url: si('duckdb'), fill: '#000000' },
  { slug: 'memcached', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/memcached.svg' },
  { slug: 'oracle', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/oracle.svg' },
  { slug: 'supabase', url: si('supabase'), fill: '#3FCF8E' },
  { slug: 'firebase', url: si('firebase'), fill: '#DD2C00' },
  { slug: 'etcd', url: si('etcd'), fill: '#419EDA' },
  { slug: 'minio', url: si('minio'), fill: '#C72E49' },

  // Containers, infrastructure as code, service mesh
  { slug: 'docker', url: si('docker'), fill: '#2496ED' },
  { slug: 'podman', url: si('podman'), fill: '#892CA0' },
  { slug: 'terraform', url: si('terraform'), fill: '#844FBA' },
  { slug: 'pulumi', url: si('pulumi'), fill: '#8A3391' },
  { slug: 'ansible', url: si('ansible'), fill: '#EE0000' },
  // Vault's brand yellow disappears on the white tile; HashiCorp prints it black.
  { slug: 'vault', url: si('vault'), fill: '#000000' },
  { slug: 'consul', url: si('consul'), fill: '#F24C53' },
  { slug: 'istio', url: si('istio'), fill: '#466BB0' },
  { slug: 'envoy', url: si('envoyproxy'), fill: '#AC6199' },
  { slug: 'cilium', url: si('cilium'), fill: '#F8C517' },
  { slug: 'argo', url: si('argo'), fill: '#EF7B4D' },
  { slug: 'flux', url: si('flux'), fill: '#5468FF' },
  { slug: 'nginx', url: si('nginx'), fill: '#009639' },
  { slug: 'caddy', url: si('caddy'), fill: '#1F88C0' },
  { slug: 'kong', url: si('kong'), fill: '#003459' },
  { slug: 'grpc', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/grpc.svg' },
  { slug: 'graphql', url: si('graphql'), fill: '#E10098' },

  // Observability and incident response
  { slug: 'grafana', url: si('grafana'), fill: '#F46800' },
  { slug: 'prometheus', url: si('prometheus'), fill: '#E6522C' },
  { slug: 'opentelemetry', url: si('opentelemetry'), fill: '#000000' },
  { slug: 'jaeger', url: si('jaeger'), fill: '#66CFE3' },
  { slug: 'kibana', url: si('kibana'), fill: '#005571' },
  { slug: 'datadog', url: si('datadog'), fill: '#632CA6' },
  { slug: 'splunk', url: si('splunk'), fill: '#000000' },
  { slug: 'sentry', url: si('sentry'), fill: '#362D59' },
  { slug: 'pagerduty', url: si('pagerduty'), fill: '#06AC38' },

  // Source, CI and planning
  { slug: 'gitlab', url: si('gitlab'), fill: '#FC6D26' },
  { slug: 'bitbucket', url: si('bitbucket'), fill: '#0052CC' },
  { slug: 'jenkins', url: si('jenkins'), fill: '#D24939' },
  { slug: 'circleci', url: si('circleci'), fill: '#343434' },
  { slug: 'jira', url: si('jira'), fill: '#0052CC' },
  { slug: 'confluence', url: si('confluence'), fill: '#172B4D' },

  // Hosting, CDN and edge
  { slug: 'vercel', url: si('vercel'), fill: '#000000' },
  { slug: 'netlify', url: si('netlify'), fill: '#00C7B7' },
  { slug: 'heroku', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/heroku-icon.svg' },
  { slug: 'fastly', url: si('fastly'), fill: '#FF282D' },
  { slug: 'akamai', url: si('akamai'), fill: '#0096D6' },
  { slug: 'digitalocean', url: si('digitalocean'), fill: '#0080FF' },
  { slug: 'hetzner', url: si('hetzner'), fill: '#D50C2D' },

  // Identity
  { slug: 'okta', url: si('okta'), fill: '#007DC1' },
  { slug: 'keycloak', url: si('keycloak'), fill: '#4D4D4D' },

  // SaaS integrations
  { slug: 'stripe', url: si('stripe'), fill: '#635BFF' },
  { slug: 'salesforce', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/salesforce.svg' },
  { slug: 'shopify', url: si('shopify'), fill: '#7AB55C' },
  { slug: 'twilio', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/twilio-icon.svg' },
  { slug: 'mailgun', url: si('mailgun'), fill: '#F06B66' },
  { slug: 'slack', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/slack-icon.svg' },
  { slug: 'microsoft-teams', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/microsoft-teams.svg' },
  { slug: 'discord', url: si('discord'), fill: '#5865F2' },
  { slug: 'zapier', url: si('zapier'), fill: '#FF4F00' },

  // AI
  { slug: 'openai', url: 'https://raw.githubusercontent.com/gilbarbara/logos/main/logos/openai-icon.svg' },
  { slug: 'anthropic', url: si('anthropic'), fill: '#191919' },
  { slug: 'hugging-face', url: si('huggingface'), fill: '#FF9D00' },

  // Runtimes
  { slug: 'python', url: si('python'), fill: '#3776AB' },
  { slug: 'nodejs', url: si('nodedotjs'), fill: '#5FA04E' },
  { slug: 'go', url: si('go'), fill: '#00ADD8' },
  { slug: 'dotnet', url: si('dotnet'), fill: '#512BD4' },
];

/** Kubernetes community icons (labeled heptagons — "pod", "svc", …), every
 * resource, infrastructure and control-plane icon upstream publishes.
 * They carry their own blue chrome and label, so they go out bare (no white
 * tile) into their own family dir, matching how they look in k8s diagrams. */
const K8S_ICONS = 'https://raw.githubusercontent.com/kubernetes/community/master/icons/svg';
/** Every labeled icon upstream publishes, by its directory. */
const K8S_FAMILIES = {
  resources: [
    'c-role',
    'cm',
    'crb',
    'crd',
    'cronjob',
    'deploy',
    'ds',
    'ep',
    'group',
    'hpa',
    'ing',
    'job',
    'limits',
    'netpol',
    'ns',
    'pod',
    'psp',
    'pv',
    'pvc',
    'quota',
    'rb',
    'role',
    'rs',
    'sa',
    'sc',
    'secret',
    'sts',
    'svc',
    'user',
    'vol',
  ],
  infrastructure_components: ['control-plane', 'etcd', 'node'],
  control_plane_components: ['api', 'c-c-m', 'c-m', 'k-proxy', 'kubelet', 'sched'],
};
const K8S_SOURCES = Object.entries(K8S_FAMILIES).flatMap(([dir, slugs]) =>
  slugs.map((slug) => ({ slug, url: `${K8S_ICONS}/${dir}/labeled/${slug}.svg` })),
);

/** viewBox wins; fall back to the width/height attributes when it is absent. */
function viewBox(svg) {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (vb !== undefined) {
    const [minX, minY, w, h] = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (w > 0 && h > 0) return [minX, minY, w, h];
  }
  const attr = (name) => Number(new RegExp(`\\b${name}="([\\d.]+)`).exec(svg)?.[1] ?? 0);
  const [w, h] = [attr('width'), attr('height')];
  if (w > 0 && h > 0) return [0, 0, w, h];
  throw new Error('SVG has neither a usable viewBox nor width/height');
}

const round = (n) => Number(n.toFixed(4));

function tile(svg, fill) {
  const [minX, minY, w, h] = viewBox(svg);
  const inner = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/>\s+</g, '><')
    .trim();

  const scale = CONTENT / Math.max(w, h);
  const tx = PADDING + (CONTENT - w * scale) / 2 - minX * scale;
  const ty = PADDING + (CONTENT - h * scale) / 2 - minY * scale;
  const attrs = `transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})"${
    fill !== undefined ? ` fill="${fill}"` : ''
  }`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${TILE} ${TILE}" width="${TILE}" height="${TILE}">` +
    `<rect width="${TILE}" height="${TILE}" rx="10" fill="#ffffff"/>` +
    `<g ${attrs}>${inner}</g>` +
    `</svg>\n`
  );
}

/** Bare passthrough: strip the fat, normalise the root tag onto the source's
 * own viewBox at a 64px footprint, keep the artwork (and its labels) intact.
 * The rebuilt root drops the original namespace declarations, so every
 * Inkscape/RDF leftover must go too — an undeclared prefix is invalid XML and
 * a browser refuses the whole file. */
function bare(svg) {
  const [minX, minY, w, h] = viewBox(svg);
  let inner = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<metadata[\s>][\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/\s(?:inkscape|sodipodi):[a-zA-Z0-9-]+="[^"]*"/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
  if (!/<(text|tspan)[\s>]/.test(inner)) inner = inner.replace(/>\s+</g, '><');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="${round(minX)} ${round(minY)} ${round(w)} ${round(h)}" width="${TILE}" height="${TILE}">` +
    `${inner}</svg>\n`
  );
}

async function fetchSvg(slug, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${slug}: ${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

await mkdir(OUT, { recursive: true });
for (const { slug, url, fill } of SOURCES) {
  await writeFile(path.join(OUT, `${slug}.svg`), tile(await fetchSvg(slug, url), fill));
  process.stderr.write(`tech/${slug}.svg\n`);
}

const K8S_OUT = path.join(ROOT, 'apps', 'studio', 'public', 'library', 'k8s');
await mkdir(K8S_OUT, { recursive: true });
for (const { slug, url } of K8S_SOURCES) {
  await writeFile(path.join(K8S_OUT, `${slug}.svg`), bare(await fetchSvg(slug, url)));
  process.stderr.write(`k8s/${slug}.svg\n`);
}
