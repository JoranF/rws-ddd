import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { RABBITMQ_CONNECTIE, RabbitMqConnectie } from './rabbitmq-connectie';

@Global()
@Module({
  providers: [
    {
      provide: RABBITMQ_CONNECTIE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => RabbitMqConnectie.verbind(config.rabbitmqUrl),
    },
  ],
  exports: [RABBITMQ_CONNECTIE],
})
export class MessagingModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const connectie = this.moduleRef.get<RabbitMqConnectie>(RABBITMQ_CONNECTIE, { strict: false });
    await connectie?.sluit().catch(() => undefined);
  }
}
