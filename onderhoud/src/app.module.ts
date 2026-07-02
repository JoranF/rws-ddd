import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/db/database.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { HealthModule } from './interface/health/health.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, MessagingModule, HealthModule],
})
export class AppModule {}
