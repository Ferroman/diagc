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
  { type, color, image }: { type: string; color: string; image?: string },
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
  ctr('cloud', 'AWS Cloud container', { type: 'aws-cloud', color: '#242F3E', image: 'aws-cloud' }),
  ctr('account', 'AWS Account container', { type: 'aws-account', color: '#E7157B', image: 'aws-account' }),
  ctr('region', 'Region container', { type: 'aws-region', color: '#00A4A6', image: 'region' }),
  ctr('az', 'Availability Zone container', { type: 'aws-az', color: '#00A4A6' }, ['az']),
  ctr('vpc', 'VPC container', { type: 'aws-vpc', color: '#8C4FFF', image: 'virtual-private-cloud-vpc' }, [
    'virtual private cloud',
  ]),
  ctr(
    'subnet-public',
    'Public Subnet container',
    { type: 'aws-subnet-public', color: '#7AA116', image: 'public-subnet' },
    ['subnet'],
  ),
  ctr(
    'subnet-private',
    'Private Subnet container',
    { type: 'aws-subnet-private', color: '#00A4A6', image: 'private-subnet' },
    ['subnet'],
  ),
  ctr(
    'auto-scaling',
    'Auto Scaling Group container',
    { type: 'aws-auto-scaling-group', color: '#ED7100', image: 'auto-scaling-group' },
    ['asg'],
  ),
  // For everything without its own stencil (EKS cluster, node pool, …): pick
  // an icon and a color after placing — the type carries the container look.
  ctr('generic', 'Generic Group container', { type: 'aws-group', color: '#7D8998' }),
];
