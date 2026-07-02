import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RABBITMQ_CONNECTIE, RabbitMqConnectie } from '../../infrastructure/messaging/rabbitmq-connectie';

@Injectable()
export class BrokerHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(RABBITMQ_CONNECTIE) private readonly connectie: RabbitMqConnectie,
  ) {}

  isGezond(key = 'broker') {
    const check = this.indicator.check(key);
    return this.connectie.isVerbonden() ? check.up() : check.down();
  }
}
