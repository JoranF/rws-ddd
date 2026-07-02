import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BekendKunstwerkEntity } from './db/entities/bekend-kunstwerk.entity';
import { GeldendContractEntity } from './db/entities/geldend-contract.entity';
import { OnderhoudseisEntity } from './db/entities/onderhoudseis.entity';
import { VerwerktEventEntity } from './db/entities/verwerkt-event.entity';
import { StoringEntity } from './db/entities/storing.entity';
import { OnderhoudEntity } from './db/entities/onderhoud.entity';
import { InspectieEntity } from './db/entities/inspectie.entity';
import { FactuurEntity } from './db/entities/factuur.entity';
import { OnderhoudsSchemaEntity } from './db/entities/onderhouds-schema.entity';
import { TypeOrmStoringRepository } from './db/typeorm-storing-repository';
import { TypeOrmOnderhoudRepository } from './db/typeorm-onderhoud-repository';
import { TypeOrmSchemaRepository } from './db/typeorm-schema-repository';
import { TypeOrmContractenReadModel, TypeOrmEventDedup, TypeOrmKunstwerkenReadModel } from './db/typeorm-read-models';
import { UuidIdGenerator } from './id-generator';
import { RabbitMqEventPublisher } from './messaging/rabbitmq-event-publisher';
import { RABBITMQ_CONNECTIE, RabbitMqConnectie } from './messaging/rabbitmq-connectie';
import { ONDERHOUD_REPOSITORY, SCHEMA_REPOSITORY, STORING_REPOSITORY } from '../domain/repositories';
import { CONTRACTEN_READ_MODEL, EVENT_PUBLISHER, ID_GENERATOR, KUNSTWERKEN_READ_MODEL } from '../application/ports';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BekendKunstwerkEntity,
      GeldendContractEntity,
      OnderhoudseisEntity,
      VerwerktEventEntity,
      StoringEntity,
      OnderhoudEntity,
      InspectieEntity,
      FactuurEntity,
      OnderhoudsSchemaEntity,
    ]),
  ],
  providers: [
    TypeOrmEventDedup,
    TypeOrmKunstwerkenReadModel,
    TypeOrmContractenReadModel,
    { provide: STORING_REPOSITORY, useClass: TypeOrmStoringRepository },
    { provide: ONDERHOUD_REPOSITORY, useClass: TypeOrmOnderhoudRepository },
    { provide: SCHEMA_REPOSITORY, useClass: TypeOrmSchemaRepository },
    { provide: KUNSTWERKEN_READ_MODEL, useExisting: TypeOrmKunstwerkenReadModel },
    { provide: CONTRACTEN_READ_MODEL, useExisting: TypeOrmContractenReadModel },
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    {
      provide: EVENT_PUBLISHER,
      inject: [RABBITMQ_CONNECTIE],
      useFactory: (connectie: RabbitMqConnectie) => new RabbitMqEventPublisher(connectie.kanaal),
    },
  ],
  exports: [
    TypeOrmEventDedup,
    TypeOrmKunstwerkenReadModel,
    TypeOrmContractenReadModel,
    STORING_REPOSITORY,
    ONDERHOUD_REPOSITORY,
    SCHEMA_REPOSITORY,
    KUNSTWERKEN_READ_MODEL,
    CONTRACTEN_READ_MODEL,
    ID_GENERATOR,
    EVENT_PUBLISHER,
  ],
})
export class InfrastructureModule {}
