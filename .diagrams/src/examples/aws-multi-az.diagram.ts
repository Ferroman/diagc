import { model } from '@diagc/core';

// Reproduction of a classic multi-AZ AWS reference architecture, exercising the
// cloud-infrastructure vocabulary end to end: aws-* boundary containers with
// corner badges and authentic accent colors, official service/resource icons,
// the Kubernetes pod icons, tech-pack logos and the internet silhouette mark.
// Icon footprints (64px) live in the sibling aws-multi-az.layout.json.

const m = model('aws-multi-az', { name: 'Multi-AZ EKS on AWS' });

const AWS_GROUPS = '/library/aws-groups';
const AWS_ICON = '/library/aws';
const AWS_RES = '/library/aws-resources';

// ---- marks and boundaries --------------------------------------------------

const internet = m.node('internet', { name: 'Internet', shape: '/library/shapes/internet.svg' });

const cloud = m.node('cloud', {
  type: 'aws-cloud',
  name: 'AWS Cloud',
  color: '#242F3E',
  image: `${AWS_GROUPS}/aws-cloud-logo.svg`,
});
const region = m.node('region', {
  type: 'aws-region',
  name: 'Region',
  color: '#00A4A6',
  image: `${AWS_GROUPS}/region.svg`,
});
const vpc = m.node('vpc', {
  type: 'aws-vpc',
  name: 'VPC',
  color: '#8C4FFF',
  image: `${AWS_GROUPS}/virtual-private-cloud-vpc.svg`,
});
const azA = m.node('az-a', { type: 'aws-az', name: 'Availability Zone A', color: '#00A4A6' });
const azB = m.node('az-b', { type: 'aws-az', name: 'Availability Zone B', color: '#00A4A6' });
const pubA = m.node('public-a', {
  type: 'aws-subnet-public',
  name: 'Public Subnet 1',
  color: '#7AA116',
  image: `${AWS_GROUPS}/public-subnet.svg`,
});
const pubB = m.node('public-b', {
  type: 'aws-subnet-public',
  name: 'Public Subnet 2',
  color: '#7AA116',
  image: `${AWS_GROUPS}/public-subnet.svg`,
});
const privA = m.node('private-a', {
  type: 'aws-subnet-private',
  name: 'Private Subnet 1',
  color: '#00A4A6',
  image: `${AWS_GROUPS}/private-subnet.svg`,
});
const privB = m.node('private-b', {
  type: 'aws-subnet-private',
  name: 'Private Subnet 2',
  color: '#00A4A6',
  image: `${AWS_GROUPS}/private-subnet.svg`,
});

// ---- region-level services -------------------------------------------------

const cw = m.node('cloudwatch', { name: 'Amazon CloudWatch', image: `${AWS_ICON}/amazon-cloudwatch.svg` });
const ses = m.node('ses', { name: 'Amazon SES', image: `${AWS_ICON}/amazon-simple-email-service.svg` });
const cognito = m.node('cognito', { name: 'Amazon Cognito', image: `${AWS_ICON}/amazon-cognito.svg` });
const cloudfront = m.node('cloudfront', { name: 'Amazon CloudFront', image: `${AWS_ICON}/amazon-cloudfront.svg` });
const s3 = m.node('s3', { name: 'Amazon S3', image: `${AWS_ICON}/amazon-simple-storage-service.svg` });
const guardduty = m.node('guardduty', { name: 'Amazon GuardDuty', image: `${AWS_ICON}/amazon-guardduty.svg` });
const waf = m.node('waf', { name: 'AWS WAF', image: `${AWS_ICON}/aws-waf.svg` });

// ---- vpc spine -------------------------------------------------------------

const igw = m.node('igw', { name: 'IGW', image: `${AWS_RES}/amazon-vpc-internet-gateway.svg` });
const elb = m.node('elb', { name: 'ELB', image: `${AWS_ICON}/elastic-load-balancing.svg` });
const asg = m.node('asg', { name: 'Auto Scaling Group', image: `${AWS_ICON}/amazon-ec2-auto-scaling.svg` });
const eks = m.node('eks', { name: 'Amazon EKS', image: `${AWS_ICON}/amazon-elastic-kubernetes-service.svg` });

// ---- per-AZ interiors ------------------------------------------------------

const vpnA = m.node('vpn-a', { name: 'VPN', image: `${AWS_ICON}/aws-client-vpn.svg` });
const natA = m.node('nat-a', { name: 'NAT gateway', image: `${AWS_RES}/amazon-vpc-nat-gateway.svg` });
const vpnB = m.node('vpn-b', { name: 'VPN', image: `${AWS_ICON}/aws-client-vpn.svg` });
const natB = m.node('nat-b', { name: 'NAT gateway', image: `${AWS_RES}/amazon-vpc-nat-gateway.svg` });

const podA1 = m.node('pod-a1', { name: 'pod', image: '/library/k8s/pod.svg' });
const podA2 = m.node('pod-a2', { name: 'pod', image: '/library/k8s/pod.svg' });
const podA3 = m.node('pod-a3', { name: 'pod', image: '/library/k8s/pod.svg' });
const podB1 = m.node('pod-b1', { name: 'pod', image: '/library/k8s/pod.svg' });
const podB2 = m.node('pod-b2', { name: 'pod', image: '/library/k8s/pod.svg' });
const podB3 = m.node('pod-b3', { name: 'pod', image: '/library/k8s/pod.svg' });

const redisA = m.node('redis-a', { name: 'Redis Primary', image: '/library/tech/redis.svg' });
const redisB = m.node('redis-b', { name: 'Redis Secondary', image: '/library/tech/redis.svg' });
const auroraA = m.node('aurora-a', { name: 'Aurora Primary', image: `${AWS_ICON}/amazon-aurora.svg` });
const auroraB = m.node('aurora-b', { name: 'Aurora Secondary', image: `${AWS_ICON}/amazon-aurora.svg` });

// ---- containment -----------------------------------------------------------

cloud.contains(region);
region.contains(cw, ses, cognito, cloudfront, s3, guardduty, waf, vpc);
vpc.contains(igw, elb, asg, eks, azA, azB);
azA.contains(pubA, privA);
azB.contains(pubB, privB);
pubA.contains(vpnA, natA);
pubB.contains(vpnB, natB);
privA.contains(podA1, podA2, podA3, redisA, auroraA);
privB.contains(podB1, podB2, podB3, redisB, auroraB);

// ---- flows -----------------------------------------------------------------

m.relate(internet, waf, { kind: 'sync' });
m.relate(internet, cloudfront, { kind: 'sync' });
m.relate(cloudfront, s3, { kind: 'sync' });
m.relate(waf, elb, { kind: 'sync' });
m.relate(elb, asg, { kind: 'sync' });
m.relate(asg, eks, { kind: 'sync' });
for (const pod of [podA1, podA2, podA3, podB1, podB2, podB3]) {
  m.relate(pod, eks, { kind: 'sync' });
}
m.relate(redisA, redisB, { kind: 'async' });
m.relate(auroraA, auroraB, { kind: 'async', label: 'Synchronous replication' });

export default m;
