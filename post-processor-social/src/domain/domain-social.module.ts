import { Module } from '@nestjs/common';
import {
  ParticipationService,
  Neo4jParticipationRepository,
  SocialUserService,
  Neo4jSocialUserRepository,
  PublicationService,
  Neo4jPublicationRepository,
} from '@volontariapp/domain-social';

@Module({
  providers: [
    Neo4jParticipationRepository,
    Neo4jSocialUserRepository,
    Neo4jPublicationRepository,
    ParticipationService,
    SocialUserService,
    PublicationService,
  ],
  exports: [ParticipationService, SocialUserService, PublicationService],
})
export class DomainSocialModule {}
