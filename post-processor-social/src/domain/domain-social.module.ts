import { Module } from '@nestjs/common';
import {
  ParticipationService,
  Neo4jParticipationRepository,
  SocialUserService,
  Neo4jSocialUserRepository,
} from '@volontariapp/domain-social';

@Module({
  providers: [
    Neo4jParticipationRepository,
    Neo4jSocialUserRepository,
    ParticipationService,
    SocialUserService,
  ],
  exports: [ParticipationService, SocialUserService],
})
export class DomainSocialModule {}
