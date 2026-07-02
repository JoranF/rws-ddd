import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { RABBITMQ_CONNECTIE, RabbitMqConnectie } from './rabbitmq-connectie';
import { startConsumer } from './consumer-helpers';
import { MONITORING_BINDINGS, MONITORING_QUEUE, MonitoringIncidentVerwerker } from './monitoring-incident-consumer';
import { CONTRACT_BINDINGS, CONTRACT_QUEUE, ContractVerwerker } from './contract-consumer';
import { BEHEER_BINDINGS, BEHEER_QUEUE, BeheerVerwerker } from './beheer-consumer';
import { StelDiagnose } from '../../application/diagnose/stel-diagnose';
import { TypeOrmContractenReadModel, TypeOrmEventDedup, TypeOrmKunstwerkenReadModel } from '../db/typeorm-read-models';

@Injectable()
export class ConsumersService implements OnModuleInit {
  constructor(
    @Inject(RABBITMQ_CONNECTIE) private readonly connectie: RabbitMqConnectie,
    private readonly stelDiagnose: StelDiagnose,
    private readonly kunstwerken: TypeOrmKunstwerkenReadModel,
    private readonly contracten: TypeOrmContractenReadModel,
    private readonly dedup: TypeOrmEventDedup,
  ) {}

  async onModuleInit(): Promise<void> {
    const monitoring = new MonitoringIncidentVerwerker(this.stelDiagnose, this.dedup);
    const contract = new ContractVerwerker(this.contracten, this.dedup);
    const beheer = new BeheerVerwerker(this.kunstwerken, this.dedup);
    await startConsumer(this.connectie, MONITORING_QUEUE, MONITORING_BINDINGS, (env) => monitoring.verwerk(env));
    await startConsumer(this.connectie, CONTRACT_QUEUE, CONTRACT_BINDINGS, (env) => contract.verwerk(env));
    await startConsumer(this.connectie, BEHEER_QUEUE, BEHEER_BINDINGS, (env) => beheer.verwerk(env));
  }
}
