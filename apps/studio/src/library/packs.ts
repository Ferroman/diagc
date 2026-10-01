import type { Library, LibraryCategory, LibraryEntry } from './types';
import { ACTIVITY_PACK } from './packs.activity';
import { AWS_PACK } from './packs.aws';
import { AWS_CONTAINER_ENTRIES } from './packs.aws-containers';
import { AZURE_PACK } from './packs.azure';
import { GCP_PACK } from './packs.gcp';
import { C4_PACK } from './packs.c4';
import { DATA_PACK } from './packs.data';
import { SECOND_ORDER_PACK } from './packs.second-order';
import { FISHBONE_PACK } from './packs.fishbone';
import { PLAN_PACK } from './packs.plan';
import { DEPLOYMENT_PACK } from './packs.deployment';
import { THREAT_MODEL_PACK } from './packs.threat-model';

// The plain built-in stencils (the renderer's DEFAULT_TYPE_STYLES) — what a
// .diagram.ts author gets from `type:` with no pack at all. Without these the
// palette offered every vendor icon but no ordinary service/database box; the
// only route to one was Add node + the Properties type field. No Person here
// on purpose: the palette already carries two (C4's and the Shapes silhouette),
// and a third identically-named card would be ambiguity, not coverage.
const basic = (id: string, type: string | undefined, name: string, keywords: string[]): LibraryEntry => ({
  id: `basic-${id}`,
  category: 'basics',
  name,
  keywords,
  template: type === undefined ? {} : { type },
});

const basicsCategories: LibraryCategory[] = [{ id: 'basics', name: 'Basics', builtin: true }];

const basicsEntries: LibraryEntry[] = [
  basic('box', undefined, 'Box', ['plain', 'node', 'generic', 'empty', 'blank']),
  basic('service', 'service', 'Service', ['component', 'microservice', 'app', 'application']),
  basic('system', 'system', 'System', ['boundary', 'context', 'dashed']),
  basic('platform', 'platform', 'Platform', ['boundary', 'group', 'dashed']),
  basic('database', 'database', 'Database', ['db', 'sql', 'store', 'storage', 'cylinder']),
  basic('queue', 'queue', 'Queue', ['message', 'topic', 'bus', 'broker', 'pill']),
  basic('infra', 'infra', 'Infrastructure', ['server', 'host', 'hexagon', 'machine']),
  basic('comment', 'comment', 'Comment', ['note', 'remark', 'aside', 'bubble']),
];

// Vendor logos that no cloud provider's icon set covers. Assets are generated
// onto a common tile by `node scripts/build-tech-pack.mjs`. Nested under the
// panel's 'Tech' group, one category per job, since a flat list of ninety
// logos is only searchable, not browsable.
const techIcon = (category: string, slug: string, name: string, keywords: string[]): LibraryEntry => ({
  id: `tech-${slug}`,
  category: `tech-${category}`,
  name,
  keywords,
  template: { type: 'image', image: `/library/tech/${slug}.svg`, width: 64, height: 64 },
});

const techCategories: LibraryCategory[] = [
  { id: 'tech-messaging', name: 'Messaging & processing', group: 'Tech', builtin: true },
  { id: 'tech-data', name: 'Databases & storage', group: 'Tech', builtin: true },
  { id: 'tech-platform', name: 'Containers & infrastructure', group: 'Tech', builtin: true },
  { id: 'tech-observability', name: 'Observability', group: 'Tech', builtin: true },
  { id: 'tech-devtools', name: 'Source, CI & planning', group: 'Tech', builtin: true },
  { id: 'tech-hosting', name: 'Hosting & edge', group: 'Tech', builtin: true },
  { id: 'tech-identity', name: 'Identity', group: 'Tech', builtin: true },
  { id: 'tech-saas', name: 'SaaS', group: 'Tech', builtin: true },
  { id: 'tech-ai', name: 'AI', group: 'Tech', builtin: true },
  { id: 'tech-runtimes', name: 'Runtimes', group: 'Tech', builtin: true },
];

