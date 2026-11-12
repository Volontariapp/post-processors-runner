import { describe, it, expect } from '@jest/globals';
import { PostgresPostRepository } from '@volontariapp/domain-post';
import { DomainPostModule } from '../../domain/domain-post.module.js';
import { PostProcessorsModule } from '../../post-processors/post-processors.module.js';
import { StorageFileScannedPostProcessor } from '../../post-processors/storage-file-scanned.post-processor.js';
import { StorageFileRejectedPostProcessor } from '../../post-processors/storage-file-rejected.post-processor.js';
import { StorageAttachmentRejectedPostProcessor } from '../../post-processors/storage-attachment-rejected.post-processor.js';
import {
  createStorageProcessorsWiring,
  findFactoryProvider,
} from '../mocks/storage-processors-wiring.mock.js';

/**
 * The storage processors update `post_media` and `posts`. The DataSource the bridge hands out
 * knows no entity, so a repository built on it makes TypeORM call the entity class without `new`
 * (`Class constructor PostMediaModel cannot be invoked without 'new'`) and the post stays PENDING.
 * They must use the repository Nest provides, which sits on the DataSource that knows the entities.
 */
describe('Storage post-processors wiring (post)', () => {
  it('exports the PostgresPostRepository from the domain module', () => {
    const exported = Reflect.getMetadata(
      'exports',
      DomainPostModule,
    ) as unknown[];

    expect(exported).toContain(PostgresPostRepository);
  });

  it.each([
    ['StorageFileScannedPostProcessor', StorageFileScannedPostProcessor],
    ['StorageFileRejectedPostProcessor', StorageFileRejectedPostProcessor],
    [
      'StorageAttachmentRejectedPostProcessor',
      StorageAttachmentRejectedPostProcessor,
    ],
  ] as const)(
    'builds %s on the repository provided by Nest',
    async (_name, token) => {
      const provider = findFactoryProvider(PostProcessorsModule, token);
      const wiring = createStorageProcessorsWiring();

      expect(provider).toBeDefined();
      expect(provider?.inject).toContain(PostgresPostRepository);

      await provider?.useFactory(...wiring.resolve(provider.inject ?? []));

      expect(wiring.bridgeGetRepository).not.toHaveBeenCalled();
    },
  );
});
