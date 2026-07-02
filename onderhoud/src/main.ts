import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './infrastructure/config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder().setTitle('Onderhoud-service').setVersion('0.1.0').build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.poort, '0.0.0.0');
}

bootstrap().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
