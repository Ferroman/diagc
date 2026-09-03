import type { LibraryEntry } from './types';

// Hand-curated one-drag AWS boundary containers: each places a group-typed
// node (see the renderer's aws-* vocabulary — outline/dashed/corner-badge
// structure) with the authentic accent color and corner-badge image baked in.
// The colors are sampled from the official group icons themselves, committed
// under public/library/aws-groups — regenerating the AWS pack does not touch
// this file, but a palette change in a new icon release should be folded in.
const ctr = (
  slug: string,
  name: string,
  type: string,
  color: string,
  image?: string,
  keywords: string[] = [],
): LibraryEntry => ({
  id: `aws-ctr-${slug}`,
  category: 'aws-groups',
  name,
  keywords: ['group', 'boundary', 'container', ...keywords],
  template: { type, color, ...(image !== undefined ? { image: `/library/aws-groups/${image}.svg` } : {}) },
});

/** One-drag styled boundary containers, listed ahead of the raw badge icons. */
export const AWS_CONTAINER_ENTRIES: LibraryEntry[] = [
  ctr('cloud', 'AWS Cloud container', 'aws-cloud', '#242F3E', 'aws-cloud'),
  ctr('account', 'AWS Account container', 'aws-account', '#E7157B', 'aws-account'),
  ctr('region', 'Region container', 'aws-region', '#00A4A6', 'region'),
  ctr('az', 'Availability Zone container', 'aws-az', '#00A4A6', undefined, ['az']),
  ctr('vpc', 'VPC container', 'aws-vpc', '#8C4FFF', 'virtual-private-cloud-vpc', ['virtual private cloud']),
  ctr('subnet-public', 'Public Subnet container', 'aws-subnet-public', '#7AA116', 'public-subnet', ['subnet']),
  ctr('subnet-private', 'Private Subnet container', 'aws-subnet-private', '#00A4A6', 'private-subnet', ['subnet']),
  ctr('auto-scaling', 'Auto Scaling Group container', 'aws-auto-scaling-group', '#ED7100', 'auto-scaling-group', ['asg']),
  // For everything without its own stencil (EKS cluster, node pool, …): pick
  // an icon and a color after placing — the type carries the container look.
  ctr('generic', 'Generic Group container', 'aws-group', '#7D8998'),
];