const techEntries: LibraryEntry[] = [
  techIcon('messaging', 'kafka', 'Apache Kafka', ['kafka', 'streaming', 'events', 'log', 'topic', 'broker', 'pubsub']),
  techIcon('messaging', 'rabbitmq', 'RabbitMQ', ['messaging', 'queue', 'amqp', 'broker', 'events']),
  techIcon('messaging', 'nats', 'NATS', ['messaging', 'pubsub', 'queue', 'jetstream', 'broker', 'events']),
  techIcon('messaging', 'pulsar', 'Apache Pulsar', ['pulsar', 'streaming', 'messaging', 'pubsub', 'broker', 'events']),
  techIcon('messaging', 'temporal', 'Temporal', ['workflow', 'durable execution', 'orchestration', 'saga', 'activity']),
  techIcon('messaging', 'celery', 'Celery', ['task queue', 'worker', 'jobs', 'python', 'background']),
  techIcon('messaging', 'flink', 'Apache Flink', ['flink', 'stream processing', 'streaming', 'realtime']),
  techIcon('messaging', 'spark', 'Apache Spark', ['spark', 'batch', 'etl', 'big data', 'processing']),
  techIcon('messaging', 'airflow', 'Apache Airflow', ['airflow', 'dag', 'etl', 'orchestration', 'pipeline', 'scheduler']),

  techIcon('data', 'postgresql', 'PostgreSQL', ['database', 'sql', 'relational', 'postgres', 'rdbms']),
  techIcon('data', 'mysql', 'MySQL', ['database', 'sql', 'relational', 'rdbms']),
  techIcon('data', 'mariadb', 'MariaDB', ['database', 'sql', 'relational', 'mysql', 'rdbms']),
  techIcon('data', 'oracle', 'Oracle Database', ['oracle', 'database', 'sql', 'relational', 'rdbms']),
  techIcon('data', 'sqlite', 'SQLite', ['database', 'sql', 'embedded', 'file']),
  techIcon('data', 'mongodb', 'MongoDB', ['database', 'nosql', 'document', 'mongo']),
  techIcon('data', 'cassandra', 'Apache Cassandra', ['cassandra', 'database', 'nosql', 'wide column']),
  techIcon('data', 'redis', 'Redis', ['cache', 'kv', 'key-value', 'store', 'pubsub', 'memory']),
  techIcon('data', 'memcached', 'Memcached', ['cache', 'kv', 'key-value', 'memory']),
  techIcon('data', 'neo4j', 'Neo4j', ['graph', 'database', 'cypher']),
  techIcon('data', 'influxdb', 'InfluxDB', ['time series', 'tsdb', 'database', 'metrics']),
  techIcon('data', 'elasticsearch', 'Elasticsearch', ['search', 'index', 'elastic', 'full text', 'elk']),
  techIcon('data', 'opensearch', 'OpenSearch', ['search', 'index', 'full text', 'elasticsearch']),
  techIcon('data', 'clickhouse', 'ClickHouse', ['olap', 'analytics', 'warehouse', 'database', 'columnar', 'sql']),
  techIcon('data', 'starrocks', 'StarRocks', ['olap', 'analytics', 'warehouse', 'database', 'sql', 'mpp']),
  techIcon('data', 'snowflake', 'Snowflake', ['warehouse', 'analytics', 'data warehouse', 'sql']),
  techIcon('data', 'databricks', 'Databricks', ['lakehouse', 'spark', 'analytics', 'data lake']),
  techIcon('data', 'duckdb', 'DuckDB', ['olap', 'analytics', 'embedded', 'sql']),
  techIcon('data', 'supabase', 'Supabase', ['postgres', 'backend', 'baas', 'database', 'auth']),
  techIcon('data', 'firebase', 'Firebase', ['backend', 'baas', 'firestore', 'realtime', 'google']),
  techIcon('data', 'etcd', 'etcd', ['kv', 'key-value', 'consensus', 'raft', 'config']),
  techIcon('data', 'minio', 'MinIO', ['object storage', 's3', 'blob', 'bucket']),

  techIcon('platform', 'kubernetes', 'Kubernetes', ['k8s', 'cluster', 'container', 'orchestration']),
  techIcon('platform', 'helm', 'Helm', ['kubernetes', 'chart', 'package', 'deploy', 'chartmuseum']),
  techIcon('platform', 'docker', 'Docker', ['container', 'image', 'compose', 'runtime']),
  techIcon('platform', 'podman', 'Podman', ['container', 'image', 'runtime']),
  techIcon('platform', 'terraform', 'Terraform', ['iac', 'infrastructure as code', 'hashicorp', 'provisioning']),
  techIcon('platform', 'pulumi', 'Pulumi', ['iac', 'infrastructure as code', 'provisioning']),
  techIcon('platform', 'ansible', 'Ansible', ['configuration management', 'automation', 'playbook']),
  techIcon('platform', 'vault', 'Vault', ['secrets', 'hashicorp', 'kms', 'credentials', 'pki']),
  techIcon('platform', 'consul', 'Consul', ['service discovery', 'service mesh', 'hashicorp', 'kv']),
  techIcon('platform', 'istio', 'Istio', ['service mesh', 'sidecar', 'mtls', 'kubernetes']),
  techIcon('platform', 'envoy', 'Envoy', ['proxy', 'sidecar', 'service mesh', 'load balancer']),
  techIcon('platform', 'cilium', 'Cilium', ['cni', 'ebpf', 'network policy', 'kubernetes']),
  techIcon('platform', 'argo', 'Argo', ['argocd', 'gitops', 'cd', 'workflows', 'kubernetes']),
  techIcon('platform', 'flux', 'Flux', ['gitops', 'cd', 'kubernetes']),
  techIcon('platform', 'nginx', 'NGINX', ['web server', 'reverse proxy', 'load balancer', 'ingress']),
  techIcon('platform', 'caddy', 'Caddy', ['web server', 'reverse proxy', 'tls']),
  techIcon('platform', 'kong', 'Kong', ['api gateway', 'gateway', 'proxy']),
  techIcon('platform', 'grpc', 'gRPC', ['rpc', 'protobuf', 'api', 'protocol']),
  techIcon('platform', 'graphql', 'GraphQL', ['api', 'query', 'schema', 'protocol']),

  techIcon('observability', 'grafana', 'Grafana', ['dashboard', 'monitoring', 'observability', 'metrics']),
  techIcon('observability', 'prometheus', 'Prometheus', ['metrics', 'monitoring', 'alerting', 'tsdb']),
  techIcon('observability', 'opentelemetry', 'OpenTelemetry', ['otel', 'tracing', 'telemetry', 'collector']),
  techIcon('observability', 'jaeger', 'Jaeger', ['tracing', 'distributed tracing', 'spans']),
  techIcon('observability', 'kibana', 'Kibana', ['dashboard', 'logs', 'elk', 'elastic']),
  techIcon('observability', 'datadog', 'Datadog', ['monitoring', 'observability', 'apm', 'logs', 'metrics']),
  techIcon('observability', 'new-relic', 'New Relic', ['monitoring', 'observability', 'apm', 'telemetry', 'alerting']),
  techIcon('observability', 'splunk', 'Splunk', ['logs', 'siem', 'search', 'monitoring']),
  techIcon('observability', 'sentry', 'Sentry', ['errors', 'crash reporting', 'exceptions', 'apm']),
  techIcon('observability', 'pagerduty', 'PagerDuty', ['on-call', 'incident', 'alerting', 'paging']),

  techIcon('devtools', 'github', 'GitHub', ['git', 'repo', 'repository', 'source', 'vcs']),
  techIcon('devtools', 'github-actions', 'GitHub Actions', ['ci', 'cd', 'pipeline', 'workflow', 'build', 'deploy']),
  techIcon('devtools', 'gitlab', 'GitLab', ['git', 'repo', 'repository', 'ci', 'cd', 'pipeline']),
  techIcon('devtools', 'bitbucket', 'Bitbucket', ['git', 'repo', 'repository', 'source', 'atlassian']),
  techIcon('devtools', 'jenkins', 'Jenkins', ['ci', 'cd', 'pipeline', 'build']),
  techIcon('devtools', 'circleci', 'CircleCI', ['ci', 'cd', 'pipeline', 'build']),
  techIcon('devtools', 'jira', 'Jira', ['issues', 'tickets', 'tracker', 'atlassian', 'planning']),
  techIcon('devtools', 'confluence', 'Confluence', ['wiki', 'docs', 'atlassian']),
  techIcon('devtools', 'jupyter', 'Jupyter', ['notebook', 'python', 'data science', 'analysis']),

  techIcon('hosting', 'cloudflare', 'Cloudflare', ['cdn', 'dns', 'ddos', 'proxy', 'waf', 'edge']),
  techIcon('hosting', 'fastly', 'Fastly', ['cdn', 'edge', 'cache']),
  techIcon('hosting', 'akamai', 'Akamai', ['cdn', 'edge', 'waf']),
  techIcon('hosting', 'vercel', 'Vercel', ['hosting', 'serverless', 'frontend', 'edge', 'paas']),
  techIcon('hosting', 'netlify', 'Netlify', ['hosting', 'static', 'frontend', 'paas']),
  techIcon('hosting', 'heroku', 'Heroku', ['hosting', 'paas', 'dyno']),
  techIcon('hosting', 'digitalocean', 'DigitalOcean', ['cloud', 'hosting', 'vps', 'droplet']),
  techIcon('hosting', 'hetzner', 'Hetzner', ['cloud', 'hosting', 'vps', 'dedicated']),

  techIcon('identity', 'auth0', 'Auth0', ['auth', 'authentication', 'identity', 'idp', 'oauth', 'sso']),
  techIcon('identity', 'okta', 'Okta', ['auth', 'identity', 'idp', 'sso', 'oidc', 'saml']),
  // Hand-added asset, not produced by the build script.
  techIcon('identity', 'microsoft-entra-id', 'Microsoft Entra ID', ['azure ad', 'aad', 'auth', 'identity', 'idp', 'sso']),
  techIcon('identity', 'keycloak', 'Keycloak', ['auth', 'identity', 'idp', 'sso', 'oidc', 'saml']),

  techIcon('saas', 'stripe', 'Stripe', ['payments', 'billing', 'checkout']),
  techIcon('saas', 'salesforce', 'Salesforce', ['crm', 'sales']),
  techIcon('saas', 'shopify', 'Shopify', ['ecommerce', 'shop', 'store']),
  techIcon('saas', 'twilio', 'Twilio', ['sms', 'voice', 'messaging', 'notifications']),
  techIcon('saas', 'sendgrid', 'SendGrid', ['email', 'mail', 'smtp', 'twilio', 'notifications']),
  techIcon('saas', 'mailgun', 'Mailgun', ['email', 'mail', 'smtp', 'notifications']),
  techIcon('saas', 'slack', 'Slack', ['chat', 'messaging', 'notifications', 'webhook']),
  techIcon('saas', 'microsoft-teams', 'Microsoft Teams', ['chat', 'messaging', 'notifications', 'teams']),
  techIcon('saas', 'discord', 'Discord', ['chat', 'messaging', 'community', 'webhook']),
  techIcon('saas', 'zapier', 'Zapier', ['automation', 'integration', 'workflow', 'no-code']),

  techIcon('ai', 'openai', 'OpenAI', ['llm', 'gpt', 'ai', 'model']),
  techIcon('ai', 'anthropic', 'Anthropic', ['llm', 'claude', 'ai', 'model']),
  techIcon('ai', 'hugging-face', 'Hugging Face', ['ml', 'models', 'ai', 'transformers']),

  techIcon('runtimes', 'python', 'Python', ['language', 'runtime', 'py']),
  techIcon('runtimes', 'nodejs', 'Node.js', ['javascript', 'js', 'node', 'runtime', 'language']),
  techIcon('runtimes', 'go', 'Go', ['golang', 'language', 'runtime']),
  techIcon('runtimes', 'dotnet', '.NET', ['dotnet', 'csharp', 'c#', 'runtime']),
];

