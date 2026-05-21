import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function resolveConfigDirectory(): string {
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const repositoryRootDir = join(currentFileDir, '..', '..');
  const rootConfigDir = join(repositoryRootDir, 'config');
  if (existsSync(rootConfigDir)) {
    return rootConfigDir;
  }
  throw new Error(`Config directory not found: ${rootConfigDir}`);
}
