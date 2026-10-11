import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserModel,
  BadgeModel,
  UserBadgeModel,
  UserService,
  BadgeService,
  PostgresUserRepository,
  PostgresBadgeRepository,
  EMAIL_ENCRYPTION_SECRET,
} from '@volontariapp/domain-user';

@Module({
  imports: [TypeOrmModule.forFeature([UserModel, BadgeModel, UserBadgeModel])],
  providers: [
    {
      provide: EMAIL_ENCRYPTION_SECRET,
      useValue:
        process.env.EMAIL_ENCRYPTION_SECRET ?? 'default-secret-for-deletion',
    },
    PostgresUserRepository,
    PostgresBadgeRepository,
    BadgeService,
    UserService,
  ],
  exports: [UserService],
})
export class DomainUserModule {}