// Tintable silhouette masks (see DiagramNode.shape) — the generic marks cloud
// diagrams hang off the edges of the frame: people and the internet.
const shapeMark = (slug: string, name: string, w: number, h: number, keywords: string[]): LibraryEntry => ({
  id: `shape-${slug}`,
  category: 'shapes',
  name,
  keywords,
  template: { shape: `/library/shapes/${slug}.svg`, width: w, height: h },
});

const shapesCategories: LibraryCategory[] = [{ id: 'shapes', name: 'Shapes', builtin: true }];

const shapesEntries: LibraryEntry[] = [
  shapeMark('person', 'Person', 52, 62, ['user', 'actor', 'human']),
  shapeMark('users', 'Users', 84, 62, ['users', 'people', 'group', 'actors', 'clients']),
  shapeMark('internet', 'Internet', 64, 52, ['internet', 'cloud', 'www', 'network', 'external']),
];

// Kubernetes community icons — the labeled heptagons k8s diagrams are drawn
// with, every resource and cluster component upstream publishes. Bare marks
// (no tile), generated by the same build script.
const k8sIcon = (slug: string, name: string, keywords: string[]): LibraryEntry => ({
  id: `k8s-${slug}`,
  category: 'k8s',
  name,
  keywords: ['kubernetes', 'k8s', ...keywords],
  template: { type: 'image', image: `/library/k8s/${slug}.svg`, width: 64, height: 64 },
});

