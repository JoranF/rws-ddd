import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { buildTypeOrmOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        ...buildTypeOrmOptions(config.databaseUrl),
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
