import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/db/database.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ApplicationModule } from './application/application.module';
import { HttpApiModule } from './interface/http/http-api.module';
import { ConsumersModule } from './infrastructure/messaging/consumers.module';
import { HealthModule } from './interface/health/health.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    MessagingModule,
    InfrastructureModule,
    ApplicationModule,
    HttpApiModule,
    ConsumersModule,
    HealthModule,
  ],
})
export class AppModule {}