const k8sCategories: LibraryCategory[] = [{ id: 'k8s', name: 'Kubernetes', builtin: true }];

const k8sEntries: LibraryEntry[] = [
  // Workloads
  k8sIcon('pod', 'Pod', ['pod', 'container', 'workload']),
  k8sIcon('deploy', 'Deployment', ['deployment', 'deploy', 'rollout', 'workload']),
  k8sIcon('rs', 'ReplicaSet', ['replicaset', 'rs', 'replicas', 'workload']),
  k8sIcon('sts', 'StatefulSet', ['statefulset', 'sts', 'stateful', 'workload']),
  k8sIcon('ds', 'DaemonSet', ['daemonset', 'ds', 'agent', 'workload']),
  k8sIcon('job', 'Job', ['job', 'batch', 'workload']),
  k8sIcon('cronjob', 'CronJob', ['cronjob', 'cron', 'schedule', 'batch']),
  k8sIcon('hpa', 'HorizontalPodAutoscaler', ['hpa', 'autoscaler', 'autoscaling', 'scale']),
  // Networking
  k8sIcon('svc', 'Service', ['service', 'svc', 'cluster ip', 'load balancer']),
  k8sIcon('ing', 'Ingress', ['ingress', 'ing', 'route', 'http', 'gateway']),
  k8sIcon('ep', 'Endpoints', ['endpoints', 'ep', 'endpoint slice']),
  k8sIcon('netpol', 'NetworkPolicy', ['network policy', 'netpol', 'firewall']),
  // Config and storage
  k8sIcon('cm', 'ConfigMap', ['configmap', 'cm', 'config']),
  k8sIcon('secret', 'Secret', ['secret', 'credentials', 'config']),
  k8sIcon('pv', 'PersistentVolume', ['persistent volume', 'pv', 'storage', 'disk']),
  k8sIcon('pvc', 'PersistentVolumeClaim', ['persistent volume claim', 'pvc', 'storage', 'disk']),
  k8sIcon('sc', 'StorageClass', ['storage class', 'sc', 'storage', 'provisioner']),
  k8sIcon('vol', 'Volume', ['volume', 'vol', 'storage', 'mount']),
  // Policy and access
  k8sIcon('ns', 'Namespace', ['namespace', 'ns', 'tenant']),
  k8sIcon('quota', 'ResourceQuota', ['resource quota', 'quota', 'limits']),
  k8sIcon('limits', 'LimitRange', ['limit range', 'limits', 'quota']),
  k8sIcon('sa', 'ServiceAccount', ['service account', 'sa', 'identity', 'rbac']),
  k8sIcon('user', 'User', ['user', 'rbac', 'identity']),
  k8sIcon('group', 'Group', ['group', 'rbac', 'identity']),
  k8sIcon('role', 'Role', ['role', 'rbac', 'permissions']),
  k8sIcon('rb', 'RoleBinding', ['role binding', 'rb', 'rbac', 'permissions']),
  k8sIcon('c-role', 'ClusterRole', ['cluster role', 'rbac', 'permissions']),
  k8sIcon('crb', 'ClusterRoleBinding', ['cluster role binding', 'crb', 'rbac', 'permissions']),
  k8sIcon('psp', 'PodSecurityPolicy', ['pod security policy', 'psp', 'security']),
  k8sIcon('crd', 'CustomResourceDefinition', ['crd', 'custom resource', 'operator', 'extension']),
  // Cluster components
  k8sIcon('node', 'Node', ['node', 'worker', 'machine', 'node pool']),
  k8sIcon('control-plane', 'Control plane', ['control plane', 'master']),
  k8sIcon('api', 'API server', ['api server', 'kube-apiserver', 'control plane']),
  k8sIcon('etcd', 'etcd', ['etcd', 'kv', 'control plane', 'datastore']),
  k8sIcon('sched', 'Scheduler', ['scheduler', 'kube-scheduler', 'control plane']),
  k8sIcon('c-m', 'Controller manager', ['controller manager', 'kube-controller-manager', 'control plane']),
  k8sIcon('c-c-m', 'Cloud controller manager', ['cloud controller manager', 'ccm', 'control plane']),
  k8sIcon('kubelet', 'Kubelet', ['kubelet', 'node agent']),
  k8sIcon('k-proxy', 'kube-proxy', ['kube-proxy', 'proxy', 'iptables', 'networking']),
];

