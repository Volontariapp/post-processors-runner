import { Metadata } from '@grpc/grpc-js';
import type { JwtService } from '@volontariapp/auth';
import { INTERNAL_TOKEN_METADATA_KEY } from '@volontariapp/auth';
import { UserRoles } from '@volontariapp/shared';

const TOKEN_CACHE_MS = 4 * 60 * 1000;

/**
 * Forge le token interne de pp-user (rôle ADMIN) et le met en cache 4 minutes.
 * Partagé par tous les clients gRPC sortants pour ne pas dupliquer la logique.
 */
export class InternalMetadataProvider {
  private cachedToken?: { token: string; expiresAt: number };

  constructor(private readonly jwtService: JwtService) {}

  async getMetadata(): Promise<Metadata> {
    const now = Date.now();
    if (!this.cachedToken || this.cachedToken.expiresAt <= now) {
      const token = await this.jwtService.signInternal({
        id: 'pp-user',
        role: UserRoles.ADMIN,
      });
      this.cachedToken = { token, expiresAt: now + TOKEN_CACHE_MS };
    }
    const metadata = new Metadata();
    metadata.set(INTERNAL_TOKEN_METADATA_KEY, this.cachedToken.token);
    return metadata;
  }
}
