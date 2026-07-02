import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApplicationModule } from '../../application/application.module';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { StoringController } from './storing.controller';
import { OnderhoudController } from './onderhoud.controller';
import { SchemaController } from './schema.controller';
import { ExternController } from './extern.controller';
import { DomeinFoutFilter } from './domein-fout.filter';

@Module({
  imports: [ApplicationModule, InfrastructureModule],
  controllers: [StoringController, OnderhoudController, SchemaController, ExternController],
  providers: [{ provide: APP_FILTER, useClass: DomeinFoutFilter }],
})
export class HttpApiModule {}