/** Read-only packs bundled with the app; merged with the user library on load.
 * Basics first (the plain stencils every diagram starts from), then C4 (the
 * smallest, most-used pack), the Activity stencil, the second-order, fishbone,
 * threat-model, deployment and plan stencils, the Data pack, the vendor logos and
 * Kubernetes icons, then the full AWS, Azure and Google Cloud icon sets — the panel renders
 * categories in this order. */
export const BUNDLED_LIBRARY: Library = {
  categories: [...basicsCategories, ...C4_PACK.categories, ...ACTIVITY_PACK.categories, ...SECOND_ORDER_PACK.categories, ...FISHBONE_PACK.categories, ...THREAT_MODEL_PACK.categories, ...DEPLOYMENT_PACK.categories, ...PLAN_PACK.categories, ...DATA_PACK.categories, ...shapesCategories, ...techCategories, ...k8sCategories, ...AWS_PACK.categories, ...AZURE_PACK.categories, ...GCP_PACK.categories],
  entries: [...basicsEntries, ...C4_PACK.entries, ...ACTIVITY_PACK.entries, ...SECOND_ORDER_PACK.entries, ...FISHBONE_PACK.entries, ...THREAT_MODEL_PACK.entries, ...DEPLOYMENT_PACK.entries, ...PLAN_PACK.entries, ...DATA_PACK.entries, ...shapesEntries, ...techEntries, ...k8sEntries, ...AWS_CONTAINER_ENTRIES, ...AWS_PACK.entries, ...AZURE_PACK.entries, ...GCP_PACK.entries],
};
