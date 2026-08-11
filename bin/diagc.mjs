#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { register } from 'tsx/esm/api';

const here = path.dirname(fileURLToPath(import.meta.url));
register();
await import(path.join(here, '..', 'packages', 'diagc', 'src', 'cli.ts'));
