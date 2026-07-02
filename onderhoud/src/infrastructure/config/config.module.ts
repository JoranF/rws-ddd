import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, laadConfig } from './config';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => laadConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
