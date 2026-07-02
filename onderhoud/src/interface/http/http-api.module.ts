import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApplicationModule } from '../../application/application.module';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { StoringController } from './storing.controller';
import { OnderhoudController } from './onderhoud.controller';
import { SchemaController } from './schema.controller';
import { ExternController } from './extern.controller';
import { DomeinFoutFilter } from './domein-fout.filter';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [ApplicationModule, InfrastructureModule],
  controllers: [StoringController, OnderhoudController, SchemaController, ExternController],
  providers: [
    { provide: APP_FILTER, useClass: DomeinFoutFilter },
    // Module-scoped guard: geldt alleen voor de /api-controllers hierboven,
    // niet voor de HealthController (die staat in HealthModule).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class HttpApiModule {}
