import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_CONFIG, AUTH_CONFIG, laadAuthConfig, laadConfig } from './config';

/**
 * Leest env via @nestjs/config (ConfigService) indien beschikbaar, anders
 * rechtstreeks uit process.env. ConfigService is optioneel: als geen
 * ConfigModule geregistreerd is, injecteert Nest `undefined` en valt de
 * factory terug op process.env.
 */
function omgeving(config?: ConfigService): NodeJS.ProcessEnv {
  if (!config) return process.env;
  return new Proxy(process.env, {
    get: (doel, sleutel: string) => config.get<string>(sleutel) ?? doel[sleutel],
  });
}

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      inject: [{ token: ConfigService, optional: true }],
      useFactory: (config?: ConfigService) => laadConfig(omgeving(config)),
    },
    {
      provide: AUTH_CONFIG,
      inject: [{ token: ConfigService, optional: true }],
      useFactory: (config?: ConfigService) => laadAuthConfig(omgeving(config)),
    },
  ],
  exports: [APP_CONFIG, AUTH_CONFIG],
})
export class AppConfigModule {}
