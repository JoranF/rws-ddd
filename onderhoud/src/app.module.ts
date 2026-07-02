import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { HealthModule } from './interface/health/health.module';

@Module({
  imports: [AppConfigModule, HealthModule],
})
export class AppModule {}
