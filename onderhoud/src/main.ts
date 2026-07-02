import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './infrastructure/config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.poort, '0.0.0.0');
}

bootstrap().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
