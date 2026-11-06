import { Global, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import {
  GRPC_MICROSERVICES,
  getGrpcOptions,
} from '@volontariapp/contracts-nest';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_PACKAGE, SOCIAL_PACKAGE } from './constants.js';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SOCIAL_PACKAGE,
        inject: [CustomConfig],
        useFactory: (customConfig: CustomConfig) =>
          getGrpcOptions(
            GRPC_MICROSERVICES.SOCIAL,
            customConfig.microServices.msSocialUrl,
          ),
      },
      {
        name: POST_PACKAGE,
        inject: [CustomConfig],
        useFactory: (customConfig: CustomConfig) =>
          getGrpcOptions(
            GRPC_MICROSERVICES.POST,
            customConfig.microServices.msPostUrl,
          ),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GrpcClientModule {}
