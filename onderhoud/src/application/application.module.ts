import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { APP_CONFIG, type AppConfig } from '../infrastructure/config/config';
import { ONDERHOUD_REPOSITORY, SCHEMA_REPOSITORY, STORING_REPOSITORY } from '../domain/repositories';
import type { OnderhoudRepository, SchemaRepository, StoringRepository } from '../domain/repositories';
import { CONTRACTEN_READ_MODEL, EVENT_PUBLISHER, ID_GENERATOR, KUNSTWERKEN_READ_MODEL } from './ports';
import type { ContractenReadModel, EventPublisher, IdGenerator, KunstwerkenReadModel } from './ports';
import { MeldStoring } from './storing/meld-storing';
import { StelDiagnose } from './diagnose/stel-diagnose';
import { StartOnderhoud } from './onderhoud/start-onderhoud';
import { RegistreerInspectie } from './onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from './onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from './onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from './onderhoud/keur-factuur-goed';
import { MaakSchema } from './schema/maak-schema';
import { DienContractaanvraagIn } from './contractaanvraag/dien-contractaanvraag-in';

@Module({
  imports: [InfrastructureModule],
  providers: [
    {
      provide: MeldStoring,
      inject: [STORING_REPOSITORY, ONDERHOUD_REPOSITORY, EVENT_PUBLISHER, KUNSTWERKEN_READ_MODEL, ID_GENERATOR, APP_CONFIG],
      useFactory: (
        storingen: StoringRepository,
        onderhouden: OnderhoudRepository,
        publisher: EventPublisher,
        kunstwerken: KunstwerkenReadModel,
        ids: IdGenerator,
        config: AppConfig,
      ) => new MeldStoring(storingen, onderhouden, publisher, kunstwerken, ids, config.validatie),
    },
    {
      provide: StelDiagnose,
      inject: [ONDERHOUD_REPOSITORY, ID_GENERATOR],
      useFactory: (onderhouden: OnderhoudRepository, ids: IdGenerator) => new StelDiagnose(onderhouden, ids),
    },
    {
      provide: StartOnderhoud,
      inject: [ONDERHOUD_REPOSITORY, CONTRACTEN_READ_MODEL, EVENT_PUBLISHER, APP_CONFIG],
      useFactory: (onderhouden: OnderhoudRepository, contracten: ContractenReadModel, publisher: EventPublisher, config: AppConfig) =>
        new StartOnderhoud(onderhouden, contracten, publisher, config.validatie),
    },
    {
      provide: RegistreerInspectie,
      inject: [ONDERHOUD_REPOSITORY, ID_GENERATOR],
      useFactory: (onderhouden: OnderhoudRepository, ids: IdGenerator) => new RegistreerInspectie(onderhouden, ids),
    },
    {
      provide: RondOnderhoudAf,
      inject: [ONDERHOUD_REPOSITORY, STORING_REPOSITORY, EVENT_PUBLISHER],
      useFactory: (onderhouden: OnderhoudRepository, storingen: StoringRepository, publisher: EventPublisher) =>
        new RondOnderhoudAf(onderhouden, storingen, publisher),
    },
    {
      provide: OntvangFactuur,
      inject: [ONDERHOUD_REPOSITORY, ID_GENERATOR],
      useFactory: (onderhouden: OnderhoudRepository, ids: IdGenerator) => new OntvangFactuur(onderhouden, ids),
    },
    {
      provide: KeurFactuurGoed,
      inject: [ONDERHOUD_REPOSITORY],
      useFactory: (onderhouden: OnderhoudRepository) => new KeurFactuurGoed(onderhouden),
    },
    {
      provide: MaakSchema,
      inject: [SCHEMA_REPOSITORY, CONTRACTEN_READ_MODEL, ID_GENERATOR, APP_CONFIG],
      useFactory: (schemas: SchemaRepository, contracten: ContractenReadModel, ids: IdGenerator, config: AppConfig) =>
        new MaakSchema(schemas, contracten, ids, config.validatie),
    },
    {
      provide: DienContractaanvraagIn,
      inject: [EVENT_PUBLISHER],
      useFactory: (publisher: EventPublisher) => new DienContractaanvraagIn(publisher),
    },
  ],
  exports: [
    MeldStoring,
    StelDiagnose,
    StartOnderhoud,
    RegistreerInspectie,
    RondOnderhoudAf,
    OntvangFactuur,
    KeurFactuurGoed,
    MaakSchema,
    DienContractaanvraagIn,
  ],
})
export class ApplicationModule {}
