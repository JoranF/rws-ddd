# Onderhoud-service Fase 1 — Implementation Plan (NestJS + TypeORM)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Herkomst:** Dit plan vervangt `2026-07-01-onderhoud-service-fase-1.md` (Fastify/Prisma).
> Zelfde bounded context, lagen, domeinlogica, use-cases en events — maar herschreven naar
> de afgesproken stack **NestJS + TypeORM** (zie `docs/vervolgstappen.md`). De domein- en
> applicatielaag zijn framework-vrij en dus vrijwel identiek; de wijzigingen zitten in
> `infrastructure` (Prisma → TypeORM), `interface` (Fastify-routes → Nest-controllers +
> exception filter) en de compositie (`main.ts`-bedrading → een Nest-module met DI-tokens).

**Goal:** Bouw de Onderhoud bounded context (Fase 1) als zelfstandig draaiende NestJS-service: drie aggregates (Storing, Onderhoud, OnderhoudsSchema), twee instappunten (MeldStoring + StelDiagnose), alle 4 gepubliceerde events, idempotente consumers voor Monitoring/Contract/Beheer, een Anti-Corruption Layer voor externe aannemersfacturen, REST + OpenAPI, en Docker.

**Architecture:** Vier lagen met de afhankelijkheidsregel naar binnen (`interface → application → domain`, `infrastructure → domain/application`). `domain` en `application` zijn **puur TypeScript** (geen Nest/TypeORM/amqplib-imports); ze worden via een Nest-module bedraad met DI-tokens en `useFactory`-providers, zodat ze los testbaar blijven met in-memory fakes. TypeORM/amqplib/Nest-controllers leven alleen in `infrastructure`/`interface`. Bouwvolgorde: walking skeleton (Nest-app/DB/broker/health) → domein met TDD → applicatie-use-cases met fakes → infrastructure (TypeORM-repos, publisher, consumers, ACL) → interface (controllers + filter) → compositie-module + OpenAPI → Docker.

**Tech Stack:** Node.js 22, TypeScript (CommonJS + decorators), **NestJS 11** (`@nestjs/platform-express`), **TypeORM 0.3** + `@nestjs/typeorm` + `pg` (PostgreSQL `onderhoud_db`), `@nestjs/swagger` (OpenAPI), `amqplib` (RabbitMQ topic-exchange `rws.events`), `uuid`, **Jest** + `ts-jest` + `@nestjs/testing` + `supertest`.

## Global Constraints

- Poort **8003** via `SERVICE_PORT`; DB via `DATABASE_URL` (`postgres://rws:rws@postgres:5432/onderhoud_db`); broker via `RABBITMQ_URL` (`amqp://rws:rws@rabbitmq:5672`).
- `GET /health` geeft `200` zodra DB- en broker-connectie er zijn (`503` als er één wegvalt). `/health` staat **buiten** het `/api`-prefix.
- Alle REST onder basispad **`/api`** (Nest global prefix `api`, met `health` uitgezonderd). OpenAPI-UI op **`/api/docs`**.
- Events publiceren op durable topic-exchange **`rws.events`**, routing key `onderhoud.<aggregate>.<event>`, met de vaste envelope: `{ eventId (uuid), eventType, occurredAt (ISO-8601 UTC), producer:"onderhoud", version:1, data }`.
- Gepubliceerde events (exact deze 4, payloads uit `docs/events.md`): `onderhoud.storing.gemeld`, `onderhoud.onderhoud.gestart`, `onderhoud.onderhoud.afgerond`, `onderhoud.contractaanvraag.ingediend`.
- Geconsumeerde events: `monitoring.incident.aangemaakt`, `contract.onderhoudscontract.gegund` (+ `.afgerond`), `beheer.kunstwerk.*`, `beheer.onderhoudseisen.vastgesteld`. Consumers zijn **idempotent** (dedupe op `eventId` in tabel `verwerkt_event`).
- Ubiquitous language uit `onderhoud/README.md`: Storing (StoringId) · Diagnose · Onderhoud (OnderhoudId) · OnderhoudsSchema (SchemaId) · Inspectie · Factuur (FactuurId) · AannemerId · Status. `kunstwerkId`/`contractId`/`incidentId` zijn referenties naar andere contexts — nooit hun model kopiëren.
- `ernst` volgt de enum uit het verslag: **Laag / Middel / Hoog / Kritiek**.
- Vertaal inkomende events en externe aannemersformaten aan de rand (`infrastructure`); envelope en externe modellen lekken nooit in `domain`.
- `domain` importeert **niets** uit `infrastructure`/`interface`/frameworks. `application` importeert **geen** Nest/TypeORM/amqplib — alleen `domain` + eigen ports.
- `VALIDATIE` = `soepel` (default, Fase 1: onbekend kunstwerk/contract → waarschuwing) of `streng` (Fase 2: weigeren).
- Bedragen als gehele **centen** (integer); valuta `EUR`.
- Werk op branch `onderhoud-service`. Commit na elke taak.

## File Structure

```
onderhoud/
  package.json  tsconfig.json  tsconfig.build.json  nest-cli.json  jest.config.js  .gitignore  .dockerignore  Dockerfile
  src/
    main.ts                              # Nest bootstrap (global prefix, swagger, listen)
    onderhoud.module.ts                  # compositie-root: imports, providers (DI-tokens + factories), controllers
    di-tokens.ts                         # framework-vrije injectietokens (strings)
    domain/                              # PUUR TS — geen framework-imports
      gedeeld/{fouten,waarden,aggregate-root,domain-events}.ts
      storing/storing.ts
      diagnose/diagnose.ts
      onderhoud/onderhoud.ts
      schema/onderhouds-schema.ts
      repositories.ts
    application/                         # PUUR TS — plain classes, constructor-injectie
      ports.ts
      storing/meld-storing.ts
      diagnose/stel-diagnose.ts
      onderhoud/{start-onderhoud,registreer-inspectie,rond-onderhoud-af,ontvang-factuur,keur-factuur-goed}.ts
      schema/maak-schema.ts
      contractaanvraag/dien-contractaanvraag-in.ts
    infrastructure/
      config.ts                          # laadConfig(env) + APP_CONFIG-token (framework-vrij)
      id-generator.ts                    # UuidIdGenerator
      db/
        data-source.ts                   # TypeORM DataSource-opties (ook voor de CLI)
        entities/*.entity.ts             # TypeORM-entiteiten (read-models + domein)
        migrations/*.ts                  # init + domeintabellen
        typeorm-*-repository.ts          # repo-implementaties + pure mappers
        typeorm-read-models.ts           # read-models + dedup
      messaging/
        rabbitmq-connection.ts           # @Injectable connectie + RWS_EXCHANGE
        rabbitmq-event-publisher.ts      # envelope-publisher (framework-vrij, kanaal via getter)
        consumer-helpers.ts              # Envelope, EventDedup, startConsumer
        {monitoring-incident,contract,beheer}-consumer.ts   # verwerkers
        consumers.service.ts             # @Injectable OnApplicationBootstrap — start de 3 consumers
      acl/aannemer-factuur-vertaler.ts   # ACL externe factuur → intern command
    interface/
      health.controller.ts
      domein-fout.filter.ts              # DomeinFout→400/404, AclFout→422
      storing.controller.ts  onderhoud.controller.ts  diagnose.controller.ts
      schema.controller.ts  extern.controller.ts  contractaanvraag.controller.ts
  test/
    setup reflect-metadata via jest.config
    domain/*.spec.ts  application/*.spec.ts  infrastructure/*.spec.ts  interface/*.spec.ts  support/fakes.ts
```

---

### Task 1: Projectscaffold + config + statische `/health` (walking skeleton)

Een NestJS-app die op 8003 draait met een statische `HealthController`. Nog geen DB/broker.

**Files:**
- Create: `onderhoud/package.json`
- Create: `onderhoud/tsconfig.json`
- Create: `onderhoud/tsconfig.build.json`
- Create: `onderhoud/nest-cli.json`
- Create: `onderhoud/jest.config.js`
- Create: `onderhoud/.gitignore`
- Create: `onderhoud/src/infrastructure/config.ts`
- Create: `onderhoud/src/interface/health.controller.ts`
- Create: `onderhoud/src/onderhoud.module.ts`
- Create: `onderhoud/src/main.ts`
- Test: `onderhoud/test/infrastructure/config.spec.ts`

**Interfaces:**
- Produces: `interface Config { poort: number; databaseUrl: string; rabbitmqUrl: string; validatie: 'soepel' | 'streng' }`, `laadConfig(env: NodeJS.ProcessEnv): Config`, en `const APP_CONFIG = 'APP_CONFIG'`.
- Produces: `class HealthController` (`GET /health`), `class OnderhoudModule`.

- [ ] **Step 1: Branch controleren + `package.json`**

De branch `onderhoud-service` bestaat al (afgetakt van `main`). Controleer met `git status` dat je erop staat.

`onderhoud/package.json`:
```json
{
  "name": "onderhoud-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:watch": "jest --watch",
    "migration:run": "typeorm-ts-node-commonjs migration:run -d src/infrastructure/db/data-source.ts",
    "migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/infrastructure/db/data-source.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.1",
    "@nestjs/core": "^11.0.1",
    "@nestjs/platform-express": "^11.0.1",
    "@nestjs/swagger": "^11.0.0",
    "@nestjs/typeorm": "^11.0.0",
    "amqplib": "^0.10.5",
    "pg": "^8.13.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.20",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.1",
    "@types/amqplib": "^0.10.6",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: TypeScript- en Nest-config**

`onderhoud/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "moduleResolution": "node",
    "declaration": false,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`onderhoud/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

`onderhoud/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

`onderhoud/jest.config.js`:
```js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.ts'],
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
};
```

`onderhoud/.gitignore`:
```
node_modules/
dist/
.env
*.tsbuildinfo
```

- [ ] **Step 3: Write the failing test voor config**

`onderhoud/test/infrastructure/config.spec.ts`:
```ts
import { laadConfig } from '../../src/infrastructure/config';

describe('laadConfig', () => {
  const basis = {
    SERVICE_PORT: '8003',
    DATABASE_URL: 'postgres://rws:rws@postgres:5432/onderhoud_db',
    RABBITMQ_URL: 'amqp://rws:rws@rabbitmq:5672',
  };

  it('leest de poort als getal en gebruikt soepele validatie als default', () => {
    const config = laadConfig(basis);
    expect(config.poort).toBe(8003);
    expect(config.validatie).toBe('soepel');
  });

  it('zet validatie op streng als de env-var dat vraagt', () => {
    expect(laadConfig({ ...basis, VALIDATIE: 'streng' }).validatie).toBe('streng');
  });

  it('gooit als een verplichte variabele ontbreekt', () => {
    expect(() => laadConfig({ ...basis, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd onderhoud && npm install && npm test -- config`
Expected: FAIL — `laadConfig` bestaat nog niet.

- [ ] **Step 5: Implementeer `config.ts`**

`onderhoud/src/infrastructure/config.ts`:
```ts
export const APP_CONFIG = 'APP_CONFIG';

export interface Config {
  poort: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  validatie: 'soepel' | 'streng';
}

function verplicht(env: NodeJS.ProcessEnv, naam: string): string {
  const waarde = env[naam];
  if (!waarde) throw new Error(`Ontbrekende omgevingsvariabele: ${naam}`);
  return waarde;
}

export function laadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    poort: Number(env.SERVICE_PORT ?? '8003'),
    databaseUrl: verplicht(env, 'DATABASE_URL'),
    rabbitmqUrl: verplicht(env, 'RABBITMQ_URL'),
    validatie: env.VALIDATIE === 'streng' ? 'streng' : 'soepel',
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS (3 tests).

- [ ] **Step 7: HealthController (statisch) + module + bootstrap**

`onderhoud/src/interface/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  async check(): Promise<{ status: string; db: boolean; broker: boolean }> {
    return { status: 'ok', db: true, broker: true };
  }
}
```

`onderhoud/src/onderhoud.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './interface/health.controller';
import { APP_CONFIG, laadConfig } from './infrastructure/config';

@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_CONFIG, useFactory: () => laadConfig(process.env) }],
})
export class OnderhoudModule {}
```

`onderhoud/src/main.ts`:
```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { OnderhoudModule } from './onderhoud.module';
import { APP_CONFIG, type Config } from './infrastructure/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(OnderhoudModule);
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  const config = app.get<Config>(APP_CONFIG);
  await app.listen(config.poort, '0.0.0.0');
}

bootstrap().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
```

- [ ] **Step 8: Manuele verificatie**

Run: `SERVICE_PORT=8003 DATABASE_URL=x RABBITMQ_URL=x npx ts-node -r tsconfig-paths/register src/main.ts` — of eenvoudiger `npm run build && SERVICE_PORT=8003 DATABASE_URL=x RABBITMQ_URL=x node dist/main.js`; in een tweede shell `curl -s localhost:8003/health`.
Expected: `{"status":"ok","db":true,"broker":true}` en HTTP 200. Stop de server.

- [ ] **Step 9: Commit**

```bash
git add onderhoud/package.json onderhoud/tsconfig*.json onderhoud/nest-cli.json onderhoud/jest.config.js onderhoud/.gitignore onderhoud/src onderhoud/test
git commit -m "feat(onderhoud): scaffold NestJS-skeleton met config en statische /health"
```

---

### Task 2: TypeORM-bootstrap + read-modelentiteiten + DB-health

Verbind met `onderhoud_db` via TypeORM en laat `/health` de DB checken. Nu alleen de read-model-/idempotentietabellen; domeintabellen volgen in Task 11.

**Files:**
- Create: `onderhoud/src/infrastructure/db/entities/bekend-kunstwerk.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/geldend-contract.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/onderhoudseis.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/verwerkt-event.entity.ts`
- Create: `onderhoud/src/infrastructure/db/migrations/1720000000000-init-readmodel.ts`
- Create: `onderhoud/src/infrastructure/db/data-source.ts`
- Modify: `onderhoud/src/onderhoud.module.ts` (TypeOrmModule.forRootAsync)
- Modify: `onderhoud/src/interface/health.controller.ts` (DB-check)
- Modify: `onderhoud/.env.example` (var `VALIDATIE` toevoegen)

**Interfaces:**
- Consumes: `laadConfig`/`APP_CONFIG` (Task 1).
- Produces: entiteiten `BekendKunstwerkEntity`, `GeldendContractEntity`, `OnderhoudseisEntity`, `VerwerktEventEntity`; `alleEntiteiten: Function[]`; `dataSourceOpties(databaseUrl: string): DataSourceOptions`.

- [ ] **Step 1: Read-modelentiteiten**

`onderhoud/src/infrastructure/db/entities/bekend-kunstwerk.entity.ts`:
```ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'bekend_kunstwerk' })
export class BekendKunstwerkEntity {
  @PrimaryColumn({ name: 'kunstwerk_id' })
  kunstwerkId!: string;

  @Column({ type: 'text', nullable: true })
  type!: string | null;

  @Column({ type: 'text', nullable: true })
  locatie!: string | null;

  @Column({ name: 'in_gebruik', type: 'boolean', default: true })
  inGebruik!: boolean;

  @UpdateDateColumn({ name: 'bijgewerkt_op' })
  bijgewerktOp!: Date;
}
```

`onderhoud/src/infrastructure/db/entities/geldend-contract.entity.ts`:
```ts
import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'geldend_contract' })
export class GeldendContractEntity {
  @PrimaryColumn({ name: 'contract_id' })
  contractId!: string;

  @Index()
  @Column({ name: 'kunstwerk_id' })
  kunstwerkId!: string;

  @Column()
  opdrachtnemer!: string;

  @Column({ name: 'looptijd_start', type: 'timestamptz', nullable: true })
  looptijdStart!: Date | null;

  @Column({ name: 'looptijd_eind', type: 'timestamptz', nullable: true })
  looptijdEind!: Date | null;

  @Column({ type: 'boolean', default: true })
  actief!: boolean;

  @UpdateDateColumn({ name: 'bijgewerkt_op' })
  bijgewerktOp!: Date;
}
```

`onderhoud/src/infrastructure/db/entities/onderhoudseis.entity.ts`:
```ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'onderhoudseis' })
export class OnderhoudseisEntity {
  @PrimaryColumn({ name: 'kunstwerk_id' })
  kunstwerkId!: string;

  @Column({ type: 'jsonb' })
  eisen!: unknown;

  @UpdateDateColumn({ name: 'bijgewerkt_op' })
  bijgewerktOp!: Date;
}
```

`onderhoud/src/infrastructure/db/entities/verwerkt-event.entity.ts`:
```ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'verwerkt_event' })
export class VerwerktEventEntity {
  @PrimaryColumn({ name: 'event_id' })
  eventId!: string;

  @CreateDateColumn({ name: 'verwerkt_op' })
  verwerktOp!: Date;
}
```

- [ ] **Step 2: Init-migratie (read-models + idempotentie)**

`onderhoud/src/infrastructure/db/migrations/1720000000000-init-readmodel.ts`:
```ts
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class InitReadmodel1720000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'bekend_kunstwerk',
        columns: [
          { name: 'kunstwerk_id', type: 'varchar', isPrimary: true },
          { name: 'type', type: 'text', isNullable: true },
          { name: 'locatie', type: 'text', isNullable: true },
          { name: 'in_gebruik', type: 'boolean', default: true },
          { name: 'bijgewerkt_op', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: 'geldend_contract',
        columns: [
          { name: 'contract_id', type: 'varchar', isPrimary: true },
          { name: 'kunstwerk_id', type: 'varchar' },
          { name: 'opdrachtnemer', type: 'varchar' },
          { name: 'looptijd_start', type: 'timestamptz', isNullable: true },
          { name: 'looptijd_eind', type: 'timestamptz', isNullable: true },
          { name: 'actief', type: 'boolean', default: true },
          { name: 'bijgewerkt_op', type: 'timestamptz', default: 'now()' },
        ],
        indices: [{ name: 'idx_geldend_contract_kunstwerk', columnNames: ['kunstwerk_id'] }],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: 'onderhoudseis',
        columns: [
          { name: 'kunstwerk_id', type: 'varchar', isPrimary: true },
          { name: 'eisen', type: 'jsonb' },
          { name: 'bijgewerkt_op', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: 'verwerkt_event',
        columns: [
          { name: 'event_id', type: 'varchar', isPrimary: true },
          { name: 'verwerkt_op', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('verwerkt_event');
    await queryRunner.dropTable('onderhoudseis');
    await queryRunner.dropTable('geldend_contract');
    await queryRunner.dropTable('bekend_kunstwerk');
  }
}
```

- [ ] **Step 3: DataSource-opties (herbruikt door module én CLI)**

`onderhoud/src/infrastructure/db/data-source.ts`:
```ts
import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { BekendKunstwerkEntity } from './entities/bekend-kunstwerk.entity';
import { GeldendContractEntity } from './entities/geldend-contract.entity';
import { OnderhoudseisEntity } from './entities/onderhoudseis.entity';
import { VerwerktEventEntity } from './entities/verwerkt-event.entity';
import { InitReadmodel1720000000000 } from './migrations/1720000000000-init-readmodel';

// Domeinentiteiten en hun migratie worden in Task 11 toegevoegd.
export const alleEntiteiten = [
  BekendKunstwerkEntity,
  GeldendContractEntity,
  OnderhoudseisEntity,
  VerwerktEventEntity,
];

export const alleMigraties = [InitReadmodel1720000000000];

export function dataSourceOpties(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: alleEntiteiten,
    migrations: alleMigraties,
    synchronize: false,
  };
}

// Default export voor de TypeORM-CLI (`npm run migration:run`).
export default new DataSource(
  dataSourceOpties(process.env.DATABASE_URL ?? 'postgres://rws:rws@localhost:5432/onderhoud_db'),
);
```

- [ ] **Step 4: `.env.example` bijwerken**

`onderhoud/.env.example`:
```
# Onderhoud service — kopieer naar .env
SERVICE_PORT=8003
DATABASE_URL=postgres://rws:rws@postgres:5432/onderhoud_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
VALIDATIE=soepel
```

- [ ] **Step 5: TypeOrmModule koppelen in de module**

`onderhoud/src/onderhoud.module.ts` (vervang de inhoud):
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './interface/health.controller';
import { APP_CONFIG, laadConfig, type Config } from './infrastructure/config';
import { dataSourceOpties } from './infrastructure/db/data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Config) => ({
        ...dataSourceOpties(config.databaseUrl),
        migrationsRun: true,
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_CONFIG, useFactory: () => laadConfig(process.env) }],
})
export class OnderhoudModule {}
```

> `APP_CONFIG` moet beschikbaar zijn vóór `TypeOrmModule.forRootAsync` het injecteert. Omdat providers in dezelfde module zichtbaar zijn voor `forRootAsync`, werkt dit; als Nest klaagt over volgorde, verplaats de `APP_CONFIG`-provider naar een kleine `ConfigModule` die je importeert en exporteert.

- [ ] **Step 6: DB-health in de controller**

`onderhoud/src/interface/health.controller.ts` (vervang de inhoud):
```ts
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<{ status: string; db: boolean; broker: boolean }> {
    const db = await this.dataSource
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
    const broker = true; // wordt in Task 3 een echte check
    const gezond = db && broker;
    res.status(gezond ? 200 : 503);
    return { status: gezond ? 'ok' : 'degraded', db, broker };
  }
}
```

- [ ] **Step 7: Migratie + manuele verificatie**

Start de gedeelde infra vanuit de repo-root: `docker compose up -d postgres`.
Run (in `onderhoud/`): `cp .env.example .env` en pas in `.env` de `DATABASE_URL`-host aan naar `localhost`. Dan `DATABASE_URL=postgres://rws:rws@localhost:5432/onderhoud_db npm run migration:run`.
Expected: migratie `InitReadmodel1720000000000` draait; tabellen `bekend_kunstwerk`, `geldend_contract`, `onderhoudseis`, `verwerkt_event` bestaan.
Start daarna `npm run build && node dist/main.js` en `curl -s localhost:8003/health` → `{"status":"ok","db":true,...}`; zet postgres stil → `db:false` en HTTP 503.

- [ ] **Step 8: Commit**

```bash
git add onderhoud/src/infrastructure/db onderhoud/src/onderhoud.module.ts onderhoud/src/interface/health.controller.ts onderhoud/.env.example
git commit -m "feat(onderhoud): TypeORM-bootstrap met read-modelentiteiten en DB-health"
```

---

### Task 3: RabbitMQ-connectie + broker-health

Bewijs broker-connectiviteit als `@Injectable` provider met lifecycle-hooks. Nog geen event-mapping (publisher volgt in Task 12, consumers in Task 13/17).

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/rabbitmq-connection.ts`
- Modify: `onderhoud/src/onderhoud.module.ts` (provider + export)
- Modify: `onderhoud/src/interface/health.controller.ts` (broker-check)

**Interfaces:**
- Consumes: `APP_CONFIG`/`Config` (Task 1).
- Produces: `class RabbitMqConnection implements OnModuleInit, OnModuleDestroy { verbind(): Promise<void>; get kanaal(): Channel; isVerbonden(): boolean }` en constante `RWS_EXCHANGE = 'rws.events'`.

- [ ] **Step 1: Connectiemodule**

`onderhoud/src/infrastructure/messaging/rabbitmq-connection.ts`:
```ts
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { APP_CONFIG, type Config } from '../config';

export const RWS_EXCHANGE = 'rws.events';

@Injectable()
export class RabbitMqConnection implements OnModuleInit, OnModuleDestroy {
  private verbinding?: ChannelModel;
  private ch?: Channel;

  constructor(@Inject(APP_CONFIG) private readonly config: Config) {}

  async onModuleInit(): Promise<void> {
    await this.verbind();
  }

  async verbind(): Promise<void> {
    this.verbinding = await amqp.connect(this.config.rabbitmqUrl);
    this.ch = await this.verbinding.createChannel();
    await this.ch.assertExchange(RWS_EXCHANGE, 'topic', { durable: true });
  }

  get kanaal(): Channel {
    if (!this.ch) throw new Error('RabbitMQ-kanaal nog niet verbonden');
    return this.ch;
  }

  isVerbonden(): boolean {
    return this.ch !== undefined;
  }

  async onModuleDestroy(): Promise<void> {
    await this.ch?.close().catch(() => undefined);
    await this.verbinding?.close().catch(() => undefined);
  }
}
```

- [ ] **Step 2: Provider registreren + broker-health**

Voeg in `onderhoud/src/onderhoud.module.ts` `RabbitMqConnection` toe aan `providers` (en aan `exports`, zodat latere features hem kunnen injecteren):
```ts
import { RabbitMqConnection } from './infrastructure/messaging/rabbitmq-connection';
// ...
  providers: [
    { provide: APP_CONFIG, useFactory: () => laadConfig(process.env) },
    RabbitMqConnection,
  ],
  exports: [RabbitMqConnection],
```

`onderhoud/src/interface/health.controller.ts` — injecteer de connectie en vervang de broker-regel:
```ts
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { RabbitMqConnection } from '../infrastructure/messaging/rabbitmq-connection';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbit: RabbitMqConnection,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<{ status: string; db: boolean; broker: boolean }> {
    const db = await this.dataSource
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
    const broker = this.rabbit.isVerbonden();
    const gezond = db && broker;
    res.status(gezond ? 200 : 503);
    return { status: gezond ? 'ok' : 'degraded', db, broker };
  }
}
```

- [ ] **Step 3: Manuele verificatie**

Run: repo-root `docker compose up -d rabbitmq postgres`; dan in `onderhoud/` `npm run build && node dist/main.js`; `curl -s localhost:8003/health`.
Expected: `{"status":"ok","db":true,"broker":true}`. Open `http://localhost:15672` (rws/rws) → exchange `rws.events` bestaat (type topic, durable).

- [ ] **Step 4: Commit**

```bash
git add onderhoud/src/infrastructure/messaging onderhoud/src/onderhoud.module.ts onderhoud/src/interface/health.controller.ts
git commit -m "feat(onderhoud): RabbitMQ-connectie als provider en broker-health"
```

---
### Task 4: Domein — value objects

Pure value objects met invarianten. Volledig TDD; geen framework-imports.

**Files:**
- Create: `onderhoud/src/domain/gedeeld/fouten.ts`
- Create: `onderhoud/src/domain/gedeeld/waarden.ts`
- Test: `onderhoud/test/domain/waarden.spec.ts`

**Interfaces:**
- Produces: `class DomeinFout extends Error`.
- Produces: identiteiten `StoringId`, `OnderhoudId`, `SchemaId`, `FactuurId`, `InspectieId`, `KunstwerkId`, `ContractId`, `IncidentId`, `AannemerId` (elk: `static van(waarde: string)`, `readonly waarde: string`, `gelijkAan(a): boolean`).
- Produces: `type Ernst = 'Laag' | 'Middel' | 'Hoog' | 'Kritiek'` + `ernstVan(waarde: string): Ernst`.
- Produces: `class Bedrag { static vanEuro(euro, valuta?); static vanCenten(centen, valuta?); readonly centen; readonly valuta; get euro() }`.
- Produces: `class Periode { static van(start, eind); readonly start; readonly eind; bevat(datum): boolean }`.

- [ ] **Step 1: Write the failing tests**

`onderhoud/test/domain/waarden.spec.ts`:
```ts
import { Bedrag, ernstVan, KunstwerkId, Periode, StoringId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

describe('identiteiten', () => {
  it('weigert een lege waarde', () => {
    expect(() => StoringId.van('')).toThrow(DomeinFout);
  });
  it('is gelijk bij dezelfde waarde en hetzelfde type', () => {
    expect(StoringId.van('S-1').gelijkAan(StoringId.van('S-1'))).toBe(true);
    expect(KunstwerkId.van('KW-1').gelijkAan(KunstwerkId.van('KW-2'))).toBe(false);
  });
});

describe('ernstVan', () => {
  it('accepteert de vier niveaus uit het verslag', () => {
    expect(ernstVan('Kritiek')).toBe('Kritiek');
    expect(ernstVan('Laag')).toBe('Laag');
  });
  it('weigert een onbekend niveau', () => {
    expect(() => ernstVan('Enorm')).toThrow(DomeinFout);
  });
});

describe('Bedrag', () => {
  it('rekent euro naar centen', () => {
    expect(Bedrag.vanEuro(12.5).centen).toBe(1250);
  });
  it('weigert een negatief bedrag en niet-gehele centen', () => {
    expect(() => Bedrag.vanEuro(-1)).toThrow(DomeinFout);
    expect(() => Bedrag.vanCenten(1.5)).toThrow(DomeinFout);
  });
});

describe('Periode', () => {
  it('weigert een eind vóór het begin', () => {
    expect(() => Periode.van(new Date('2026-06-01'), new Date('2026-01-01'))).toThrow(DomeinFout);
  });
  it('bevat een datum binnen de periode', () => {
    const p = Periode.van(new Date('2026-01-01'), new Date('2026-12-31'));
    expect(p.bevat(new Date('2026-06-01'))).toBe(true);
    expect(p.bevat(new Date('2027-01-01'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- waarden`
Expected: FAIL — modules bestaan nog niet.

- [ ] **Step 3: Implementeer `fouten.ts`**

`onderhoud/src/domain/gedeeld/fouten.ts`:
```ts
export class DomeinFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = 'DomeinFout';
  }
}
```

- [ ] **Step 4: Implementeer `waarden.ts`**

`onderhoud/src/domain/gedeeld/waarden.ts`:
```ts
import { DomeinFout } from './fouten';

abstract class Identiteit {
  protected constructor(readonly waarde: string) {}
  gelijkAan(andere: Identiteit): boolean {
    return this.constructor === andere.constructor && this.waarde === andere.waarde;
  }
}

function eisNietLeeg(waarde: string, veld: string): string {
  if (!waarde || waarde.trim() === '') throw new DomeinFout(`${veld} mag niet leeg zijn`);
  return waarde;
}

export class StoringId extends Identiteit {
  static van(waarde: string): StoringId { return new StoringId(eisNietLeeg(waarde, 'storingId')); }
}
export class OnderhoudId extends Identiteit {
  static van(waarde: string): OnderhoudId { return new OnderhoudId(eisNietLeeg(waarde, 'onderhoudId')); }
}
export class SchemaId extends Identiteit {
  static van(waarde: string): SchemaId { return new SchemaId(eisNietLeeg(waarde, 'schemaId')); }
}
export class FactuurId extends Identiteit {
  static van(waarde: string): FactuurId { return new FactuurId(eisNietLeeg(waarde, 'factuurId')); }
}
export class InspectieId extends Identiteit {
  static van(waarde: string): InspectieId { return new InspectieId(eisNietLeeg(waarde, 'inspectieId')); }
}
export class KunstwerkId extends Identiteit {
  static van(waarde: string): KunstwerkId { return new KunstwerkId(eisNietLeeg(waarde, 'kunstwerkId')); }
}
export class ContractId extends Identiteit {
  static van(waarde: string): ContractId { return new ContractId(eisNietLeeg(waarde, 'contractId')); }
}
export class IncidentId extends Identiteit {
  static van(waarde: string): IncidentId { return new IncidentId(eisNietLeeg(waarde, 'incidentId')); }
}
export class AannemerId extends Identiteit {
  static van(waarde: string): AannemerId { return new AannemerId(eisNietLeeg(waarde, 'aannemerId')); }
}

const ERNST_NIVEAUS = ['Laag', 'Middel', 'Hoog', 'Kritiek'] as const;
export type Ernst = (typeof ERNST_NIVEAUS)[number];

export function ernstVan(waarde: string): Ernst {
  if (!(ERNST_NIVEAUS as readonly string[]).includes(waarde)) {
    throw new DomeinFout(`onbekende ernst: ${waarde} (verwacht: ${ERNST_NIVEAUS.join('/')})`);
  }
  return waarde as Ernst;
}

export class Bedrag {
  private constructor(readonly centen: number, readonly valuta: string) {}

  static vanCenten(centen: number, valuta = 'EUR'): Bedrag {
    if (!Number.isInteger(centen)) throw new DomeinFout('centen moet een geheel getal zijn');
    if (centen < 0) throw new DomeinFout('bedrag mag niet negatief zijn');
    return new Bedrag(centen, valuta);
  }
  static vanEuro(euro: number, valuta = 'EUR'): Bedrag {
    return Bedrag.vanCenten(Math.round(euro * 100), valuta);
  }
  get euro(): number { return this.centen / 100; }
}

export class Periode {
  private constructor(readonly start: Date, readonly eind: Date) {}
  static van(start: Date, eind: Date): Periode {
    if (eind.getTime() <= start.getTime()) throw new DomeinFout('eind moet na start liggen');
    return new Periode(start, eind);
  }
  bevat(datum: Date): boolean {
    return datum.getTime() >= this.start.getTime() && datum.getTime() <= this.eind.getTime();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- waarden`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/domain/gedeeld onderhoud/test/domain/waarden.spec.ts
git commit -m "feat(onderhoud): domein-value-objects met invarianten"
```

---

### Task 5: Domein — AggregateRoot + event-definities

**Files:**
- Create: `onderhoud/src/domain/gedeeld/aggregate-root.ts`
- Create: `onderhoud/src/domain/gedeeld/domain-events.ts`
- Test: `onderhoud/test/domain/aggregate-root.spec.ts`

**Interfaces:**
- Produces: `interface DomainEvent { eventType: string; data: Record<string, unknown> }`.
- Produces: `type OnderhoudDomainEvent` — union met `eventType`-waarden: `onderhoud.storing.gemeld`, `onderhoud.onderhoud.gestart`, `onderhoud.onderhoud.afgerond`, `onderhoud.contractaanvraag.ingediend`.
- Produces: `abstract class AggregateRoot { protected registreerEvent(e: OnderhoudDomainEvent): void; trekEventsLeeg(): OnderhoudDomainEvent[] }`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/domain/aggregate-root.spec.ts`:
```ts
import { AggregateRoot } from '../../src/domain/gedeeld/aggregate-root';
import type { OnderhoudDomainEvent } from '../../src/domain/gedeeld/domain-events';

class Test extends AggregateRoot {
  doe(): void {
    this.registreerEvent({
      eventType: 'onderhoud.storing.gemeld',
      data: { storingId: 'S1', kunstwerkId: 'KW1', omschrijving: 'brugdek trilt' },
    });
  }
}

describe('AggregateRoot', () => {
  it('verzamelt events en trekt ze daarna leeg', () => {
    const t = new Test();
    t.doe();
    const events: OnderhoudDomainEvent[] = t.trekEventsLeeg();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('onderhoud.storing.gemeld');
    expect(t.trekEventsLeeg()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aggregate-root`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `domain-events.ts`**

`onderhoud/src/domain/gedeeld/domain-events.ts`:
```ts
export interface DomainEvent {
  eventType: string;
  data: Record<string, unknown>;
}

export interface StoringGemeld extends DomainEvent {
  eventType: 'onderhoud.storing.gemeld';
  data: { storingId: string; kunstwerkId: string; omschrijving: string };
}
export interface OnderhoudGestart extends DomainEvent {
  eventType: 'onderhoud.onderhoud.gestart';
  data: { onderhoudId: string; kunstwerkId: string; datum: string };
}
export interface OnderhoudAfgerond extends DomainEvent {
  eventType: 'onderhoud.onderhoud.afgerond';
  data: { onderhoudId: string; kunstwerkId: string; resultaat: string; datum: string };
}
export interface ContractaanvraagIngediend extends DomainEvent {
  eventType: 'onderhoud.contractaanvraag.ingediend';
  data: { kunstwerkId: string; aanleiding: string };
}

export type OnderhoudDomainEvent =
  | StoringGemeld
  | OnderhoudGestart
  | OnderhoudAfgerond
  | ContractaanvraagIngediend;
```

- [ ] **Step 4: Implementeer `aggregate-root.ts`**

`onderhoud/src/domain/gedeeld/aggregate-root.ts`:
```ts
import type { OnderhoudDomainEvent } from './domain-events';

export abstract class AggregateRoot {
  private events: OnderhoudDomainEvent[] = [];

  protected registreerEvent(event: OnderhoudDomainEvent): void {
    this.events.push(event);
  }

  trekEventsLeeg(): OnderhoudDomainEvent[] {
    const uit = this.events;
    this.events = [];
    return uit;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- aggregate-root`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/domain/gedeeld/aggregate-root.ts onderhoud/src/domain/gedeeld/domain-events.ts onderhoud/test/domain/aggregate-root.spec.ts
git commit -m "feat(onderhoud): AggregateRoot en domain-event-definities"
```

---

### Task 6: Domein — Storing-aggregate + diagnose-regel

Instappunt 1: een gemelde storing. Plus de domeinregel die bepaalt wanneer een storing/diagnose een onderhoudstraject vereist (Hoog/Kritiek).

**Files:**
- Create: `onderhoud/src/domain/storing/storing.ts`
- Create: `onderhoud/src/domain/diagnose/diagnose.ts`
- Test: `onderhoud/test/domain/storing.spec.ts`

**Interfaces:**
- Produces: `type StoringStatus = 'Gemeld' | 'InBehandeling' | 'Afgehandeld'`.
- Produces: `class Storing extends AggregateRoot` met `static meld(...)`, `koppelAanOnderhoud(onderhoudId)`, `handelAf()`, getters `id/kunstwerkId/omschrijving/ernst/status/onderhoudId`, `static herstel(...)`.
- Produces: `interface Diagnose { incidentId?: IncidentId; bevinding: string; ernst: Ernst }` en `vereistOnderhoud(ernst: Ernst): boolean` (true bij `Hoog`/`Kritiek`).

- [ ] **Step 1: Write the failing test**

`onderhoud/test/domain/storing.spec.ts`:
```ts
import { Storing } from '../../src/domain/storing/storing';
import { vereistOnderhoud } from '../../src/domain/diagnose/diagnose';
import { KunstwerkId, OnderhoudId, StoringId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

function nieuweStoring(): Storing {
  return Storing.meld({
    id: StoringId.van('S1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    omschrijving: 'brugdek trilt',
    ernst: 'Hoog',
  });
}

describe('Storing', () => {
  it('registreert een gemeld-event bij melden', () => {
    const s = nieuweStoring();
    const events = s.trekEventsLeeg();
    expect(events.map((e) => e.eventType)).toContain('onderhoud.storing.gemeld');
    expect(events[0].data).toEqual({ storingId: 'S1', kunstwerkId: 'KW1', omschrijving: 'brugdek trilt' });
    expect(s.status).toBe('Gemeld');
  });

  it('gaat naar InBehandeling bij koppelen aan een onderhoudstraject', () => {
    const s = nieuweStoring();
    s.koppelAanOnderhoud(OnderhoudId.van('O1'));
    expect(s.status).toBe('InBehandeling');
    expect(s.onderhoudId?.waarde).toBe('O1');
  });

  it('kan afgehandeld worden en weigert daarna mutaties', () => {
    const s = nieuweStoring();
    s.handelAf();
    expect(s.status).toBe('Afgehandeld');
    expect(() => s.handelAf()).toThrow(DomeinFout);
    expect(() => s.koppelAanOnderhoud(OnderhoudId.van('O1'))).toThrow(DomeinFout);
  });
});

describe('vereistOnderhoud', () => {
  it('vereist onderhoud bij Hoog en Kritiek, niet bij Laag en Middel', () => {
    expect(vereistOnderhoud('Kritiek')).toBe(true);
    expect(vereistOnderhoud('Hoog')).toBe(true);
    expect(vereistOnderhoud('Middel')).toBe(false);
    expect(vereistOnderhoud('Laag')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- storing`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `diagnose.ts`**

`onderhoud/src/domain/diagnose/diagnose.ts`:
```ts
import type { Ernst, IncidentId } from '../gedeeld/waarden';

export interface Diagnose {
  incidentId?: IncidentId;
  bevinding: string;
  ernst: Ernst;
}

export function vereistOnderhoud(ernst: Ernst): boolean {
  return ernst === 'Hoog' || ernst === 'Kritiek';
}
```

- [ ] **Step 4: Implementeer `storing.ts`**

`onderhoud/src/domain/storing/storing.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root';
import { DomeinFout } from '../gedeeld/fouten';
import type { Ernst, KunstwerkId, OnderhoudId, StoringId } from '../gedeeld/waarden';

export type StoringStatus = 'Gemeld' | 'InBehandeling' | 'Afgehandeld';

interface HerstelData {
  id: StoringId;
  kunstwerkId: KunstwerkId;
  omschrijving: string;
  ernst: Ernst;
  status: StoringStatus;
  onderhoudId?: OnderhoudId;
}

export class Storing extends AggregateRoot {
  private constructor(
    private readonly _id: StoringId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly _omschrijving: string,
    private readonly _ernst: Ernst,
    private _status: StoringStatus,
    private _onderhoudId: OnderhoudId | undefined,
  ) {
    super();
  }

  static meld(p: { id: StoringId; kunstwerkId: KunstwerkId; omschrijving: string; ernst: Ernst }): Storing {
    if (!p.omschrijving || p.omschrijving.trim() === '') throw new DomeinFout('omschrijving mag niet leeg zijn');
    const s = new Storing(p.id, p.kunstwerkId, p.omschrijving, p.ernst, 'Gemeld', undefined);
    s.registreerEvent({
      eventType: 'onderhoud.storing.gemeld',
      data: { storingId: p.id.waarde, kunstwerkId: p.kunstwerkId.waarde, omschrijving: p.omschrijving },
    });
    return s;
  }

  static herstel(d: HerstelData): Storing {
    return new Storing(d.id, d.kunstwerkId, d.omschrijving, d.ernst, d.status, d.onderhoudId);
  }

  get id(): StoringId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get omschrijving(): string { return this._omschrijving; }
  get ernst(): Ernst { return this._ernst; }
  get status(): StoringStatus { return this._status; }
  get onderhoudId(): OnderhoudId | undefined { return this._onderhoudId; }

  koppelAanOnderhoud(onderhoudId: OnderhoudId): void {
    if (this._status === 'Afgehandeld') throw new DomeinFout('een afgehandelde storing kan niet meer gekoppeld worden');
    this._onderhoudId = onderhoudId;
    this._status = 'InBehandeling';
  }

  handelAf(): void {
    if (this._status === 'Afgehandeld') throw new DomeinFout('storing is al afgehandeld');
    this._status = 'Afgehandeld';
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- storing`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/domain/storing onderhoud/src/domain/diagnose onderhoud/test/domain/storing.spec.ts
git commit -m "feat(onderhoud): Storing-aggregate en diagnose-regel"
```

---

### Task 7: Domein — Onderhoud-aggregate (traject met Inspectie + Factuur)

Het hart van de context: een onderhoudstraject met aanleiding (Storing óf Diagnose), start, inspecties, afronding en factuurafhandeling. Invariant: afronden vereist een goedgekeurde inspectie; een factuur goedkeuren vereist een afgerond traject.

**Files:**
- Create: `onderhoud/src/domain/onderhoud/onderhoud.ts`
- Test: `onderhoud/test/domain/onderhoud.spec.ts`

**Interfaces:**
- Produces: `type OnderhoudStatus = 'Gepland' | 'Gestart' | 'Afgerond'`.
- Produces: `type Aanleiding = { soort: 'Storing'; storingId: StoringId } | { soort: 'Diagnose'; diagnose: Diagnose }`.
- Produces: `type InspectieOordeel = 'Goedgekeurd' | 'Afgekeurd'`; `interface Inspectie { id; datum; oordeel; opmerkingen? }`.
- Produces: `type FactuurStatus = 'Ontvangen' | 'Goedgekeurd' | 'Afgekeurd'`; `interface Factuur { id; bedrag; status; ontvangenOp }`.
- Produces: `class Onderhoud extends AggregateRoot` met `static plan(...)`, `start(...)` → `onderhoud.onderhoud.gestart`, `registreerInspectie(...)`, `rondAf(...)` → `onderhoud.onderhoud.afgerond`, `ontvangFactuur(...)`, `keurFactuurGoed(...)`, getters, `static herstel(...)`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/domain/onderhoud.spec.ts`:
```ts
import { Onderhoud } from '../../src/domain/onderhoud/onderhoud';
import { Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

function nieuwTraject(): Onderhoud {
  return Onderhoud.plan({
    id: OnderhoudId.van('O1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    aanleiding: { soort: 'Storing', storingId: StoringId.van('S1') },
  });
}

function gestartTraject(): Onderhoud {
  const o = nieuwTraject();
  o.start({ datum: new Date('2026-07-01'), contractId: ContractId.van('C1') });
  o.trekEventsLeeg();
  return o;
}

describe('Onderhoud', () => {
  it('plant zonder event en start met een gestart-event', () => {
    const o = nieuwTraject();
    expect(o.status).toBe('Gepland');
    expect(o.trekEventsLeeg()).toHaveLength(0);
    o.start({ datum: new Date('2026-07-01') });
    expect(o.status).toBe('Gestart');
    const events = o.trekEventsLeeg();
    expect(events[0].eventType).toBe('onderhoud.onderhoud.gestart');
    expect(events[0].data).toEqual({ onderhoudId: 'O1', kunstwerkId: 'KW1', datum: '2026-07-01T00:00:00.000Z' });
  });

  it('weigert dubbel starten', () => {
    const o = gestartTraject();
    expect(() => o.start({ datum: new Date('2026-07-02') })).toThrow(DomeinFout);
  });

  it('weigert een inspectie op een niet-gestart traject', () => {
    const o = nieuwTraject();
    expect(() => o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-02'), oordeel: 'Goedgekeurd' })).toThrow(DomeinFout);
  });

  it('weigert afronden zonder goedgekeurde inspectie', () => {
    const o = gestartTraject();
    expect(() => o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') })).toThrow(DomeinFout);
    o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Afgekeurd', opmerkingen: 'lasnaad onvoldoende' });
    expect(() => o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') })).toThrow(DomeinFout);
  });

  it('rondt af na een goedgekeurde inspectie en registreert het afgerond-event', () => {
    const o = gestartTraject();
    o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Goedgekeurd' });
    o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') });
    expect(o.status).toBe('Afgerond');
    const events = o.trekEventsLeeg();
    expect(events[0].eventType).toBe('onderhoud.onderhoud.afgerond');
    expect(events[0].data).toEqual({ onderhoudId: 'O1', kunstwerkId: 'KW1', resultaat: 'hersteld', datum: '2026-07-10T00:00:00.000Z' });
    expect(() => o.rondAf({ resultaat: 'x', datum: new Date('2026-07-11') })).toThrow(DomeinFout);
  });

  it('ontvangt een factuur maar keurt pas goed na afronding', () => {
    const o = gestartTraject();
    o.ontvangFactuur({ id: FactuurId.van('F1'), bedrag: Bedrag.vanEuro(2500), ontvangenOp: new Date('2026-07-06') });
    expect(o.facturen[0].status).toBe('Ontvangen');
    expect(() => o.keurFactuurGoed(FactuurId.van('F1'))).toThrow(DomeinFout);
    o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Goedgekeurd' });
    o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') });
    o.keurFactuurGoed(FactuurId.van('F1'));
    expect(o.facturen[0].status).toBe('Goedgekeurd');
  });

  it('weigert een onbekende factuur goed te keuren', () => {
    const o = gestartTraject();
    expect(() => o.keurFactuurGoed(FactuurId.van('F9'))).toThrow(DomeinFout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onderhoud.spec`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer `onderhoud.ts`**

`onderhoud/src/domain/onderhoud/onderhoud.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root';
import { DomeinFout } from '../gedeeld/fouten';
import type { AannemerId, Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../gedeeld/waarden';
import type { Diagnose } from '../diagnose/diagnose';

export type OnderhoudStatus = 'Gepland' | 'Gestart' | 'Afgerond';

export type Aanleiding =
  | { soort: 'Storing'; storingId: StoringId }
  | { soort: 'Diagnose'; diagnose: Diagnose };

export type InspectieOordeel = 'Goedgekeurd' | 'Afgekeurd';
export interface Inspectie {
  id: InspectieId;
  datum: Date;
  oordeel: InspectieOordeel;
  opmerkingen?: string;
}

export type FactuurStatus = 'Ontvangen' | 'Goedgekeurd' | 'Afgekeurd';
export interface Factuur {
  id: FactuurId;
  bedrag: Bedrag;
  status: FactuurStatus;
  ontvangenOp: Date;
}

interface HerstelData {
  id: OnderhoudId;
  kunstwerkId: KunstwerkId;
  aanleiding: Aanleiding;
  status: OnderhoudStatus;
  contractId?: ContractId;
  aannemerId?: AannemerId;
  gestartOp?: Date;
  afgerondOp?: Date;
  resultaat?: string;
  inspecties: Inspectie[];
  facturen: Factuur[];
}

export class Onderhoud extends AggregateRoot {
  private constructor(
    private readonly _id: OnderhoudId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly _aanleiding: Aanleiding,
    private _status: OnderhoudStatus,
    private _contractId: ContractId | undefined,
    private _aannemerId: AannemerId | undefined,
    private _gestartOp: Date | undefined,
    private _afgerondOp: Date | undefined,
    private _resultaat: string | undefined,
    private readonly _inspecties: Inspectie[],
    private readonly _facturen: Factuur[],
  ) {
    super();
  }

  static plan(p: { id: OnderhoudId; kunstwerkId: KunstwerkId; aanleiding: Aanleiding }): Onderhoud {
    return new Onderhoud(p.id, p.kunstwerkId, p.aanleiding, 'Gepland', undefined, undefined, undefined, undefined, undefined, [], []);
  }

  static herstel(d: HerstelData): Onderhoud {
    return new Onderhoud(d.id, d.kunstwerkId, d.aanleiding, d.status, d.contractId, d.aannemerId, d.gestartOp, d.afgerondOp, d.resultaat, d.inspecties, d.facturen);
  }

  get id(): OnderhoudId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get aanleiding(): Aanleiding { return this._aanleiding; }
  get status(): OnderhoudStatus { return this._status; }
  get contractId(): ContractId | undefined { return this._contractId; }
  get aannemerId(): AannemerId | undefined { return this._aannemerId; }
  get gestartOp(): Date | undefined { return this._gestartOp; }
  get afgerondOp(): Date | undefined { return this._afgerondOp; }
  get resultaat(): string | undefined { return this._resultaat; }
  get inspecties(): readonly Inspectie[] { return this._inspecties; }
  get facturen(): readonly Factuur[] { return this._facturen; }

  start(p: { datum: Date; contractId?: ContractId; aannemerId?: AannemerId }): void {
    if (this._status !== 'Gepland') throw new DomeinFout('alleen een gepland traject kan starten');
    this._status = 'Gestart';
    this._gestartOp = p.datum;
    this._contractId = p.contractId ?? this._contractId;
    this._aannemerId = p.aannemerId ?? this._aannemerId;
    this.registreerEvent({
      eventType: 'onderhoud.onderhoud.gestart',
      data: { onderhoudId: this._id.waarde, kunstwerkId: this._kunstwerkId.waarde, datum: p.datum.toISOString() },
    });
  }

  registreerInspectie(p: { id: InspectieId; datum: Date; oordeel: InspectieOordeel; opmerkingen?: string }): void {
    if (this._status !== 'Gestart') throw new DomeinFout('inspecteren kan alleen bij een gestart traject');
    this._inspecties.push({ id: p.id, datum: p.datum, oordeel: p.oordeel, opmerkingen: p.opmerkingen });
  }

  rondAf(p: { resultaat: string; datum: Date }): void {
    if (this._status !== 'Gestart') throw new DomeinFout('alleen een gestart traject kan afgerond worden');
    if (!this._inspecties.some((i) => i.oordeel === 'Goedgekeurd')) {
      throw new DomeinFout('afronden vereist een goedgekeurde inspectie');
    }
    this._status = 'Afgerond';
    this._afgerondOp = p.datum;
    this._resultaat = p.resultaat;
    this.registreerEvent({
      eventType: 'onderhoud.onderhoud.afgerond',
      data: { onderhoudId: this._id.waarde, kunstwerkId: this._kunstwerkId.waarde, resultaat: p.resultaat, datum: p.datum.toISOString() },
    });
  }

  ontvangFactuur(p: { id: FactuurId; bedrag: Bedrag; ontvangenOp: Date }): void {
    if (this._status === 'Gepland') throw new DomeinFout('een factuur hoort bij een gestart of afgerond traject');
    this._facturen.push({ id: p.id, bedrag: p.bedrag, status: 'Ontvangen', ontvangenOp: p.ontvangenOp });
  }

  keurFactuurGoed(factuurId: FactuurId): void {
    const factuur = this._facturen.find((f) => f.id.gelijkAan(factuurId));
    if (!factuur) throw new DomeinFout('factuur niet gevonden');
    if (this._status !== 'Afgerond') throw new DomeinFout('een factuur goedkeuren vereist een afgerond traject');
    factuur.status = 'Goedgekeurd';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onderhoud.spec`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add onderhoud/src/domain/onderhoud onderhoud/test/domain/onderhoud.spec.ts
git commit -m "feat(onderhoud): Onderhoud-aggregate met inspectie- en factuurinvarianten"
```

---

### Task 8: Domein — OnderhoudsSchema-aggregate + repository-interfaces

**Files:**
- Create: `onderhoud/src/domain/schema/onderhouds-schema.ts`
- Create: `onderhoud/src/domain/repositories.ts`
- Test: `onderhoud/test/domain/onderhouds-schema.spec.ts`

**Interfaces:**
- Produces: `interface GeplandMoment { datum: Date; omschrijving: string }`.
- Produces: `class OnderhoudsSchema extends AggregateRoot` met `static maak(...)`, `voegMomentToe(m)`, getters, `static herstel(...)`.
- Produces (repository-interfaces): `StoringRepository`, `OnderhoudRepository` (incl. `zoekPerKunstwerk`), `SchemaRepository`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/domain/onderhouds-schema.spec.ts`:
```ts
import { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

const periode = Periode.van(new Date('2026-01-01'), new Date('2026-12-31'));

function nieuwSchema(): OnderhoudsSchema {
  return OnderhoudsSchema.maak({
    id: SchemaId.van('SCH1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    contractId: ContractId.van('C1'),
    aannemer: 'BAM',
    periode,
    momenten: [{ datum: new Date('2026-03-01'), omschrijving: 'smeren bewegingswerk' }],
  });
}

describe('OnderhoudsSchema', () => {
  it('maakt een schema met minstens één moment binnen de periode', () => {
    const s = nieuwSchema();
    expect(s.momenten).toHaveLength(1);
    expect(s.aannemer).toBe('BAM');
  });

  it('weigert een schema zonder momenten', () => {
    expect(() => OnderhoudsSchema.maak({
      id: SchemaId.van('SCH1'),
      kunstwerkId: KunstwerkId.van('KW1'),
      contractId: ContractId.van('C1'),
      aannemer: 'BAM',
      periode,
      momenten: [],
    })).toThrow(DomeinFout);
  });

  it('weigert een moment buiten de periode', () => {
    const s = nieuwSchema();
    expect(() => s.voegMomentToe({ datum: new Date('2027-03-01'), omschrijving: 'te laat' })).toThrow(DomeinFout);
    s.voegMomentToe({ datum: new Date('2026-09-01'), omschrijving: 'najaarsinspectie' });
    expect(s.momenten).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onderhouds-schema`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer `onderhouds-schema.ts`**

`onderhoud/src/domain/schema/onderhouds-schema.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root';
import { DomeinFout } from '../gedeeld/fouten';
import type { ContractId, KunstwerkId, Periode, SchemaId } from '../gedeeld/waarden';

export interface GeplandMoment {
  datum: Date;
  omschrijving: string;
}

interface HerstelData {
  id: SchemaId;
  kunstwerkId: KunstwerkId;
  contractId: ContractId;
  aannemer: string;
  periode: Periode;
  momenten: GeplandMoment[];
}

export class OnderhoudsSchema extends AggregateRoot {
  private constructor(
    private readonly _id: SchemaId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly _contractId: ContractId,
    private readonly _aannemer: string,
    private readonly _periode: Periode,
    private readonly _momenten: GeplandMoment[],
  ) {
    super();
  }

  static maak(p: HerstelData): OnderhoudsSchema {
    if (p.momenten.length === 0) throw new DomeinFout('een schema heeft minstens één gepland moment');
    const s = new OnderhoudsSchema(p.id, p.kunstwerkId, p.contractId, p.aannemer, p.periode, []);
    for (const m of p.momenten) s.voegMomentToe(m);
    return s;
  }

  static herstel(d: HerstelData): OnderhoudsSchema {
    return new OnderhoudsSchema(d.id, d.kunstwerkId, d.contractId, d.aannemer, d.periode, d.momenten);
  }

  get id(): SchemaId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get contractId(): ContractId { return this._contractId; }
  get aannemer(): string { return this._aannemer; }
  get periode(): Periode { return this._periode; }
  get momenten(): readonly GeplandMoment[] { return this._momenten; }

  voegMomentToe(m: GeplandMoment): void {
    if (!this._periode.bevat(m.datum)) throw new DomeinFout('gepland moment valt buiten de schemaperiode');
    this._momenten.push(m);
  }
}
```

- [ ] **Step 4: Implementeer `repositories.ts`**

`onderhoud/src/domain/repositories.ts`:
```ts
import type { Storing } from './storing/storing';
import type { Onderhoud } from './onderhoud/onderhoud';
import type { OnderhoudsSchema } from './schema/onderhouds-schema';
import type { KunstwerkId, OnderhoudId, SchemaId, StoringId } from './gedeeld/waarden';

export interface StoringRepository {
  bewaar(s: Storing): Promise<void>;
  zoek(id: StoringId): Promise<Storing | null>;
  zoekAlle(): Promise<Storing[]>;
}

export interface OnderhoudRepository {
  bewaar(o: Onderhoud): Promise<void>;
  zoek(id: OnderhoudId): Promise<Onderhoud | null>;
  zoekAlle(): Promise<Onderhoud[]>;
  zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]>;
}

export interface SchemaRepository {
  bewaar(s: OnderhoudsSchema): Promise<void>;
  zoek(id: SchemaId): Promise<OnderhoudsSchema | null>;
  zoekAlle(): Promise<OnderhoudsSchema[]>;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- onderhouds-schema`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/domain/schema onderhoud/src/domain/repositories.ts onderhoud/test/domain/onderhouds-schema.spec.ts
git commit -m "feat(onderhoud): OnderhoudsSchema-aggregate en repository-interfaces"
```

---
### Task 9: Application — ports, fakes & instap-use-cases (MeldStoring + StelDiagnose)

De twee instappunten uit de README. Use-cases zijn **plain classes** met constructor-injectie (geen Nest-decorators); ze worden in Task 17 via de module bedraad. `MeldStoring` plant bij ernst Hoog/Kritiek automatisch een onderhoudstraject en koppelt de storing; `StelDiagnose` doet hetzelfde op basis van monitoringdata (incident).

**Files:**
- Create: `onderhoud/src/application/ports.ts`
- Create: `onderhoud/src/application/storing/meld-storing.ts`
- Create: `onderhoud/src/application/diagnose/stel-diagnose.ts`
- Create: `onderhoud/test/support/fakes.ts`
- Test: `onderhoud/test/application/instap-usecases.spec.ts`

**Interfaces:**
- Produces (ports): `EventPublisher { publiceer(events): Promise<void> }`, `KunstwerkenReadModel { isBekendEnInGebruik(id): Promise<boolean> }`, `ContractenReadModel { geldendContractVoor(id): Promise<{contractId; opdrachtnemer} | null> }`, `IdGenerator { nieuw(): string }`.
- Produces (use cases): `class MeldStoring` (constructor `(storingen, onderhouden, publisher, kunstwerken, ids, validatie)`, `uitvoeren(cmd): Promise<{storingId; onderhoudId?}>`) en `class StelDiagnose` (constructor `(onderhouden, ids)`, `uitvoeren(cmd): Promise<{onderhoudId: string | null}>`).
- Produces (test-fakes): `InMemoryStoringRepository`, `InMemoryOnderhoudRepository`, `InMemorySchemaRepository`, `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `FakeContractenReadModel`, `VasteIdGenerator`.

- [ ] **Step 1: Ports definiëren**

`onderhoud/src/application/ports.ts`:
```ts
import type { KunstwerkId } from '../domain/gedeeld/waarden';
import type { OnderhoudDomainEvent } from '../domain/gedeeld/domain-events';

export interface EventPublisher {
  publiceer(events: OnderhoudDomainEvent[]): Promise<void>;
}

export interface KunstwerkenReadModel {
  isBekendEnInGebruik(id: KunstwerkId): Promise<boolean>;
}

export interface ContractenReadModel {
  geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null>;
}

export interface IdGenerator {
  nieuw(): string;
}
```

- [ ] **Step 2: Test-fakes**

`onderhoud/test/support/fakes.ts`:
```ts
import type { OnderhoudRepository, SchemaRepository, StoringRepository } from '../../src/domain/repositories';
import type { ContractenReadModel, EventPublisher, IdGenerator, KunstwerkenReadModel } from '../../src/application/ports';
import type { Storing } from '../../src/domain/storing/storing';
import type { Onderhoud } from '../../src/domain/onderhoud/onderhoud';
import type { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema';
import type { KunstwerkId, OnderhoudId, SchemaId, StoringId } from '../../src/domain/gedeeld/waarden';
import type { OnderhoudDomainEvent } from '../../src/domain/gedeeld/domain-events';

export class InMemoryStoringRepository implements StoringRepository {
  private opslag = new Map<string, Storing>();
  async bewaar(s: Storing): Promise<void> { this.opslag.set(s.id.waarde, s); }
  async zoek(id: StoringId): Promise<Storing | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Storing[]> { return [...this.opslag.values()]; }
}

export class InMemoryOnderhoudRepository implements OnderhoudRepository {
  private opslag = new Map<string, Onderhoud>();
  async bewaar(o: Onderhoud): Promise<void> { this.opslag.set(o.id.waarde, o); }
  async zoek(id: OnderhoudId): Promise<Onderhoud | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Onderhoud[]> { return [...this.opslag.values()]; }
  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> {
    return [...this.opslag.values()].filter((o) => o.kunstwerkId.gelijkAan(kunstwerkId));
  }
}

export class InMemorySchemaRepository implements SchemaRepository {
  private opslag = new Map<string, OnderhoudsSchema>();
  async bewaar(s: OnderhoudsSchema): Promise<void> { this.opslag.set(s.id.waarde, s); }
  async zoek(id: SchemaId): Promise<OnderhoudsSchema | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<OnderhoudsSchema[]> { return [...this.opslag.values()]; }
}

export class FakeEventPublisher implements EventPublisher {
  gepubliceerd: OnderhoudDomainEvent[] = [];
  async publiceer(events: OnderhoudDomainEvent[]): Promise<void> { this.gepubliceerd.push(...events); }
  types(): string[] { return this.gepubliceerd.map((e) => e.eventType); }
}

export class FakeKunstwerkenReadModel implements KunstwerkenReadModel {
  constructor(private antwoord = true) {}
  async isBekendEnInGebruik(): Promise<boolean> { return this.antwoord; }
}

export class FakeContractenReadModel implements ContractenReadModel {
  constructor(private contract: { contractId: string; opdrachtnemer: string } | null = null) {}
  async geldendContractVoor(): Promise<{ contractId: string; opdrachtnemer: string } | null> { return this.contract; }
}

export class VasteIdGenerator implements IdGenerator {
  private teller = 0;
  constructor(private readonly prefix = 'ID') {}
  nieuw(): string { this.teller += 1; return `${this.prefix}-${this.teller}`; }
}
```

- [ ] **Step 3: Write the failing test**

`onderhoud/test/application/instap-usecases.spec.ts`:
```ts
import { MeldStoring } from '../../src/application/storing/meld-storing';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import {
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('MeldStoring', () => {
  let storingen: InMemoryStoringRepository;
  let onderhouden: InMemoryOnderhoudRepository;
  let publisher: FakeEventPublisher;

  beforeEach(() => {
    storingen = new InMemoryStoringRepository();
    onderhouden = new InMemoryOnderhoudRepository();
    publisher = new FakeEventPublisher();
  });

  function useCase(validatie: 'soepel' | 'streng' = 'soepel', kunstwerkBekend = true): MeldStoring {
    return new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(kunstwerkBekend), new VasteIdGenerator('X'), validatie);
  }

  it('bewaart de storing en publiceert het gemeld-event', async () => {
    const { storingId } = await useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'slagboom klemt', ernst: 'Laag' });
    expect(storingId).toBe('X-1');
    expect(await storingen.zoekAlle()).toHaveLength(1);
    expect(publisher.types()).toContain('onderhoud.storing.gemeld');
  });

  it('plant bij ernst Hoog automatisch een traject en koppelt de storing', async () => {
    const { storingId, onderhoudId } = await useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'scheur in pijler', ernst: 'Hoog' });
    expect(onderhoudId).toBe('X-2');
    const trajecten = await onderhouden.zoekAlle();
    expect(trajecten).toHaveLength(1);
    expect(trajecten[0].status).toBe('Gepland');
    const storing = (await storingen.zoekAlle())[0];
    expect(storing.status).toBe('InBehandeling');
    expect(storing.onderhoudId?.waarde).toBe(onderhoudId);
    expect(storing.id.waarde).toBe(storingId);
  });

  it('plant bij ernst Laag geen traject', async () => {
    const { onderhoudId } = await useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'lamp kapot', ernst: 'Laag' });
    expect(onderhoudId).toBeUndefined();
    expect(await onderhouden.zoekAlle()).toHaveLength(0);
  });

  it('weigert bij streng + onbekend kunstwerk', async () => {
    await expect(useCase('streng', false).uitvoeren({ kunstwerkId: 'KW9', omschrijving: 'x', ernst: 'Laag' })).rejects.toThrow();
  });

  it('weigert een onbekende ernst', async () => {
    await expect(useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'x', ernst: 'Enorm' })).rejects.toThrow();
  });
});

describe('StelDiagnose', () => {
  it('plant bij Kritiek een traject met aanleiding Diagnose', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const uc = new StelDiagnose(onderhouden, new VasteIdGenerator('O'));
    const { onderhoudId } = await uc.uitvoeren({ kunstwerkId: 'KW1', incidentId: 'INC1', bevinding: 'trilling boven drempel', ernst: 'Kritiek' });
    expect(onderhoudId).toBe('O-1');
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.aanleiding.soort).toBe('Diagnose');
  });

  it('plant bij Middel geen traject', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const uc = new StelDiagnose(onderhouden, new VasteIdGenerator('O'));
    const { onderhoudId } = await uc.uitvoeren({ kunstwerkId: 'KW1', bevinding: 'lichte afwijking', ernst: 'Middel' });
    expect(onderhoudId).toBeNull();
    expect(await onderhouden.zoekAlle()).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- instap-usecases`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 5: Implementeer `MeldStoring`**

`onderhoud/src/application/storing/meld-storing.ts`:
```ts
import { Storing } from '../../domain/storing/storing';
import { Onderhoud } from '../../domain/onderhoud/onderhoud';
import { vereistOnderhoud } from '../../domain/diagnose/diagnose';
import { ernstVan, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository, StoringRepository } from '../../domain/repositories';
import type { EventPublisher, IdGenerator, KunstwerkenReadModel } from '../ports';

export interface MeldStoringCommand {
  kunstwerkId: string;
  omschrijving: string;
  ernst: string;
}

export class MeldStoring {
  constructor(
    private readonly storingen: StoringRepository,
    private readonly onderhouden: OnderhoudRepository,
    private readonly publisher: EventPublisher,
    private readonly kunstwerken: KunstwerkenReadModel,
    private readonly ids: IdGenerator,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: MeldStoringCommand): Promise<{ storingId: string; onderhoudId?: string }> {
    const kunstwerkId = KunstwerkId.van(command.kunstwerkId);
    const ernst = ernstVan(command.ernst);

    const bekend = await this.kunstwerken.isBekendEnInGebruik(kunstwerkId);
    if (!bekend) {
      if (this.validatie === 'streng') throw new DomeinFout('kunstwerk onbekend of buiten gebruik');
      console.warn(`kunstwerk ${kunstwerkId.waarde} onbekend in read-model — soepele validatie, melding gaat door`);
    }

    const storing = Storing.meld({ id: StoringId.van(this.ids.nieuw()), kunstwerkId, omschrijving: command.omschrijving, ernst });

    let onderhoudId: string | undefined;
    if (vereistOnderhoud(ernst)) {
      const traject = Onderhoud.plan({
        id: OnderhoudId.van(this.ids.nieuw()),
        kunstwerkId,
        aanleiding: { soort: 'Storing', storingId: storing.id },
      });
      storing.koppelAanOnderhoud(traject.id);
      await this.onderhouden.bewaar(traject);
      onderhoudId = traject.id.waarde;
    }

    await this.storingen.bewaar(storing);
    await this.publisher.publiceer(storing.trekEventsLeeg());
    return { storingId: storing.id.waarde, onderhoudId };
  }
}
```

- [ ] **Step 6: Implementeer `StelDiagnose`**

`onderhoud/src/application/diagnose/stel-diagnose.ts`:
```ts
import { Onderhoud } from '../../domain/onderhoud/onderhoud';
import { vereistOnderhoud } from '../../domain/diagnose/diagnose';
import { ernstVan, IncidentId, KunstwerkId, OnderhoudId } from '../../domain/gedeeld/waarden';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { IdGenerator } from '../ports';

export interface StelDiagnoseCommand {
  kunstwerkId: string;
  incidentId?: string;
  bevinding: string;
  ernst: string;
}

export class StelDiagnose {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: StelDiagnoseCommand): Promise<{ onderhoudId: string | null }> {
    const ernst = ernstVan(command.ernst);
    if (!vereistOnderhoud(ernst)) return { onderhoudId: null };

    const traject = Onderhoud.plan({
      id: OnderhoudId.van(this.ids.nieuw()),
      kunstwerkId: KunstwerkId.van(command.kunstwerkId),
      aanleiding: {
        soort: 'Diagnose',
        diagnose: {
          incidentId: command.incidentId ? IncidentId.van(command.incidentId) : undefined,
          bevinding: command.bevinding,
          ernst,
        },
      },
    });
    await this.onderhouden.bewaar(traject);
    return { onderhoudId: traject.id.waarde };
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- instap-usecases`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit**

```bash
git add onderhoud/src/application onderhoud/test/support/fakes.ts onderhoud/test/application/instap-usecases.spec.ts
git commit -m "feat(onderhoud): application-ports, fakes en instap-use-cases"
```

---

### Task 10: Application — traject-use-cases, schema & contractaanvraag

De rest van de use cases: traject sturen (`StartOnderhoud`/`RegistreerInspectie`/`RondOnderhoudAf`), factuurafhandeling, `MaakSchema` en `DienContractaanvraagIn`. Queries lopen in Fase 1 rechtstreeks via de repositories.

**Files:**
- Create: `onderhoud/src/application/onderhoud/start-onderhoud.ts`
- Create: `onderhoud/src/application/onderhoud/registreer-inspectie.ts`
- Create: `onderhoud/src/application/onderhoud/rond-onderhoud-af.ts`
- Create: `onderhoud/src/application/onderhoud/ontvang-factuur.ts`
- Create: `onderhoud/src/application/onderhoud/keur-factuur-goed.ts`
- Create: `onderhoud/src/application/schema/maak-schema.ts`
- Create: `onderhoud/src/application/contractaanvraag/dien-contractaanvraag-in.ts`
- Test: `onderhoud/test/application/traject-usecases.spec.ts`

**Interfaces:**
- Produces: `StartOnderhoud` `(onderhouden, contracten, publisher, validatie)`; `RegistreerInspectie` `(onderhouden, ids)`; `RondOnderhoudAf` `(onderhouden, storingen, publisher)`; `OntvangFactuur` `(onderhouden, ids)` → `{factuurId}`; `KeurFactuurGoed` `(onderhouden)`; `MaakSchema` `(schemas, contracten, ids, validatie)` → `{schemaId}`; `DienContractaanvraagIn` `(publisher)`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/application/traject-usecases.spec.ts`:
```ts
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../../src/application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../../src/application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../../src/application/onderhoud/keur-factuur-goed';
import { MaakSchema } from '../../src/application/schema/maak-schema';
import { DienContractaanvraagIn } from '../../src/application/contractaanvraag/dien-contractaanvraag-in';
import { MeldStoring } from '../../src/application/storing/meld-storing';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemorySchemaRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('traject-use-cases', () => {
  let storingen: InMemoryStoringRepository;
  let onderhouden: InMemoryOnderhoudRepository;
  let publisher: FakeEventPublisher;
  let ids: VasteIdGenerator;

  beforeEach(() => {
    storingen = new InMemoryStoringRepository();
    onderhouden = new InMemoryOnderhoudRepository();
    publisher = new FakeEventPublisher();
    ids = new VasteIdGenerator('X');
  });

  async function geplandTraject(): Promise<string> {
    const uc = new StelDiagnose(onderhouden, ids);
    const { onderhoudId } = await uc.uitvoeren({ kunstwerkId: 'KW1', bevinding: 'trilling', ernst: 'Kritiek' });
    return onderhoudId!;
  }

  it('start een traject en neemt het geldende contract over', async () => {
    const id = await geplandTraject();
    const contracten = new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' });
    await new StartOnderhoud(onderhouden, contracten, publisher, 'soepel').uitvoeren({ onderhoudId: id, datum: '2026-07-01' });
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.status).toBe('Gestart');
    expect(traject.contractId?.waarde).toBe('C1');
    expect(publisher.types()).toContain('onderhoud.onderhoud.gestart');
  });

  it('weigert starten bij streng zonder geldend contract', async () => {
    const id = await geplandTraject();
    const uc = new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'streng');
    await expect(uc.uitvoeren({ onderhoudId: id, datum: '2026-07-01' })).rejects.toThrow();
  });

  it('rondt af, handelt de gekoppelde storing af en publiceert het afgerond-event', async () => {
    const meld = new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(true), ids, 'soepel');
    const { storingId, onderhoudId } = await meld.uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'scheur', ernst: 'Hoog' });
    await new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel').uitvoeren({ onderhoudId: onderhoudId!, datum: '2026-07-01' });
    await new RegistreerInspectie(onderhouden, ids).uitvoeren({ onderhoudId: onderhoudId!, datum: '2026-07-05', oordeel: 'Goedgekeurd' });
    await new RondOnderhoudAf(onderhouden, storingen, publisher).uitvoeren({ onderhoudId: onderhoudId!, resultaat: 'hersteld', datum: '2026-07-10' });
    expect(publisher.types()).toContain('onderhoud.onderhoud.afgerond');
    const storing = (await storingen.zoekAlle()).find((s) => s.id.waarde === storingId)!;
    expect(storing.status).toBe('Afgehandeld');
  });

  it('ontvangt en keurt een factuur goed na afronding', async () => {
    const id = await geplandTraject();
    await new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel').uitvoeren({ onderhoudId: id, datum: '2026-07-01' });
    const { factuurId } = await new OntvangFactuur(onderhouden, ids).uitvoeren({ onderhoudId: id, bedragEuro: 2500, ontvangenOp: '2026-07-06' });
    await new RegistreerInspectie(onderhouden, ids).uitvoeren({ onderhoudId: id, datum: '2026-07-05', oordeel: 'Goedgekeurd' });
    await new RondOnderhoudAf(onderhouden, storingen, publisher).uitvoeren({ onderhoudId: id, resultaat: 'hersteld', datum: '2026-07-10' });
    await new KeurFactuurGoed(onderhouden).uitvoeren({ onderhoudId: id, factuurId });
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.facturen[0].status).toBe('Goedgekeurd');
  });

  it('gooit bij een onbekend traject', async () => {
    const uc = new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel');
    await expect(uc.uitvoeren({ onderhoudId: 'BESTAAT-NIET', datum: '2026-07-01' })).rejects.toThrow();
  });
});

describe('MaakSchema', () => {
  it('maakt een schema met de gegunde aannemer uit het contract-read-model', async () => {
    const schemas = new InMemorySchemaRepository();
    const contracten = new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' });
    const uc = new MaakSchema(schemas, contracten, new VasteIdGenerator('SCH'), 'soepel');
    const { schemaId } = await uc.uitvoeren({
      kunstwerkId: 'KW1',
      periodeStart: '2026-01-01',
      periodeEind: '2026-12-31',
      momenten: [{ datum: '2026-03-01', omschrijving: 'smeren' }],
    });
    expect(schemaId).toBe('SCH-1');
    const schema = (await schemas.zoekAlle())[0];
    expect(schema.aannemer).toBe('BAM');
    expect(schema.contractId.waarde).toBe('C1');
  });

  it('weigert bij streng zonder geldend contract', async () => {
    const uc = new MaakSchema(new InMemorySchemaRepository(), new FakeContractenReadModel(null), new VasteIdGenerator('SCH'), 'streng');
    await expect(uc.uitvoeren({ kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [{ datum: '2026-03-01', omschrijving: 'x' }] })).rejects.toThrow();
  });
});

describe('DienContractaanvraagIn', () => {
  it('publiceert het ingediend-event', async () => {
    const publisher = new FakeEventPublisher();
    await new DienContractaanvraagIn(publisher).uitvoeren({ kunstwerkId: 'KW1', aanleiding: 'nieuw onderhoudsregime na inspectie' });
    expect(publisher.gepubliceerd).toEqual([
      { eventType: 'onderhoud.contractaanvraag.ingediend', data: { kunstwerkId: 'KW1', aanleiding: 'nieuw onderhoudsregime na inspectie' } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- traject-usecases`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 3: Implementeer de traject-use-cases**

`onderhoud/src/application/onderhoud/start-onderhoud.ts`:
```ts
import { ContractId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { ContractenReadModel, EventPublisher } from '../ports';

export interface StartOnderhoudCommand {
  onderhoudId: string;
  datum: string;
}

export class StartOnderhoud {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly contracten: ContractenReadModel,
    private readonly publisher: EventPublisher,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: StartOnderhoudCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');

    const contract = await this.contracten.geldendContractVoor(traject.kunstwerkId);
    if (!contract) {
      if (this.validatie === 'streng') throw new DomeinFout('geen geldend onderhoudscontract voor dit kunstwerk');
      console.warn(`geen geldend contract voor kunstwerk ${traject.kunstwerkId.waarde} — soepele validatie, start gaat door`);
    }

    traject.start({
      datum: new Date(command.datum),
      contractId: contract ? ContractId.van(contract.contractId) : undefined,
    });
    await this.onderhouden.bewaar(traject);
    await this.publisher.publiceer(traject.trekEventsLeeg());
  }
}
```

`onderhoud/src/application/onderhoud/registreer-inspectie.ts`:
```ts
import { InspectieId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { InspectieOordeel } from '../../domain/onderhoud/onderhoud';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { IdGenerator } from '../ports';

export interface RegistreerInspectieCommand {
  onderhoudId: string;
  datum: string;
  oordeel: InspectieOordeel;
  opmerkingen?: string;
}

export class RegistreerInspectie {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: RegistreerInspectieCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');
    traject.registreerInspectie({
      id: InspectieId.van(this.ids.nieuw()),
      datum: new Date(command.datum),
      oordeel: command.oordeel,
      opmerkingen: command.opmerkingen,
    });
    await this.onderhouden.bewaar(traject);
  }
}
```

`onderhoud/src/application/onderhoud/rond-onderhoud-af.ts`:
```ts
import { OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository, StoringRepository } from '../../domain/repositories';
import type { EventPublisher } from '../ports';

export interface RondOnderhoudAfCommand {
  onderhoudId: string;
  resultaat: string;
  datum: string;
}

export class RondOnderhoudAf {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly storingen: StoringRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async uitvoeren(command: RondOnderhoudAfCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');

    traject.rondAf({ resultaat: command.resultaat, datum: new Date(command.datum) });
    await this.onderhouden.bewaar(traject);

    if (traject.aanleiding.soort === 'Storing') {
      const storing = await this.storingen.zoek(traject.aanleiding.storingId);
      if (storing && storing.status !== 'Afgehandeld') {
        storing.handelAf();
        await this.storingen.bewaar(storing);
      }
    }

    await this.publisher.publiceer(traject.trekEventsLeeg());
  }
}
```

`onderhoud/src/application/onderhoud/ontvang-factuur.ts`:
```ts
import { Bedrag, FactuurId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { IdGenerator } from '../ports';

export interface OntvangFactuurCommand {
  onderhoudId: string;
  bedragEuro: number;
  ontvangenOp: string;
}

export class OntvangFactuur {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: OntvangFactuurCommand): Promise<{ factuurId: string }> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');
    const factuurId = FactuurId.van(this.ids.nieuw());
    traject.ontvangFactuur({ id: factuurId, bedrag: Bedrag.vanEuro(command.bedragEuro), ontvangenOp: new Date(command.ontvangenOp) });
    await this.onderhouden.bewaar(traject);
    return { factuurId: factuurId.waarde };
  }
}
```

`onderhoud/src/application/onderhoud/keur-factuur-goed.ts`:
```ts
import { FactuurId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository } from '../../domain/repositories';

export interface KeurFactuurGoedCommand {
  onderhoudId: string;
  factuurId: string;
}

export class KeurFactuurGoed {
  constructor(private readonly onderhouden: OnderhoudRepository) {}

  async uitvoeren(command: KeurFactuurGoedCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');
    traject.keurFactuurGoed(FactuurId.van(command.factuurId));
    await this.onderhouden.bewaar(traject);
  }
}
```

- [ ] **Step 4: Implementeer `MaakSchema` en `DienContractaanvraagIn`**

`onderhoud/src/application/schema/maak-schema.ts`:
```ts
import { OnderhoudsSchema } from '../../domain/schema/onderhouds-schema';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { SchemaRepository } from '../../domain/repositories';
import type { ContractenReadModel, IdGenerator } from '../ports';

export interface MaakSchemaCommand {
  kunstwerkId: string;
  periodeStart: string;
  periodeEind: string;
  momenten: Array<{ datum: string; omschrijving: string }>;
}

export class MaakSchema {
  constructor(
    private readonly schemas: SchemaRepository,
    private readonly contracten: ContractenReadModel,
    private readonly ids: IdGenerator,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: MaakSchemaCommand): Promise<{ schemaId: string }> {
    const kunstwerkId = KunstwerkId.van(command.kunstwerkId);
    const contract = await this.contracten.geldendContractVoor(kunstwerkId);
    if (!contract) {
      if (this.validatie === 'streng') throw new DomeinFout('geen geldend onderhoudscontract voor dit kunstwerk');
      console.warn(`geen geldend contract voor kunstwerk ${kunstwerkId.waarde} — soepele validatie, schema zonder contractkoppeling`);
    }

    const schema = OnderhoudsSchema.maak({
      id: SchemaId.van(this.ids.nieuw()),
      kunstwerkId,
      contractId: ContractId.van(contract?.contractId ?? 'ONBEKEND'),
      aannemer: contract?.opdrachtnemer ?? 'ONBEKEND',
      periode: Periode.van(new Date(command.periodeStart), new Date(command.periodeEind)),
      momenten: command.momenten.map((m) => ({ datum: new Date(m.datum), omschrijving: m.omschrijving })),
    });
    await this.schemas.bewaar(schema);
    return { schemaId: schema.id.waarde };
  }
}
```

`onderhoud/src/application/contractaanvraag/dien-contractaanvraag-in.ts`:
```ts
import { KunstwerkId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { EventPublisher } from '../ports';

export interface DienContractaanvraagInCommand {
  kunstwerkId: string;
  aanleiding: string;
}

export class DienContractaanvraagIn {
  constructor(private readonly publisher: EventPublisher) {}

  async uitvoeren(command: DienContractaanvraagInCommand): Promise<void> {
    const kunstwerkId = KunstwerkId.van(command.kunstwerkId);
    if (!command.aanleiding || command.aanleiding.trim() === '') throw new DomeinFout('aanleiding mag niet leeg zijn');
    await this.publisher.publiceer([
      {
        eventType: 'onderhoud.contractaanvraag.ingediend',
        data: { kunstwerkId: kunstwerkId.waarde, aanleiding: command.aanleiding },
      },
    ]);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- traject-usecases`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/application onderhoud/test/application/traject-usecases.spec.ts
git commit -m "feat(onderhoud): traject-, schema- en contractaanvraag-use-cases"
```

---
### Task 11: Infrastructure — TypeORM-domeinentiteiten + repo-implementaties

Persistente opslag voor de drie aggregates via TypeORM. De `Onderhoud`-aggregate slaat zijn **Inspecties en Facturen op als `jsonb`-kolommen** op de aggregate-rij (de aggregate is de consistentiegrens; ze worden nooit los bevraagd). Repos vertalen tussen entiteiten en domeinobjecten via pure mappers + de `herstel`-fabrieken; domeinobjecten blijven TypeORM-vrij.

**Files:**
- Create: `onderhoud/src/infrastructure/db/entities/storing.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/onderhoud.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/onderhouds-schema.entity.ts`
- Create: `onderhoud/src/infrastructure/db/migrations/1720000001000-domeintabellen.ts`
- Modify: `onderhoud/src/infrastructure/db/data-source.ts` (entiteiten + migratie toevoegen)
- Create: `onderhoud/src/infrastructure/db/typeorm-storing-repository.ts`
- Create: `onderhoud/src/infrastructure/db/typeorm-onderhoud-repository.ts`
- Create: `onderhoud/src/infrastructure/db/typeorm-schema-repository.ts`
- Test: `onderhoud/test/infrastructure/typeorm-mapping.spec.ts`

**Interfaces:**
- Produces: entiteiten `StoringEntity`, `OnderhoudEntity` (+ `InspectieRij`/`FactuurRij`), `OnderhoudsSchemaEntity` (+ `MomentRij`).
- Produces: pure mappers `storingNaarEntiteit`/`entiteitNaarStoring`, `onderhoudNaarEntiteit`/`entiteitNaarOnderhoud`, `schemaNaarEntiteit`/`entiteitNaarSchema` (los getest, zonder DB).
- Produces: `@Injectable` repos `TypeOrmStoringRepository`, `TypeOrmOnderhoudRepository`, `TypeOrmSchemaRepository` die de domain-interfaces implementeren.

- [ ] **Step 1: Domeinentiteiten**

`onderhoud/src/infrastructure/db/entities/storing.entity.ts`:
```ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'storing' })
export class StoringEntity {
  @PrimaryColumn({ name: 'storing_id' })
  storingId!: string;

  @Index()
  @Column({ name: 'kunstwerk_id' })
  kunstwerkId!: string;

  @Column()
  omschrijving!: string;

  @Column()
  ernst!: string;

  @Column()
  status!: string;

  @Column({ name: 'onderhoud_id', type: 'varchar', nullable: true })
  onderhoudId!: string | null;
}
```

`onderhoud/src/infrastructure/db/entities/onderhoud.entity.ts`:
```ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export interface InspectieRij {
  inspectieId: string;
  datum: string;
  oordeel: string;
  opmerkingen: string | null;
}

export interface FactuurRij {
  factuurId: string;
  bedragCenten: number;
  valuta: string;
  status: string;
  ontvangenOp: string;
}

@Entity({ name: 'onderhoud' })
export class OnderhoudEntity {
  @PrimaryColumn({ name: 'onderhoud_id' })
  onderhoudId!: string;

  @Index()
  @Column({ name: 'kunstwerk_id' })
  kunstwerkId!: string;

  @Column()
  status!: string;

  @Column({ name: 'aanleiding_soort' })
  aanleidingSoort!: string;

  @Column({ name: 'storing_id', type: 'varchar', nullable: true })
  storingId!: string | null;

  @Column({ name: 'incident_id', type: 'varchar', nullable: true })
  incidentId!: string | null;

  @Column({ type: 'text', nullable: true })
  bevinding!: string | null;

  @Column({ type: 'varchar', nullable: true })
  ernst!: string | null;

  @Column({ name: 'contract_id', type: 'varchar', nullable: true })
  contractId!: string | null;

  @Column({ name: 'aannemer_id', type: 'varchar', nullable: true })
  aannemerId!: string | null;

  @Column({ name: 'gestart_op', type: 'timestamptz', nullable: true })
  gestartOp!: Date | null;

  @Column({ name: 'afgerond_op', type: 'timestamptz', nullable: true })
  afgerondOp!: Date | null;

  @Column({ type: 'text', nullable: true })
  resultaat!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  inspecties!: InspectieRij[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  facturen!: FactuurRij[];
}
```

`onderhoud/src/infrastructure/db/entities/onderhouds-schema.entity.ts`:
```ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export interface MomentRij {
  datum: string;
  omschrijving: string;
}

@Entity({ name: 'onderhouds_schema' })
export class OnderhoudsSchemaEntity {
  @PrimaryColumn({ name: 'schema_id' })
  schemaId!: string;

  @Index()
  @Column({ name: 'kunstwerk_id' })
  kunstwerkId!: string;

  @Column({ name: 'contract_id' })
  contractId!: string;

  @Column()
  aannemer!: string;

  @Column({ name: 'periode_start', type: 'timestamptz' })
  periodeStart!: Date;

  @Column({ name: 'periode_eind', type: 'timestamptz' })
  periodeEind!: Date;

  @Column({ type: 'jsonb' })
  momenten!: MomentRij[];
}
```

- [ ] **Step 2: Domeintabellen-migratie**

`onderhoud/src/infrastructure/db/migrations/1720000001000-domeintabellen.ts`:
```ts
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class Domeintabellen1720000001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'storing',
        columns: [
          { name: 'storing_id', type: 'varchar', isPrimary: true },
          { name: 'kunstwerk_id', type: 'varchar' },
          { name: 'omschrijving', type: 'varchar' },
          { name: 'ernst', type: 'varchar' },
          { name: 'status', type: 'varchar' },
          { name: 'onderhoud_id', type: 'varchar', isNullable: true },
        ],
        indices: [{ name: 'idx_storing_kunstwerk', columnNames: ['kunstwerk_id'] }],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: 'onderhoud',
        columns: [
          { name: 'onderhoud_id', type: 'varchar', isPrimary: true },
          { name: 'kunstwerk_id', type: 'varchar' },
          { name: 'status', type: 'varchar' },
          { name: 'aanleiding_soort', type: 'varchar' },
          { name: 'storing_id', type: 'varchar', isNullable: true },
          { name: 'incident_id', type: 'varchar', isNullable: true },
          { name: 'bevinding', type: 'text', isNullable: true },
          { name: 'ernst', type: 'varchar', isNullable: true },
          { name: 'contract_id', type: 'varchar', isNullable: true },
          { name: 'aannemer_id', type: 'varchar', isNullable: true },
          { name: 'gestart_op', type: 'timestamptz', isNullable: true },
          { name: 'afgerond_op', type: 'timestamptz', isNullable: true },
          { name: 'resultaat', type: 'text', isNullable: true },
          { name: 'inspecties', type: 'jsonb', default: "'[]'" },
          { name: 'facturen', type: 'jsonb', default: "'[]'" },
        ],
        indices: [{ name: 'idx_onderhoud_kunstwerk', columnNames: ['kunstwerk_id'] }],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: 'onderhouds_schema',
        columns: [
          { name: 'schema_id', type: 'varchar', isPrimary: true },
          { name: 'kunstwerk_id', type: 'varchar' },
          { name: 'contract_id', type: 'varchar' },
          { name: 'aannemer', type: 'varchar' },
          { name: 'periode_start', type: 'timestamptz' },
          { name: 'periode_eind', type: 'timestamptz' },
          { name: 'momenten', type: 'jsonb' },
        ],
        indices: [{ name: 'idx_schema_kunstwerk', columnNames: ['kunstwerk_id'] }],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('onderhouds_schema');
    await queryRunner.dropTable('onderhoud');
    await queryRunner.dropTable('storing');
  }
}
```

- [ ] **Step 3: DataSource uitbreiden**

In `onderhoud/src/infrastructure/db/data-source.ts`: importeer de drie domeinentiteiten en de nieuwe migratie en voeg ze toe:
```ts
import { StoringEntity } from './entities/storing.entity';
import { OnderhoudEntity } from './entities/onderhoud.entity';
import { OnderhoudsSchemaEntity } from './entities/onderhouds-schema.entity';
import { Domeintabellen1720000001000 } from './migrations/1720000001000-domeintabellen';
// ...
export const alleEntiteiten = [
  BekendKunstwerkEntity,
  GeldendContractEntity,
  OnderhoudseisEntity,
  VerwerktEventEntity,
  StoringEntity,
  OnderhoudEntity,
  OnderhoudsSchemaEntity,
];

export const alleMigraties = [InitReadmodel1720000000000, Domeintabellen1720000001000];
```

- [ ] **Step 4: Write the failing test (pure mappers, zonder DB)**

`onderhoud/test/infrastructure/typeorm-mapping.spec.ts`:
```ts
import { entiteitNaarStoring, storingNaarEntiteit } from '../../src/infrastructure/db/typeorm-storing-repository';
import { entiteitNaarOnderhoud, onderhoudNaarEntiteit } from '../../src/infrastructure/db/typeorm-onderhoud-repository';
import { entiteitNaarSchema, schemaNaarEntiteit } from '../../src/infrastructure/db/typeorm-schema-repository';
import { Storing } from '../../src/domain/storing/storing';
import { Onderhoud } from '../../src/domain/onderhoud/onderhoud';
import { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema';
import { Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, Periode, SchemaId, StoringId } from '../../src/domain/gedeeld/waarden';

describe('typeorm-mapping', () => {
  it('mapt een Storing heen en terug', () => {
    const storing = Storing.meld({ id: StoringId.van('S1'), kunstwerkId: KunstwerkId.van('KW1'), omschrijving: 'scheur', ernst: 'Hoog' });
    storing.koppelAanOnderhoud(OnderhoudId.van('O1'));
    const terug = entiteitNaarStoring(storingNaarEntiteit(storing));
    expect(terug.id.waarde).toBe('S1');
    expect(terug.status).toBe('InBehandeling');
    expect(terug.onderhoudId?.waarde).toBe('O1');
    expect(terug.ernst).toBe('Hoog');
  });

  it('mapt een Onderhoud met inspecties en facturen heen en terug', () => {
    const traject = Onderhoud.plan({ id: OnderhoudId.van('O1'), kunstwerkId: KunstwerkId.van('KW1'), aanleiding: { soort: 'Diagnose', diagnose: { bevinding: 'trilling', ernst: 'Kritiek' } } });
    traject.start({ datum: new Date('2026-07-01'), contractId: ContractId.van('C1') });
    traject.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Goedgekeurd' });
    traject.ontvangFactuur({ id: FactuurId.van('F1'), bedrag: Bedrag.vanEuro(2500), ontvangenOp: new Date('2026-07-06') });
    const terug = entiteitNaarOnderhoud(onderhoudNaarEntiteit(traject));
    expect(terug.status).toBe('Gestart');
    expect(terug.aanleiding.soort).toBe('Diagnose');
    expect(terug.contractId?.waarde).toBe('C1');
    expect(terug.inspecties[0].oordeel).toBe('Goedgekeurd');
    expect(terug.facturen[0].bedrag.centen).toBe(250000);
  });

  it('mapt een OnderhoudsSchema heen en terug', () => {
    const schema = OnderhoudsSchema.maak({
      id: SchemaId.van('SCH1'),
      kunstwerkId: KunstwerkId.van('KW1'),
      contractId: ContractId.van('C1'),
      aannemer: 'BAM',
      periode: Periode.van(new Date('2026-01-01'), new Date('2026-12-31')),
      momenten: [{ datum: new Date('2026-03-01'), omschrijving: 'smeren' }],
    });
    const terug = entiteitNaarSchema(schemaNaarEntiteit(schema));
    expect(terug.aannemer).toBe('BAM');
    expect(terug.momenten[0].omschrijving).toBe('smeren');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- typeorm-mapping`
Expected: FAIL — modules ontbreken.

- [ ] **Step 6: Implementeer `typeorm-storing-repository.ts`**

`onderhoud/src/infrastructure/db/typeorm-storing-repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoringEntity } from './entities/storing.entity';
import { Storing, type StoringStatus } from '../../domain/storing/storing';
import { ernstVan, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden';
import type { StoringRepository } from '../../domain/repositories';

export function storingNaarEntiteit(s: Storing): StoringEntity {
  const e = new StoringEntity();
  e.storingId = s.id.waarde;
  e.kunstwerkId = s.kunstwerkId.waarde;
  e.omschrijving = s.omschrijving;
  e.ernst = s.ernst;
  e.status = s.status;
  e.onderhoudId = s.onderhoudId?.waarde ?? null;
  return e;
}

export function entiteitNaarStoring(e: StoringEntity): Storing {
  return Storing.herstel({
    id: StoringId.van(e.storingId),
    kunstwerkId: KunstwerkId.van(e.kunstwerkId),
    omschrijving: e.omschrijving,
    ernst: ernstVan(e.ernst),
    status: e.status as StoringStatus,
    onderhoudId: e.onderhoudId ? OnderhoudId.van(e.onderhoudId) : undefined,
  });
}

@Injectable()
export class TypeOrmStoringRepository implements StoringRepository {
  constructor(@InjectRepository(StoringEntity) private readonly repo: Repository<StoringEntity>) {}

  async bewaar(s: Storing): Promise<void> {
    await this.repo.save(storingNaarEntiteit(s));
  }

  async zoek(id: StoringId): Promise<Storing | null> {
    const e = await this.repo.findOne({ where: { storingId: id.waarde } });
    return e ? entiteitNaarStoring(e) : null;
  }

  async zoekAlle(): Promise<Storing[]> {
    return (await this.repo.find()).map(entiteitNaarStoring);
  }
}
```

- [ ] **Step 7: Implementeer `typeorm-onderhoud-repository.ts`**

`onderhoud/src/infrastructure/db/typeorm-onderhoud-repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnderhoudEntity } from './entities/onderhoud.entity';
import { Onderhoud, type Aanleiding, type FactuurStatus, type InspectieOordeel, type OnderhoudStatus } from '../../domain/onderhoud/onderhoud';
import { AannemerId, Bedrag, ContractId, ernstVan, FactuurId, IncidentId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden';
import type { OnderhoudRepository } from '../../domain/repositories';

export function onderhoudNaarEntiteit(o: Onderhoud): OnderhoudEntity {
  const a = o.aanleiding;
  const e = new OnderhoudEntity();
  e.onderhoudId = o.id.waarde;
  e.kunstwerkId = o.kunstwerkId.waarde;
  e.status = o.status;
  e.aanleidingSoort = a.soort;
  e.storingId = a.soort === 'Storing' ? a.storingId.waarde : null;
  e.incidentId = a.soort === 'Diagnose' ? a.diagnose.incidentId?.waarde ?? null : null;
  e.bevinding = a.soort === 'Diagnose' ? a.diagnose.bevinding : null;
  e.ernst = a.soort === 'Diagnose' ? a.diagnose.ernst : null;
  e.contractId = o.contractId?.waarde ?? null;
  e.aannemerId = o.aannemerId?.waarde ?? null;
  e.gestartOp = o.gestartOp ?? null;
  e.afgerondOp = o.afgerondOp ?? null;
  e.resultaat = o.resultaat ?? null;
  e.inspecties = o.inspecties.map((i) => ({ inspectieId: i.id.waarde, datum: i.datum.toISOString(), oordeel: i.oordeel, opmerkingen: i.opmerkingen ?? null }));
  e.facturen = o.facturen.map((f) => ({ factuurId: f.id.waarde, bedragCenten: f.bedrag.centen, valuta: f.bedrag.valuta, status: f.status, ontvangenOp: f.ontvangenOp.toISOString() }));
  return e;
}

export function entiteitNaarOnderhoud(e: OnderhoudEntity): Onderhoud {
  const aanleiding: Aanleiding =
    e.aanleidingSoort === 'Storing'
      ? { soort: 'Storing', storingId: StoringId.van(e.storingId ?? '') }
      : {
          soort: 'Diagnose',
          diagnose: {
            incidentId: e.incidentId ? IncidentId.van(e.incidentId) : undefined,
            bevinding: e.bevinding ?? '',
            ernst: ernstVan(e.ernst ?? 'Laag'),
          },
        };
  return Onderhoud.herstel({
    id: OnderhoudId.van(e.onderhoudId),
    kunstwerkId: KunstwerkId.van(e.kunstwerkId),
    aanleiding,
    status: e.status as OnderhoudStatus,
    contractId: e.contractId ? ContractId.van(e.contractId) : undefined,
    aannemerId: e.aannemerId ? AannemerId.van(e.aannemerId) : undefined,
    gestartOp: e.gestartOp ?? undefined,
    afgerondOp: e.afgerondOp ?? undefined,
    resultaat: e.resultaat ?? undefined,
    inspecties: (e.inspecties ?? []).map((i) => ({ id: InspectieId.van(i.inspectieId), datum: new Date(i.datum), oordeel: i.oordeel as InspectieOordeel, opmerkingen: i.opmerkingen ?? undefined })),
    facturen: (e.facturen ?? []).map((f) => ({ id: FactuurId.van(f.factuurId), bedrag: Bedrag.vanCenten(f.bedragCenten, f.valuta), status: f.status as FactuurStatus, ontvangenOp: new Date(f.ontvangenOp) })),
  });
}

@Injectable()
export class TypeOrmOnderhoudRepository implements OnderhoudRepository {
  constructor(@InjectRepository(OnderhoudEntity) private readonly repo: Repository<OnderhoudEntity>) {}

  async bewaar(o: Onderhoud): Promise<void> {
    await this.repo.save(onderhoudNaarEntiteit(o));
  }

  async zoek(id: OnderhoudId): Promise<Onderhoud | null> {
    const e = await this.repo.findOne({ where: { onderhoudId: id.waarde } });
    return e ? entiteitNaarOnderhoud(e) : null;
  }

  async zoekAlle(): Promise<Onderhoud[]> {
    return (await this.repo.find()).map(entiteitNaarOnderhoud);
  }

  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> {
    return (await this.repo.find({ where: { kunstwerkId: kunstwerkId.waarde } })).map(entiteitNaarOnderhoud);
  }
}
```

- [ ] **Step 8: Implementeer `typeorm-schema-repository.ts`**

`onderhoud/src/infrastructure/db/typeorm-schema-repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnderhoudsSchemaEntity } from './entities/onderhouds-schema.entity';
import { OnderhoudsSchema } from '../../domain/schema/onderhouds-schema';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../domain/gedeeld/waarden';
import type { SchemaRepository } from '../../domain/repositories';

export function schemaNaarEntiteit(s: OnderhoudsSchema): OnderhoudsSchemaEntity {
  const e = new OnderhoudsSchemaEntity();
  e.schemaId = s.id.waarde;
  e.kunstwerkId = s.kunstwerkId.waarde;
  e.contractId = s.contractId.waarde;
  e.aannemer = s.aannemer;
  e.periodeStart = s.periode.start;
  e.periodeEind = s.periode.eind;
  e.momenten = s.momenten.map((m) => ({ datum: m.datum.toISOString(), omschrijving: m.omschrijving }));
  return e;
}

export function entiteitNaarSchema(e: OnderhoudsSchemaEntity): OnderhoudsSchema {
  return OnderhoudsSchema.herstel({
    id: SchemaId.van(e.schemaId),
    kunstwerkId: KunstwerkId.van(e.kunstwerkId),
    contractId: ContractId.van(e.contractId),
    aannemer: e.aannemer,
    periode: Periode.van(new Date(e.periodeStart), new Date(e.periodeEind)),
    momenten: (e.momenten ?? []).map((m) => ({ datum: new Date(m.datum), omschrijving: m.omschrijving })),
  });
}

@Injectable()
export class TypeOrmSchemaRepository implements SchemaRepository {
  constructor(@InjectRepository(OnderhoudsSchemaEntity) private readonly repo: Repository<OnderhoudsSchemaEntity>) {}

  async bewaar(s: OnderhoudsSchema): Promise<void> {
    await this.repo.save(schemaNaarEntiteit(s));
  }

  async zoek(id: SchemaId): Promise<OnderhoudsSchema | null> {
    const e = await this.repo.findOne({ where: { schemaId: id.waarde } });
    return e ? entiteitNaarSchema(e) : null;
  }

  async zoekAlle(): Promise<OnderhoudsSchema[]> {
    return (await this.repo.find()).map(entiteitNaarSchema);
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- typeorm-mapping`
Expected: PASS (3 tests).

- [ ] **Step 10: Migratie draaien + commit**

Run (in `onderhoud/`, met lokale `DATABASE_URL`): `npm run migration:run` → migratie `Domeintabellen1720000001000` maakt de tabellen `storing`, `onderhoud`, `onderhouds_schema`.
```bash
git add onderhoud/src/infrastructure/db onderhoud/test/infrastructure/typeorm-mapping.spec.ts
git commit -m "feat(onderhoud): TypeORM-domeinentiteiten, migratie en repo-implementaties"
```

---
### Task 12: Infrastructure — RabbitMQ EventPublisher (envelope)

Framework-vrije publisher die domain events in de vaste envelope verpakt. Het kanaal komt via een **getter** binnen (zodat de provider vóór de RabbitMQ-connectie geïnstantieerd mag worden; het kanaal wordt pas bij publiceren opgehaald).

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/rabbitmq-event-publisher.ts`
- Test: `onderhoud/test/infrastructure/rabbitmq-event-publisher.spec.ts`

**Interfaces:**
- Produces: `interface KanaalPublish { publish(exchange, routingKey, content: Buffer, opties?): boolean }` en `class RabbitMqEventPublisher implements EventPublisher` — constructor `(kanaalBron: () => KanaalPublish, nieuwId?: () => string, nu?: () => Date)`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/infrastructure/rabbitmq-event-publisher.spec.ts`:
```ts
import { RabbitMqEventPublisher, type KanaalPublish } from '../../src/infrastructure/messaging/rabbitmq-event-publisher';

describe('RabbitMqEventPublisher', () => {
  it('verpakt een domain event in de vaste envelope en publiceert op rws.events', async () => {
    const gepubliceerd: Array<{ exchange: string; routingKey: string; body: unknown }> = [];
    const kanaal: KanaalPublish = {
      publish(exchange, routingKey, content) {
        gepubliceerd.push({ exchange, routingKey, body: JSON.parse(content.toString()) });
        return true;
      },
    };
    const publisher = new RabbitMqEventPublisher(() => kanaal, () => 'vaste-uuid', () => new Date('2026-07-01T12:00:00Z'));

    await publisher.publiceer([
      { eventType: 'onderhoud.storing.gemeld', data: { storingId: 'S1', kunstwerkId: 'KW1', omschrijving: 'scheur' } },
    ]);

    expect(gepubliceerd).toHaveLength(1);
    expect(gepubliceerd[0].exchange).toBe('rws.events');
    expect(gepubliceerd[0].routingKey).toBe('onderhoud.storing.gemeld');
    expect(gepubliceerd[0].body).toEqual({
      eventId: 'vaste-uuid',
      eventType: 'onderhoud.storing.gemeld',
      occurredAt: '2026-07-01T12:00:00.000Z',
      producer: 'onderhoud',
      version: 1,
      data: { storingId: 'S1', kunstwerkId: 'KW1', omschrijving: 'scheur' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rabbitmq-event-publisher`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer de publisher**

`onderhoud/src/infrastructure/messaging/rabbitmq-event-publisher.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { EventPublisher } from '../../application/ports';
import type { OnderhoudDomainEvent } from '../../domain/gedeeld/domain-events';
import { RWS_EXCHANGE } from './rabbitmq-connection';

export interface KanaalPublish {
  publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean;
}

export class RabbitMqEventPublisher implements EventPublisher {
  constructor(
    private readonly kanaalBron: () => KanaalPublish,
    private readonly nieuwId: () => string = uuid,
    private readonly nu: () => Date = () => new Date(),
  ) {}

  async publiceer(events: OnderhoudDomainEvent[]): Promise<void> {
    const kanaal = this.kanaalBron();
    for (const event of events) {
      const envelope = {
        eventId: this.nieuwId(),
        eventType: event.eventType,
        occurredAt: this.nu().toISOString(),
        producer: 'onderhoud',
        version: 1,
        data: event.data,
      };
      kanaal.publish(RWS_EXCHANGE, event.eventType, Buffer.from(JSON.stringify(envelope)), { persistent: true });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rabbitmq-event-publisher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add onderhoud/src/infrastructure/messaging/rabbitmq-event-publisher.ts onderhoud/test/infrastructure/rabbitmq-event-publisher.spec.ts
git commit -m "feat(onderhoud): RabbitMQ EventPublisher met vaste envelope"
```

---

### Task 13: Infrastructure — idempotente consumers (Monitoring, Contract, Beheer) + read-models

Drie verwerkers (framework-vrij, getest met fakes), een `startConsumer`-helper, en de TypeORM-read-models + dedup. Vertaling van envelope naar use-case/read-model gebeurt hier — de envelope komt niet voorbij deze laag. Dedupe op `eventId` via één gedeelde `TypeOrmEventDedup`.

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/consumer-helpers.ts`
- Create: `onderhoud/src/infrastructure/messaging/monitoring-incident-consumer.ts`
- Create: `onderhoud/src/infrastructure/messaging/contract-consumer.ts`
- Create: `onderhoud/src/infrastructure/messaging/beheer-consumer.ts`
- Create: `onderhoud/src/infrastructure/db/typeorm-read-models.ts`
- Test: `onderhoud/test/infrastructure/consumers.spec.ts`

**Interfaces:**
- Produces (helpers): `interface Envelope { eventId; eventType; data }`, `interface EventDedup { isVerwerkt(id): Promise<boolean>; markeerVerwerkt(id): Promise<void> }`, `startConsumer(connectie, queue, bindings, verwerk): Promise<void>`.
- Produces (verwerkers, idempotent): `MonitoringIncidentVerwerker(stelDiagnose, dedup)`, `ContractVerwerker(store: ContractStore, dedup)`, `BeheerVerwerker(store: BeheerStore, dedup)` + queue/binding-constanten.
- Produces (TypeORM): `TypeOrmEventDedup`, `TypeOrmKunstwerkenReadModel implements KunstwerkenReadModel, BeheerStore`, `TypeOrmContractenReadModel implements ContractenReadModel, ContractStore`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/infrastructure/consumers.spec.ts`:
```ts
import { MonitoringIncidentVerwerker } from '../../src/infrastructure/messaging/monitoring-incident-consumer';
import { ContractVerwerker, type ContractStore } from '../../src/infrastructure/messaging/contract-consumer';
import { BeheerVerwerker, type BeheerStore } from '../../src/infrastructure/messaging/beheer-consumer';
import type { EventDedup } from '../../src/infrastructure/messaging/consumer-helpers';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { InMemoryOnderhoudRepository, VasteIdGenerator } from '../support/fakes';

class FakeDedup implements EventDedup {
  private gezien = new Set<string>();
  async isVerwerkt(id: string): Promise<boolean> { return this.gezien.has(id); }
  async markeerVerwerkt(id: string): Promise<void> { this.gezien.add(id); }
}

describe('MonitoringIncidentVerwerker', () => {
  it('vertaalt een incident naar StelDiagnose en plant bij Kritiek een traject', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const v = new MonitoringIncidentVerwerker(new StelDiagnose(onderhouden, new VasteIdGenerator('O')), new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'monitoring.incident.aangemaakt', data: { incidentId: 'INC1', kunstwerkId: 'KW1', ernst: 'Kritiek', omschrijving: 'trilling boven drempel' } });
    const trajecten = await onderhouden.zoekAlle();
    expect(trajecten).toHaveLength(1);
    expect(trajecten[0].aanleiding.soort).toBe('Diagnose');
  });

  it('is idempotent op eventId', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const v = new MonitoringIncidentVerwerker(new StelDiagnose(onderhouden, new VasteIdGenerator('O')), new FakeDedup());
    const env = { eventId: 'e1', eventType: 'monitoring.incident.aangemaakt', data: { incidentId: 'INC1', kunstwerkId: 'KW1', ernst: 'Hoog', omschrijving: 'x' } };
    await v.verwerk(env);
    await v.verwerk(env);
    expect(await onderhouden.zoekAlle()).toHaveLength(1);
  });
});

describe('ContractVerwerker', () => {
  class FakeStore implements ContractStore {
    acties: string[] = [];
    async upsertGegund(p: { contractId: string }): Promise<void> { this.acties.push(`gegund:${p.contractId}`); }
    async markeerAfgerond(contractId: string): Promise<void> { this.acties.push(`afgerond:${contractId}`); }
  }

  it('verwerkt gegund en afgerond', async () => {
    const store = new FakeStore();
    const v = new ContractVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'contract.onderhoudscontract.gegund', data: { contractId: 'C1', kunstwerkId: 'KW1', opdrachtnemer: 'BAM', looptijd: { start: '2026-01-01', eind: '2026-12-31' } } });
    await v.verwerk({ eventId: 'e2', eventType: 'contract.onderhoudscontract.afgerond', data: { contractId: 'C1', kunstwerkId: 'KW1', datum: '2026-12-31' } });
    expect(store.acties).toEqual(['gegund:C1', 'afgerond:C1']);
  });
});

describe('BeheerVerwerker', () => {
  class FakeStore implements BeheerStore {
    acties: string[] = [];
    async upsertKunstwerk(kunstwerkId: string): Promise<void> { this.acties.push(`kunstwerk:${kunstwerkId}`); }
    async markeerBuitenGebruik(kunstwerkId: string): Promise<void> { this.acties.push(`buitengebruik:${kunstwerkId}`); }
    async bewaarEisen(kunstwerkId: string): Promise<void> { this.acties.push(`eisen:${kunstwerkId}`); }
  }

  it('verwerkt kunstwerk- en eisen-events', async () => {
    const store = new FakeStore();
    const v = new BeheerVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'beheer.kunstwerk.geregistreerd', data: { kunstwerkId: 'KW1', type: 'brug', locatie: 'A2' } });
    await v.verwerk({ eventId: 'e2', eventType: 'beheer.onderhoudseisen.vastgesteld', data: { kunstwerkId: 'KW1', eisen: ['jaarlijkse inspectie'] } });
    await v.verwerk({ eventId: 'e3', eventType: 'beheer.kunstwerk.buitengebruikgesteld', data: { kunstwerkId: 'KW1', reden: 'sloop' } });
    expect(store.acties).toEqual(['kunstwerk:KW1', 'eisen:KW1', 'buitengebruik:KW1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- consumers`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `consumer-helpers.ts`**

`onderhoud/src/infrastructure/messaging/consumer-helpers.ts`:
```ts
import type { RabbitMqConnection } from './rabbitmq-connection';
import { RWS_EXCHANGE } from './rabbitmq-connection';

export interface Envelope {
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface EventDedup {
  isVerwerkt(eventId: string): Promise<boolean>;
  markeerVerwerkt(eventId: string): Promise<void>;
}

export async function startConsumer(
  connectie: RabbitMqConnection,
  queue: string,
  bindings: string[],
  verwerk: (env: Envelope) => Promise<void>,
): Promise<void> {
  const kanaal = connectie.kanaal;
  await kanaal.assertQueue(queue, { durable: true });
  for (const binding of bindings) {
    await kanaal.bindQueue(queue, RWS_EXCHANGE, binding);
  }
  await kanaal.consume(queue, async (bericht) => {
    if (!bericht) return;
    try {
      await verwerk(JSON.parse(bericht.content.toString()) as Envelope);
      kanaal.ack(bericht);
    } catch {
      kanaal.nack(bericht, false, false);
    }
  });
}
```

- [ ] **Step 4: Implementeer de drie verwerkers**

`onderhoud/src/infrastructure/messaging/monitoring-incident-consumer.ts`:
```ts
import type { StelDiagnose } from '../../application/diagnose/stel-diagnose';
import type { Envelope, EventDedup } from './consumer-helpers';

export class MonitoringIncidentVerwerker {
  constructor(
    private readonly stelDiagnose: StelDiagnose,
    private readonly dedup: EventDedup,
  ) {}

  async verwerk(env: Envelope): Promise<void> {
    if (env.eventType !== 'monitoring.incident.aangemaakt') return;
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    await this.stelDiagnose.uitvoeren({
      kunstwerkId,
      incidentId: env.data.incidentId ? String(env.data.incidentId) : undefined,
      bevinding: String(env.data.omschrijving ?? 'incident uit monitoring'),
      ernst: String(env.data.ernst ?? 'Laag'),
    });
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

export const MONITORING_QUEUE = 'onderhoud.monitoring-incident';
export const MONITORING_BINDINGS = ['monitoring.incident.aangemaakt'];
```

`onderhoud/src/infrastructure/messaging/contract-consumer.ts`:
```ts
import type { Envelope, EventDedup } from './consumer-helpers';

export interface ContractStore {
  upsertGegund(p: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijdStart: string | null; looptijdEind: string | null }): Promise<void>;
  markeerAfgerond(contractId: string): Promise<void>;
}

export class ContractVerwerker {
  constructor(
    private readonly store: ContractStore,
    private readonly dedup: EventDedup,
  ) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const contractId = String(env.data.contractId ?? '');
    if (contractId === '') return;
    if (env.eventType === 'contract.onderhoudscontract.gegund') {
      const looptijd = (env.data.looptijd ?? {}) as { start?: string; eind?: string };
      await this.store.upsertGegund({
        contractId,
        kunstwerkId: String(env.data.kunstwerkId ?? ''),
        opdrachtnemer: String(env.data.opdrachtnemer ?? ''),
        looptijdStart: looptijd.start ?? null,
        looptijdEind: looptijd.eind ?? null,
      });
    } else if (env.eventType === 'contract.onderhoudscontract.afgerond') {
      await this.store.markeerAfgerond(contractId);
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

export const CONTRACT_QUEUE = 'onderhoud.contract';
export const CONTRACT_BINDINGS = ['contract.onderhoudscontract.*'];
```

`onderhoud/src/infrastructure/messaging/beheer-consumer.ts`:
```ts
import type { Envelope, EventDedup } from './consumer-helpers';

export interface BeheerStore {
  upsertKunstwerk(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void>;
  markeerBuitenGebruik(kunstwerkId: string): Promise<void>;
  bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void>;
}

export class BeheerVerwerker {
  constructor(
    private readonly store: BeheerStore,
    private readonly dedup: EventDedup,
  ) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    if (env.eventType === 'beheer.kunstwerk.geregistreerd') {
      await this.store.upsertKunstwerk(kunstwerkId, (env.data.type as string) ?? null, (env.data.locatie as string) ?? null);
    } else if (env.eventType === 'beheer.kunstwerk.buitengebruikgesteld') {
      await this.store.markeerBuitenGebruik(kunstwerkId);
    } else if (env.eventType === 'beheer.onderhoudseisen.vastgesteld') {
      await this.store.bewaarEisen(kunstwerkId, env.data.eisen ?? []);
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

export const BEHEER_QUEUE = 'onderhoud.beheer';
export const BEHEER_BINDINGS = ['beheer.kunstwerk.*', 'beheer.onderhoudseisen.vastgesteld'];
```

- [ ] **Step 5: Implementeer de TypeORM-read-models + dedup**

`onderhoud/src/infrastructure/db/typeorm-read-models.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BekendKunstwerkEntity } from './entities/bekend-kunstwerk.entity';
import { GeldendContractEntity } from './entities/geldend-contract.entity';
import { OnderhoudseisEntity } from './entities/onderhoudseis.entity';
import { VerwerktEventEntity } from './entities/verwerkt-event.entity';
import type { ContractenReadModel, KunstwerkenReadModel } from '../../application/ports';
import type { KunstwerkId } from '../../domain/gedeeld/waarden';
import type { EventDedup } from '../messaging/consumer-helpers';
import type { BeheerStore } from '../messaging/beheer-consumer';
import type { ContractStore } from '../messaging/contract-consumer';

@Injectable()
export class TypeOrmEventDedup implements EventDedup {
  constructor(@InjectRepository(VerwerktEventEntity) private readonly repo: Repository<VerwerktEventEntity>) {}
  async isVerwerkt(eventId: string): Promise<boolean> {
    return (await this.repo.findOne({ where: { eventId } })) !== null;
  }
  async markeerVerwerkt(eventId: string): Promise<void> {
    await this.repo.save({ eventId });
  }
}

@Injectable()
export class TypeOrmKunstwerkenReadModel implements KunstwerkenReadModel, BeheerStore {
  constructor(
    @InjectRepository(BekendKunstwerkEntity) private readonly kunstwerken: Repository<BekendKunstwerkEntity>,
    @InjectRepository(OnderhoudseisEntity) private readonly eisen: Repository<OnderhoudseisEntity>,
  ) {}

  async isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> {
    const e = await this.kunstwerken.findOne({ where: { kunstwerkId: id.waarde } });
    return e?.inGebruik ?? false;
  }
  async upsertKunstwerk(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void> {
    await this.kunstwerken.upsert({ kunstwerkId, type, locatie, inGebruik: true }, ['kunstwerkId']);
  }
  async markeerBuitenGebruik(kunstwerkId: string): Promise<void> {
    await this.kunstwerken.upsert({ kunstwerkId, inGebruik: false }, ['kunstwerkId']);
  }
  async bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void> {
    await this.eisen.upsert({ kunstwerkId, eisen }, ['kunstwerkId']);
  }
}

@Injectable()
export class TypeOrmContractenReadModel implements ContractenReadModel, ContractStore {
  constructor(@InjectRepository(GeldendContractEntity) private readonly repo: Repository<GeldendContractEntity>) {}

  async geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null> {
    const e = await this.repo.findOne({ where: { kunstwerkId: id.waarde, actief: true }, order: { bijgewerktOp: 'DESC' } });
    return e ? { contractId: e.contractId, opdrachtnemer: e.opdrachtnemer } : null;
  }
  async upsertGegund(p: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijdStart: string | null; looptijdEind: string | null }): Promise<void> {
    await this.repo.upsert(
      {
        contractId: p.contractId,
        kunstwerkId: p.kunstwerkId,
        opdrachtnemer: p.opdrachtnemer,
        looptijdStart: p.looptijdStart ? new Date(p.looptijdStart) : null,
        looptijdEind: p.looptijdEind ? new Date(p.looptijdEind) : null,
        actief: true,
      },
      ['contractId'],
    );
  }
  async markeerAfgerond(contractId: string): Promise<void> {
    await this.repo.update({ contractId }, { actief: false });
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- consumers`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add onderhoud/src/infrastructure/messaging onderhoud/src/infrastructure/db/typeorm-read-models.ts onderhoud/test/infrastructure/consumers.spec.ts
git commit -m "feat(onderhoud): idempotente consumers voor Monitoring, Contract en Beheer + read-models"
```

---

### Task 14: Infrastructure — Anti-Corruption Layer voor externe aannemersfacturen

Externe aannemers sturen facturen in hun eigen formaat. De ACL vertaalt dat formaat naar het interne `OntvangFactuurCommand`; het externe model komt nooit voorbij deze module.

**Files:**
- Create: `onderhoud/src/infrastructure/acl/aannemer-factuur-vertaler.ts`
- Test: `onderhoud/test/infrastructure/aannemer-factuur-vertaler.spec.ts`

**Interfaces:**
- Produces: `interface ExterneFactuur { invoiceNumber; workOrderRef; totalExVatCents; vatCents; currency; issuedAt }`, `class AclFout extends Error`, `vertaalExterneFactuur(extern): OntvangFactuurCommand` (gooit `AclFout` bij niet-EUR of ontbrekende `workOrderRef`).

- [ ] **Step 1: Write the failing test**

`onderhoud/test/infrastructure/aannemer-factuur-vertaler.spec.ts`:
```ts
import { AclFout, vertaalExterneFactuur } from '../../src/infrastructure/acl/aannemer-factuur-vertaler';

const extern = {
  invoiceNumber: 'INV-2026-042',
  workOrderRef: 'O-1',
  totalExVatCents: 200000,
  vatCents: 42000,
  currency: 'EUR',
  issuedAt: '2026-07-06',
};

describe('vertaalExterneFactuur', () => {
  it('vertaalt het externe formaat naar het interne command (incl. btw, centen naar euro)', () => {
    const command = vertaalExterneFactuur(extern);
    expect(command).toEqual({ onderhoudId: 'O-1', bedragEuro: 2420, ontvangenOp: '2026-07-06' });
  });

  it('weigert een niet-EUR-valuta', () => {
    expect(() => vertaalExterneFactuur({ ...extern, currency: 'USD' })).toThrow(AclFout);
  });

  it('weigert een factuur zonder werkorder-referentie', () => {
    expect(() => vertaalExterneFactuur({ ...extern, workOrderRef: '' })).toThrow(AclFout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aannemer-factuur-vertaler`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer de vertaler**

`onderhoud/src/infrastructure/acl/aannemer-factuur-vertaler.ts`:
```ts
import type { OntvangFactuurCommand } from '../../application/onderhoud/ontvang-factuur';

export class AclFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = 'AclFout';
  }
}

export interface ExterneFactuur {
  invoiceNumber: string;
  workOrderRef: string;
  totalExVatCents: number;
  vatCents: number;
  currency: string;
  issuedAt: string;
}

export function vertaalExterneFactuur(extern: ExterneFactuur): OntvangFactuurCommand {
  if (extern.currency !== 'EUR') throw new AclFout(`alleen EUR wordt ondersteund, kreeg ${extern.currency}`);
  if (!extern.workOrderRef || extern.workOrderRef.trim() === '') throw new AclFout('workOrderRef ontbreekt — geen koppeling naar een onderhoudstraject');
  return {
    onderhoudId: extern.workOrderRef,
    bedragEuro: (extern.totalExVatCents + extern.vatCents) / 100,
    ontvangenOp: extern.issuedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- aannemer-factuur-vertaler`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add onderhoud/src/infrastructure/acl onderhoud/test/infrastructure/aannemer-factuur-vertaler.spec.ts
git commit -m "feat(onderhoud): ACL voor externe aannemersfacturen"
```

---
### Task 15: Interface — DI-tokens, exception filter + storing/diagnose/onderhoud-controllers

REST-controllers voor de instappunten en het traject. Foutafhandeling gebeurt centraal in een `@Catch()`-filter: `DomeinFout` → 400 (of 404 bij "niet gevonden"), `AclFout` → 422. Bedrijfsregels blijven in `domain`.

**Files:**
- Create: `onderhoud/src/di-tokens.ts`
- Create: `onderhoud/src/interface/domein-fout.filter.ts`
- Create: `onderhoud/src/interface/storing.controller.ts`
- Create: `onderhoud/src/interface/diagnose.controller.ts`
- Create: `onderhoud/src/interface/onderhoud.controller.ts`
- Test: `onderhoud/test/interface/storing-onderhoud.spec.ts`

**Interfaces:**
- Produces: injectietokens (strings) `STORING_REPO`, `ONDERHOUD_REPO`, `SCHEMA_REPO`, `EVENT_PUBLISHER`, `KUNSTWERKEN_READ_MODEL`, `CONTRACTEN_READ_MODEL`, `CONTRACT_STORE`, `BEHEER_STORE`, `ID_GENERATOR`, `EVENT_DEDUP`.
- Produces: `class DomeinFoutFilter implements ExceptionFilter`.
- Produces: `StoringController` (`POST/GET /api/storingen`), `DiagnoseController` (`POST /api/diagnoses`), `OnderhoudController` (`GET /api/onderhoud`, `GET /api/onderhoud/:id`, `POST /api/onderhoud/:id/{start,inspecties,afronden,facturen,facturen/:factuurId/goedkeuring}`).

- [ ] **Step 1: DI-tokens + exception filter**

`onderhoud/src/di-tokens.ts`:
```ts
// Framework-vrije injectietokens voor de ports. `APP_CONFIG` staat in infrastructure/config.ts.
export const STORING_REPO = 'STORING_REPO';
export const ONDERHOUD_REPO = 'ONDERHOUD_REPO';
export const SCHEMA_REPO = 'SCHEMA_REPO';
export const EVENT_PUBLISHER = 'EVENT_PUBLISHER';
export const KUNSTWERKEN_READ_MODEL = 'KUNSTWERKEN_READ_MODEL';
export const CONTRACTEN_READ_MODEL = 'CONTRACTEN_READ_MODEL';
export const CONTRACT_STORE = 'CONTRACT_STORE';
export const BEHEER_STORE = 'BEHEER_STORE';
export const ID_GENERATOR = 'ID_GENERATOR';
export const EVENT_DEDUP = 'EVENT_DEDUP';
```

`onderhoud/src/interface/domein-fout.filter.ts`:
```ts
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomeinFout } from '../domain/gedeeld/fouten';
import { AclFout } from '../infrastructure/acl/aannemer-factuur-vertaler';

@Catch()
export class DomeinFoutFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof AclFout) {
      res.status(422).json({ fout: exception.message });
      return;
    }
    if (exception instanceof DomeinFout) {
      const code = exception.message.includes('niet gevonden') ? 404 : 400;
      res.status(code).json({ fout: exception.message });
      return;
    }
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ fout: 'interne fout' });
  }
}
```

- [ ] **Step 2: Write the failing test**

`onderhoud/test/interface/storing-onderhoud.spec.ts`:
```ts
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StoringController } from '../../src/interface/storing.controller';
import { DiagnoseController } from '../../src/interface/diagnose.controller';
import { OnderhoudController } from '../../src/interface/onderhoud.controller';
import { DomeinFoutFilter } from '../../src/interface/domein-fout.filter';
import { ONDERHOUD_REPO, STORING_REPO } from '../../src/di-tokens';
import { MeldStoring } from '../../src/application/storing/meld-storing';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../../src/application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../../src/application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../../src/application/onderhoud/keur-factuur-goed';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes';

async function bouwApp(): Promise<{ app: INestApplication; publisher: FakeEventPublisher }> {
  const storingen = new InMemoryStoringRepository();
  const onderhouden = new InMemoryOnderhoudRepository();
  const publisher = new FakeEventPublisher();
  const ids = new VasteIdGenerator('X');

  const moduleRef = await Test.createTestingModule({
    controllers: [StoringController, DiagnoseController, OnderhoudController],
    providers: [
      { provide: MeldStoring, useValue: new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(true), ids, 'soepel') },
      { provide: StelDiagnose, useValue: new StelDiagnose(onderhouden, ids) },
      { provide: StartOnderhoud, useValue: new StartOnderhoud(onderhouden, new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), publisher, 'soepel') },
      { provide: RegistreerInspectie, useValue: new RegistreerInspectie(onderhouden, ids) },
      { provide: RondOnderhoudAf, useValue: new RondOnderhoudAf(onderhouden, storingen, publisher) },
      { provide: OntvangFactuur, useValue: new OntvangFactuur(onderhouden, ids) },
      { provide: KeurFactuurGoed, useValue: new KeurFactuurGoed(onderhouden) },
      { provide: STORING_REPO, useValue: storingen },
      { provide: ONDERHOUD_REPO, useValue: onderhouden },
      { provide: APP_FILTER, useClass: DomeinFoutFilter },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  await app.init();
  return { app, publisher };
}

describe('storing- en onderhoud-controllers', () => {
  let app: INestApplication;
  let publisher: FakeEventPublisher;

  beforeEach(async () => {
    ({ app, publisher } = await bouwApp());
  });
  afterEach(async () => {
    await app.close();
  });

  it('meldt een storing via POST /api/storingen', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/storingen')
      .send({ kunstwerkId: 'KW1', omschrijving: 'scheur in pijler', ernst: 'Hoog' });
    expect(antwoord.status).toBe(201);
    expect(antwoord.body.storingId).toBe('X-1');
    expect(antwoord.body.onderhoudId).toBe('X-2');
    const lijst = await request(app.getHttpServer()).get('/api/storingen');
    expect(lijst.body).toHaveLength(1);
  });

  it('geeft 400 bij een ongeldige ernst', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/storingen')
      .send({ kunstwerkId: 'KW1', omschrijving: 'x', ernst: 'Enorm' });
    expect(antwoord.status).toBe(400);
  });

  it('doorloopt de hele trajectflow via de controllers', async () => {
    const server = app.getHttpServer();
    const diagnose = await request(server).post('/api/diagnoses').send({ kunstwerkId: 'KW1', incidentId: 'INC1', bevinding: 'trilling', ernst: 'Kritiek' });
    expect(diagnose.status).toBe(201);
    const onderhoudId = diagnose.body.onderhoudId as string;

    expect((await request(server).post(`/api/onderhoud/${onderhoudId}/start`).send({ datum: '2026-07-01' })).status).toBe(200);
    expect((await request(server).post(`/api/onderhoud/${onderhoudId}/inspecties`).send({ datum: '2026-07-05', oordeel: 'Goedgekeurd' })).status).toBe(201);
    const factuur = await request(server).post(`/api/onderhoud/${onderhoudId}/facturen`).send({ bedragEuro: 2500, ontvangenOp: '2026-07-06' });
    expect(factuur.status).toBe(201);
    expect((await request(server).post(`/api/onderhoud/${onderhoudId}/afronden`).send({ resultaat: 'hersteld', datum: '2026-07-10' })).status).toBe(200);
    expect((await request(server).post(`/api/onderhoud/${onderhoudId}/facturen/${factuur.body.factuurId}/goedkeuring`)).status).toBe(200);

    const detail = await request(server).get(`/api/onderhoud/${onderhoudId}`);
    expect(detail.body.status).toBe('Afgerond');
    expect(publisher.types()).toEqual(expect.arrayContaining(['onderhoud.onderhoud.gestart', 'onderhoud.onderhoud.afgerond']));
  });

  it('geeft 200 zonder traject bij een diagnose onder de drempel', async () => {
    const antwoord = await request(app.getHttpServer()).post('/api/diagnoses').send({ kunstwerkId: 'KW1', bevinding: 'lichte afwijking', ernst: 'Laag' });
    expect(antwoord.status).toBe(200);
    expect(antwoord.body.onderhoudId).toBeNull();
  });

  it('geeft 404 bij een onbekend traject', async () => {
    const server = app.getHttpServer();
    expect((await request(server).get('/api/onderhoud/BESTAAT-NIET')).status).toBe(404);
    expect((await request(server).post('/api/onderhoud/BESTAAT-NIET/start').send({ datum: '2026-07-01' })).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- storing-onderhoud`
Expected: FAIL — controllers/filter ontbreken.

- [ ] **Step 4: Implementeer `storing.controller.ts`**

`onderhoud/src/interface/storing.controller.ts`:
```ts
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MeldStoring, type MeldStoringCommand } from '../application/storing/meld-storing';
import { STORING_REPO } from '../di-tokens';
import type { StoringRepository } from '../domain/repositories';

@ApiTags('storingen')
@Controller('storingen')
export class StoringController {
  constructor(
    private readonly meldStoring: MeldStoring,
    @Inject(STORING_REPO) private readonly storingen: StoringRepository,
  ) {}

  @Post()
  async meld(@Body() body: MeldStoringCommand): Promise<{ storingId: string; onderhoudId?: string }> {
    return this.meldStoring.uitvoeren(body);
  }

  @Get()
  async lijst() {
    return (await this.storingen.zoekAlle()).map((s) => ({
      storingId: s.id.waarde,
      kunstwerkId: s.kunstwerkId.waarde,
      omschrijving: s.omschrijving,
      ernst: s.ernst,
      status: s.status,
      onderhoudId: s.onderhoudId?.waarde ?? null,
    }));
  }
}
```

- [ ] **Step 5: Implementeer `diagnose.controller.ts`**

`onderhoud/src/interface/diagnose.controller.ts`:
```ts
import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StelDiagnose, type StelDiagnoseCommand } from '../application/diagnose/stel-diagnose';

@ApiTags('diagnoses')
@Controller('diagnoses')
export class DiagnoseController {
  constructor(private readonly stelDiagnose: StelDiagnose) {}

  @Post()
  async stel(@Body() body: StelDiagnoseCommand, @Res({ passthrough: true }) res: Response): Promise<{ onderhoudId: string | null }> {
    const uitkomst = await this.stelDiagnose.uitvoeren(body);
    res.status(uitkomst.onderhoudId ? 201 : 200);
    return uitkomst;
  }
}
```

- [ ] **Step 6: Implementeer `onderhoud.controller.ts`**

`onderhoud/src/interface/onderhoud.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StartOnderhoud } from '../application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../application/onderhoud/keur-factuur-goed';
import { ONDERHOUD_REPO } from '../di-tokens';
import { DomeinFout } from '../domain/gedeeld/fouten';
import { OnderhoudId } from '../domain/gedeeld/waarden';
import type { InspectieOordeel, Onderhoud } from '../domain/onderhoud/onderhoud';
import type { OnderhoudRepository } from '../domain/repositories';

function naarDto(o: Onderhoud) {
  return {
    onderhoudId: o.id.waarde,
    kunstwerkId: o.kunstwerkId.waarde,
    status: o.status,
    aanleiding: o.aanleiding.soort,
    contractId: o.contractId?.waarde ?? null,
    gestartOp: o.gestartOp?.toISOString() ?? null,
    afgerondOp: o.afgerondOp?.toISOString() ?? null,
    resultaat: o.resultaat ?? null,
    inspecties: o.inspecties.map((i) => ({ inspectieId: i.id.waarde, datum: i.datum.toISOString(), oordeel: i.oordeel, opmerkingen: i.opmerkingen ?? null })),
    facturen: o.facturen.map((f) => ({ factuurId: f.id.waarde, bedragEuro: f.bedrag.euro, status: f.status, ontvangenOp: f.ontvangenOp.toISOString() })),
  };
}

@ApiTags('onderhoud')
@Controller('onderhoud')
export class OnderhoudController {
  constructor(
    private readonly start: StartOnderhoud,
    private readonly inspecteer: RegistreerInspectie,
    private readonly rondAf: RondOnderhoudAf,
    private readonly ontvangFactuur: OntvangFactuur,
    private readonly keurFactuurGoed: KeurFactuurGoed,
    @Inject(ONDERHOUD_REPO) private readonly onderhouden: OnderhoudRepository,
  ) {}

  @Get()
  async lijst() {
    return (await this.onderhouden.zoekAlle()).map(naarDto);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(id));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');
    return naarDto(traject);
  }

  @Post(':id/start')
  @HttpCode(200)
  async startTraject(@Param('id') id: string, @Body() body: { datum: string }) {
    await this.start.uitvoeren({ onderhoudId: id, datum: body.datum });
    return { status: 'Gestart' };
  }

  @Post(':id/inspecties')
  async inspectie(@Param('id') id: string, @Body() body: { datum: string; oordeel: InspectieOordeel; opmerkingen?: string }) {
    await this.inspecteer.uitvoeren({ onderhoudId: id, datum: body.datum, oordeel: body.oordeel, opmerkingen: body.opmerkingen });
    return { status: 'Geregistreerd' };
  }

  @Post(':id/afronden')
  @HttpCode(200)
  async afronden(@Param('id') id: string, @Body() body: { resultaat: string; datum: string }) {
    await this.rondAf.uitvoeren({ onderhoudId: id, resultaat: body.resultaat, datum: body.datum });
    return { status: 'Afgerond' };
  }

  @Post(':id/facturen')
  async factuur(@Param('id') id: string, @Body() body: { bedragEuro: number; ontvangenOp: string }) {
    return this.ontvangFactuur.uitvoeren({ onderhoudId: id, bedragEuro: body.bedragEuro, ontvangenOp: body.ontvangenOp });
  }

  @Post(':id/facturen/:factuurId/goedkeuring')
  @HttpCode(200)
  async keurGoed(@Param('id') id: string, @Param('factuurId') factuurId: string) {
    await this.keurFactuurGoed.uitvoeren({ onderhoudId: id, factuurId });
    return { status: 'Goedgekeurd' };
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- storing-onderhoud`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add onderhoud/src/di-tokens.ts onderhoud/src/interface onderhoud/test/interface/storing-onderhoud.spec.ts
git commit -m "feat(onderhoud): DI-tokens, exception filter en storing/diagnose/onderhoud-controllers"
```

---

### Task 16: Interface — schema-, externe-factuur- en contractaanvraag-controllers

**Files:**
- Create: `onderhoud/src/interface/schema.controller.ts`
- Create: `onderhoud/src/interface/extern.controller.ts`
- Create: `onderhoud/src/interface/contractaanvraag.controller.ts`
- Test: `onderhoud/test/interface/schema-extern.spec.ts`

**Interfaces:**
- Produces: `SchemaController` (`POST/GET /api/schemas`), `ExternController` (`POST /api/extern/facturen`, `AclFout` → 422), `ContractaanvraagController` (`POST /api/contractaanvragen`, 202).

- [ ] **Step 1: Write the failing test**

`onderhoud/test/interface/schema-extern.spec.ts`:
```ts
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SchemaController } from '../../src/interface/schema.controller';
import { ExternController } from '../../src/interface/extern.controller';
import { ContractaanvraagController } from '../../src/interface/contractaanvraag.controller';
import { DomeinFoutFilter } from '../../src/interface/domein-fout.filter';
import { SCHEMA_REPO } from '../../src/di-tokens';
import { MaakSchema } from '../../src/application/schema/maak-schema';
import { DienContractaanvraagIn } from '../../src/application/contractaanvraag/dien-contractaanvraag-in';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  InMemoryOnderhoudRepository,
  InMemorySchemaRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('schema- en extern-controllers', () => {
  let app: INestApplication;
  let publisher: FakeEventPublisher;
  let onderhouden: InMemoryOnderhoudRepository;
  let ids: VasteIdGenerator;

  beforeEach(async () => {
    publisher = new FakeEventPublisher();
    onderhouden = new InMemoryOnderhoudRepository();
    ids = new VasteIdGenerator('X');
    const schemas = new InMemorySchemaRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [SchemaController, ExternController, ContractaanvraagController],
      providers: [
        { provide: MaakSchema, useValue: new MaakSchema(schemas, new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), ids, 'soepel') },
        { provide: OntvangFactuur, useValue: new OntvangFactuur(onderhouden, ids) },
        { provide: DienContractaanvraagIn, useValue: new DienContractaanvraagIn(publisher) },
        { provide: SCHEMA_REPO, useValue: schemas },
        { provide: APP_FILTER, useClass: DomeinFoutFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('maakt een schema via POST /api/schemas', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/schemas')
      .send({ kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [{ datum: '2026-03-01', omschrijving: 'smeren' }] });
    expect(antwoord.status).toBe(201);
    expect(antwoord.body.schemaId).toBe('X-1');
  });

  it('geeft 400 bij een schema zonder momenten', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/schemas')
      .send({ kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [] });
    expect(antwoord.status).toBe(400);
  });

  it('ontvangt een externe factuur via de ACL', async () => {
    const { onderhoudId } = await new StelDiagnose(onderhouden, ids).uitvoeren({ kunstwerkId: 'KW1', bevinding: 'trilling', ernst: 'Kritiek' });
    await new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel').uitvoeren({ onderhoudId: onderhoudId!, datum: '2026-07-01' });
    const antwoord = await request(app.getHttpServer())
      .post('/api/extern/facturen')
      .send({ invoiceNumber: 'INV-1', workOrderRef: onderhoudId, totalExVatCents: 200000, vatCents: 42000, currency: 'EUR', issuedAt: '2026-07-06' });
    expect(antwoord.status).toBe(201);
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.facturen[0].bedrag.euro).toBe(2420);
  });

  it('geeft 422 bij een niet-EUR-factuur', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/extern/facturen')
      .send({ invoiceNumber: 'INV-1', workOrderRef: 'O-1', totalExVatCents: 1, vatCents: 0, currency: 'USD', issuedAt: '2026-07-06' });
    expect(antwoord.status).toBe(422);
  });

  it('dient een contractaanvraag in en publiceert het event', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/contractaanvragen')
      .send({ kunstwerkId: 'KW1', aanleiding: 'nieuw onderhoudsregime' });
    expect(antwoord.status).toBe(202);
    expect(publisher.types()).toContain('onderhoud.contractaanvraag.ingediend');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema-extern`
Expected: FAIL — controllers ontbreken.

- [ ] **Step 3: Implementeer `schema.controller.ts`**

`onderhoud/src/interface/schema.controller.ts`:
```ts
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MaakSchema, type MaakSchemaCommand } from '../application/schema/maak-schema';
import { SCHEMA_REPO } from '../di-tokens';
import type { SchemaRepository } from '../domain/repositories';

@ApiTags('schemas')
@Controller('schemas')
export class SchemaController {
  constructor(
    private readonly maakSchema: MaakSchema,
    @Inject(SCHEMA_REPO) private readonly schemas: SchemaRepository,
  ) {}

  @Post()
  async maak(@Body() body: MaakSchemaCommand): Promise<{ schemaId: string }> {
    return this.maakSchema.uitvoeren(body);
  }

  @Get()
  async lijst() {
    return (await this.schemas.zoekAlle()).map((s) => ({
      schemaId: s.id.waarde,
      kunstwerkId: s.kunstwerkId.waarde,
      contractId: s.contractId.waarde,
      aannemer: s.aannemer,
      periodeStart: s.periode.start.toISOString(),
      periodeEind: s.periode.eind.toISOString(),
      momenten: s.momenten.map((m) => ({ datum: m.datum.toISOString(), omschrijving: m.omschrijving })),
    }));
  }
}
```

- [ ] **Step 4: Implementeer `extern.controller.ts`**

`onderhoud/src/interface/extern.controller.ts`:
```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OntvangFactuur } from '../application/onderhoud/ontvang-factuur';
import { vertaalExterneFactuur, type ExterneFactuur } from '../infrastructure/acl/aannemer-factuur-vertaler';

@ApiTags('extern')
@Controller('extern')
export class ExternController {
  constructor(private readonly ontvangFactuur: OntvangFactuur) {}

  @Post('facturen')
  async factuur(@Body() body: ExterneFactuur): Promise<{ factuurId: string }> {
    const command = vertaalExterneFactuur(body);
    return this.ontvangFactuur.uitvoeren(command);
  }
}
```

- [ ] **Step 5: Implementeer `contractaanvraag.controller.ts`**

`onderhoud/src/interface/contractaanvraag.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DienContractaanvraagIn, type DienContractaanvraagInCommand } from '../application/contractaanvraag/dien-contractaanvraag-in';

@ApiTags('contractaanvragen')
@Controller('contractaanvragen')
export class ContractaanvraagController {
  constructor(private readonly dienContractaanvraagIn: DienContractaanvraagIn) {}

  @Post()
  @HttpCode(202)
  async dien(@Body() body: DienContractaanvraagInCommand): Promise<{ status: string }> {
    await this.dienContractaanvraagIn.uitvoeren(body);
    return { status: 'Ingediend' };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- schema-extern`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add onderhoud/src/interface onderhoud/test/interface/schema-extern.spec.ts
git commit -m "feat(onderhoud): schema-, externe-factuur- en contractaanvraag-controllers"
```

---
### Task 17: Compositie — `OnderhoudModule` (DI-bedrading) + OpenAPI + consumers

Bedraad alles in de module met tokens + `useFactory`-providers (de use-cases blijven framework-vrij), start de consumers na bootstrap, en zet OpenAPI aan.

**Files:**
- Create: `onderhoud/src/infrastructure/id-generator.ts`
- Create: `onderhoud/src/infrastructure/messaging/consumers.service.ts`
- Modify: `onderhoud/src/onderhoud.module.ts` (volledige bedrading)
- Modify: `onderhoud/src/main.ts` (Swagger)

**Interfaces:**
- Consumes: alle voorgaande taken.
- Produces: `class UuidIdGenerator implements IdGenerator`, `class ConsumersService implements OnApplicationBootstrap`, en de volledig bedrade `OnderhoudModule`.

- [ ] **Step 1: `UuidIdGenerator`**

`onderhoud/src/infrastructure/id-generator.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import type { IdGenerator } from '../application/ports';

@Injectable()
export class UuidIdGenerator implements IdGenerator {
  nieuw(): string {
    return uuid();
  }
}
```

- [ ] **Step 2: `ConsumersService` (start de 3 consumers na bootstrap)**

`onderhoud/src/infrastructure/messaging/consumers.service.ts`:
```ts
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { RabbitMqConnection } from './rabbitmq-connection';
import { startConsumer, type EventDedup } from './consumer-helpers';
import { MONITORING_BINDINGS, MONITORING_QUEUE, MonitoringIncidentVerwerker } from './monitoring-incident-consumer';
import { CONTRACT_BINDINGS, CONTRACT_QUEUE, ContractVerwerker, type ContractStore } from './contract-consumer';
import { BEHEER_BINDINGS, BEHEER_QUEUE, BeheerVerwerker, type BeheerStore } from './beheer-consumer';
import { StelDiagnose } from '../../application/diagnose/stel-diagnose';
import { BEHEER_STORE, CONTRACT_STORE, EVENT_DEDUP } from '../../di-tokens';

@Injectable()
export class ConsumersService implements OnApplicationBootstrap {
  constructor(
    private readonly connectie: RabbitMqConnection,
    private readonly stelDiagnose: StelDiagnose,
    @Inject(CONTRACT_STORE) private readonly contractStore: ContractStore,
    @Inject(BEHEER_STORE) private readonly beheerStore: BeheerStore,
    @Inject(EVENT_DEDUP) private readonly dedup: EventDedup,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const monitoring = new MonitoringIncidentVerwerker(this.stelDiagnose, this.dedup);
    const contract = new ContractVerwerker(this.contractStore, this.dedup);
    const beheer = new BeheerVerwerker(this.beheerStore, this.dedup);
    await startConsumer(this.connectie, MONITORING_QUEUE, MONITORING_BINDINGS, (env) => monitoring.verwerk(env));
    await startConsumer(this.connectie, CONTRACT_QUEUE, CONTRACT_BINDINGS, (env) => contract.verwerk(env));
    await startConsumer(this.connectie, BEHEER_QUEUE, BEHEER_BINDINGS, (env) => beheer.verwerk(env));
  }
}
```

- [ ] **Step 3: Volledige `OnderhoudModule`**

`onderhoud/src/onderhoud.module.ts` (vervang de inhoud):
```ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { APP_CONFIG, laadConfig, type Config } from './infrastructure/config';
import {
  BEHEER_STORE,
  CONTRACTEN_READ_MODEL,
  CONTRACT_STORE,
  EVENT_DEDUP,
  EVENT_PUBLISHER,
  ID_GENERATOR,
  KUNSTWERKEN_READ_MODEL,
  ONDERHOUD_REPO,
  SCHEMA_REPO,
  STORING_REPO,
} from './di-tokens';
import { alleEntiteiten, dataSourceOpties } from './infrastructure/db/data-source';
import { TypeOrmStoringRepository } from './infrastructure/db/typeorm-storing-repository';
import { TypeOrmOnderhoudRepository } from './infrastructure/db/typeorm-onderhoud-repository';
import { TypeOrmSchemaRepository } from './infrastructure/db/typeorm-schema-repository';
import { TypeOrmContractenReadModel, TypeOrmEventDedup, TypeOrmKunstwerkenReadModel } from './infrastructure/db/typeorm-read-models';
import { RabbitMqConnection } from './infrastructure/messaging/rabbitmq-connection';
import { RabbitMqEventPublisher } from './infrastructure/messaging/rabbitmq-event-publisher';
import { ConsumersService } from './infrastructure/messaging/consumers.service';
import { UuidIdGenerator } from './infrastructure/id-generator';

import { MeldStoring } from './application/storing/meld-storing';
import { StelDiagnose } from './application/diagnose/stel-diagnose';
import { StartOnderhoud } from './application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from './application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from './application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from './application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from './application/onderhoud/keur-factuur-goed';
import { MaakSchema } from './application/schema/maak-schema';
import { DienContractaanvraagIn } from './application/contractaanvraag/dien-contractaanvraag-in';

import { HealthController } from './interface/health.controller';
import { StoringController } from './interface/storing.controller';
import { DiagnoseController } from './interface/diagnose.controller';
import { OnderhoudController } from './interface/onderhoud.controller';
import { SchemaController } from './interface/schema.controller';
import { ExternController } from './interface/extern.controller';
import { ContractaanvraagController } from './interface/contractaanvraag.controller';
import { DomeinFoutFilter } from './interface/domein-fout.filter';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Config) => ({ ...dataSourceOpties(config.databaseUrl), migrationsRun: true }),
    }),
    TypeOrmModule.forFeature(alleEntiteiten),
  ],
  controllers: [
    HealthController,
    StoringController,
    DiagnoseController,
    OnderhoudController,
    SchemaController,
    ExternController,
    ContractaanvraagController,
  ],
  providers: [
    { provide: APP_CONFIG, useFactory: () => laadConfig(process.env) },
    RabbitMqConnection,
    ConsumersService,
    { provide: APP_FILTER, useClass: DomeinFoutFilter },

    // Adapters (concreet) + tokenbindingen
    { provide: ID_GENERATOR, useClass: UuidIdGenerator },
    { provide: STORING_REPO, useClass: TypeOrmStoringRepository },
    { provide: ONDERHOUD_REPO, useClass: TypeOrmOnderhoudRepository },
    { provide: SCHEMA_REPO, useClass: TypeOrmSchemaRepository },
    { provide: EVENT_DEDUP, useClass: TypeOrmEventDedup },

    // Read-models die twee poorten tegelijk bedienen: één instantie, twee tokens
    TypeOrmKunstwerkenReadModel,
    TypeOrmContractenReadModel,
    { provide: KUNSTWERKEN_READ_MODEL, useExisting: TypeOrmKunstwerkenReadModel },
    { provide: BEHEER_STORE, useExisting: TypeOrmKunstwerkenReadModel },
    { provide: CONTRACTEN_READ_MODEL, useExisting: TypeOrmContractenReadModel },
    { provide: CONTRACT_STORE, useExisting: TypeOrmContractenReadModel },

    // EventPublisher: kanaal lui via getter (connectie is er pas na onModuleInit)
    { provide: EVENT_PUBLISHER, useFactory: (conn: RabbitMqConnection) => new RabbitMqEventPublisher(() => conn.kanaal), inject: [RabbitMqConnection] },

    // Use-cases (framework-vrije plain classes) via factories
    { provide: MeldStoring, useFactory: (s, o, pub, kw, ids, cfg: Config) => new MeldStoring(s, o, pub, kw, ids, cfg.validatie), inject: [STORING_REPO, ONDERHOUD_REPO, EVENT_PUBLISHER, KUNSTWERKEN_READ_MODEL, ID_GENERATOR, APP_CONFIG] },
    { provide: StelDiagnose, useFactory: (o, ids) => new StelDiagnose(o, ids), inject: [ONDERHOUD_REPO, ID_GENERATOR] },
    { provide: StartOnderhoud, useFactory: (o, c, pub, cfg: Config) => new StartOnderhoud(o, c, pub, cfg.validatie), inject: [ONDERHOUD_REPO, CONTRACTEN_READ_MODEL, EVENT_PUBLISHER, APP_CONFIG] },
    { provide: RegistreerInspectie, useFactory: (o, ids) => new RegistreerInspectie(o, ids), inject: [ONDERHOUD_REPO, ID_GENERATOR] },
    { provide: RondOnderhoudAf, useFactory: (o, s, pub) => new RondOnderhoudAf(o, s, pub), inject: [ONDERHOUD_REPO, STORING_REPO, EVENT_PUBLISHER] },
    { provide: OntvangFactuur, useFactory: (o, ids) => new OntvangFactuur(o, ids), inject: [ONDERHOUD_REPO, ID_GENERATOR] },
    { provide: KeurFactuurGoed, useFactory: (o) => new KeurFactuurGoed(o), inject: [ONDERHOUD_REPO] },
    { provide: MaakSchema, useFactory: (s, c, ids, cfg: Config) => new MaakSchema(s, c, ids, cfg.validatie), inject: [SCHEMA_REPO, CONTRACTEN_READ_MODEL, ID_GENERATOR, APP_CONFIG] },
    { provide: DienContractaanvraagIn, useFactory: (pub) => new DienContractaanvraagIn(pub), inject: [EVENT_PUBLISHER] },
  ],
})
export class OnderhoudModule {}
```

> De use-case-factories injecteren de **ports via tokens**, dus de application-laag blijft vrij van Nest/TypeORM. `useExisting` zorgt dat `TypeOrmKunstwerkenReadModel`/`TypeOrmContractenReadModel` telkens **dezelfde** instantie leveren aan hun twee tokens (read-model + store), zodat consumer-writes en use-case-reads over hetzelfde object lopen.

- [ ] **Step 4: OpenAPI in `main.ts`**

`onderhoud/src/main.ts` (vervang de inhoud):
```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { OnderhoudModule } from './onderhoud.module';
import { APP_CONFIG, type Config } from './infrastructure/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(OnderhoudModule);
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });

  const swaggerConfig = new DocumentBuilder().setTitle('Onderhoud-service').setVersion('0.1.0').build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const config = app.get<Config>(APP_CONFIG);
  await app.listen(config.poort, '0.0.0.0');
}

bootstrap().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
```

- [ ] **Step 5: Volledige build + alle tests**

Run: `npm run build && npm test`
Expected: build zonder fouten; alle unit-/controller-tests groen.

- [ ] **Step 6: Manuele smoke-test**

Run: repo-root `docker compose up -d postgres rabbitmq`; in `onderhoud/` met lokale `DATABASE_URL` `npm run build && node dist/main.js` (migraties draaien automatisch via `migrationsRun`).
Verifieer:
```bash
curl -s localhost:8003/health
curl -s -X POST localhost:8003/api/storingen -H 'content-type: application/json' \
  -d '{"kunstwerkId":"KW1","omschrijving":"scheur in pijler","ernst":"Hoog"}'
# neem de onderhoudId over uit het antwoord (hierna <OID>)
curl -s -X POST localhost:8003/api/onderhoud/<OID>/start -H 'content-type: application/json' -d '{"datum":"2026-07-01"}'
curl -s -X POST localhost:8003/api/onderhoud/<OID>/inspecties -H 'content-type: application/json' -d '{"datum":"2026-07-05","oordeel":"Goedgekeurd"}'
curl -s -X POST localhost:8003/api/onderhoud/<OID>/afronden -H 'content-type: application/json' -d '{"resultaat":"hersteld","datum":"2026-07-10"}'
curl -s localhost:8003/api/onderhoud
```
Expected: health 200; POST's 200/201; `GET /api/onderhoud` toont het afgeronde traject. Controleer in de RabbitMQ-UI (`http://localhost:15672`) dat events op `rws.events` verschenen (bind een tijdelijke queue op `onderhoud.#`) en dat de queues `onderhoud.monitoring-incident`, `onderhoud.contract`, `onderhoud.beheer` bestaan. Open `http://localhost:8003/api/docs` voor de OpenAPI-UI.

- [ ] **Step 7: Commit**

```bash
git add onderhoud/src/infrastructure/id-generator.ts onderhoud/src/infrastructure/messaging/consumers.service.ts onderhoud/src/onderhoud.module.ts onderhoud/src/main.ts
git commit -m "feat(onderhoud): compositie-module (DI-tokens + factories), OpenAPI en consumers"
```

---

### Task 18: Docker + docker-compose + README + eind-verificatie

**Files:**
- Modify: `onderhoud/Dockerfile`
- Create: `onderhoud/.dockerignore`
- Modify: `docker-compose.yml` (repo-root — `onderhoud`-blok activeren)
- Modify: `onderhoud/README.md` (stack + plan-verwijzing bijwerken)

**Interfaces:** geen code-interfaces; leveren een draaiende container.

- [ ] **Step 1: Dockerfile (multi-stage Node/NestJS)**

Vervang de inhoud van `onderhoud/Dockerfile`:
```dockerfile
# Onderhoud-service — NestJS (TypeScript) multi-stage. Migraties draaien bij bootstrap (migrationsRun).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8003
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: `.dockerignore`**

`onderhoud/.dockerignore`:
```
node_modules
dist
.env
test
*.tsbuildinfo
```

- [ ] **Step 3: Compose-blok activeren**

In `docker-compose.yml` (repo-root): verwijder de `#`-comments van het `onderhoud`-blok. Laat de andere service-blokken ongemoeid.

- [ ] **Step 4: README bijwerken**

In `onderhoud/README.md`, sectie **Implementatie**: vervang de "Geplande stack (Fase 1)"-regel door de werkelijke stack en verwijs naar dit plan:
```
- **Stack (Fase 1):** Node.js 22, TypeScript, NestJS + TypeORM (PostgreSQL `onderhoud_db`),
  amqplib, Jest.
- **Plan:** [docs/superpowers/plans/2026-07-02-onderhoud-service-nestjs-fase-1.md](../docs/superpowers/plans/2026-07-02-onderhoud-service-nestjs-fase-1.md)
```

- [ ] **Step 5: `.env` aanmaken + eind-verificatie via compose**

Run (in `onderhoud/`): `cp .env.example .env` (laat de hostnamen op `postgres`/`rabbitmq` staan — binnen compose kloppen die).
Run (repo-root): `docker compose up --build onderhoud postgres rabbitmq`
Verifieer in een tweede shell:
```bash
curl -s localhost:8003/health         # {"status":"ok","db":true,"broker":true}
```
Herhaal de POST-flow uit Task 17 tegen `localhost:8003`. Publiceer als extra check via de RabbitMQ-UI een testbericht op `rws.events` met routing key `monitoring.incident.aangemaakt` en body:
```json
{ "eventId": "test-1", "eventType": "monitoring.incident.aangemaakt", "occurredAt": "2026-07-01T12:00:00Z", "producer": "monitoring", "version": 1, "data": { "incidentId": "INC1", "kunstwerkId": "KW1", "ernst": "Kritiek", "omschrijving": "trilling boven drempel" } }
```
Expected: `GET /api/onderhoud` toont een nieuw gepland traject met aanleiding `Diagnose`; nogmaals hetzelfde bericht publiceren maakt géén tweede traject (idempotentie via `verwerkt_event`).

- [ ] **Step 6: Commit**

```bash
git add onderhoud/Dockerfile onderhoud/.dockerignore docker-compose.yml onderhoud/README.md
git commit -m "feat(onderhoud): Docker-image, compose-integratie en README-stackupdate"
```

---

## Self-Review (uitgevoerd)

**Spec-dekking:** alle 4 gepubliceerde events (Tasks 6/7/10/12), beide instappunten MeldStoring + StelDiagnose (9), traject met StartOnderhoud/AfrondenOnderhoud + Inspectie + Factuur (7/10), OnderhoudsSchema met gegunde aannemer (8/10), contractaanvraag naar Contract (10/16), ACL externe aannemers (14/16), idempotente consumers voor `monitoring.incident.aangemaakt` / `contract.onderhoudscontract.*` / `beheer.onderhoudseisen.vastgesteld` / `beheer.kunstwerk.*` (13/17), REST `GET /api/onderhoud` + `POST /api/storingen` + traject-/schema-routes (15/16), OpenAPI + health + Docker (17/18). ✔

**Stackvertaling:** Prisma → TypeORM (entiteiten + migraties, Task 2/11), Fastify → NestJS-controllers + `@Catch()`-filter (15/16), `main.ts`-bedrading → `OnderhoudModule` met DI-tokens/`useFactory` (17), `@fastify/swagger` → `@nestjs/swagger` (17), Vitest → Jest (`*.spec.ts`, alle taken). Domein + application blijven identiek en framework-vrij. ✔

**Fase-grens:** strenge validatie als default, reageren op `beheer.kunstwerk.buitengebruikgesteld` richting lopende trajecten, AannemerId-eigen-aggregate, herplannen van schema-momenten, Testcontainers en Dokploy zitten bewust **niet** in dit plan (Fase 2, zie `docs/vervolgstappen.md`). ✔

**Type-consistentie:** `trekEventsLeeg`, `OnderhoudDomainEvent`, `Bedrag.centen/euro`, `ernstVan`, `vereistOnderhoud`, repo-interfaces (`domain/repositories.ts`), ports (`application/ports.ts`) en DI-tokens (`di-tokens.ts`) worden vóór gebruik gedefinieerd; controller-providers (15/16) matchen de use-case-factories in de module (17); `KanaalPublish` via getter is consistent tussen publisher (12) en module-factory (17). ✔

## Aandachtspunten bij uitvoering

- **CommonJS + decorators:** imports **zonder** `.js`-extensie; `reflect-metadata` staat als Jest-`setupFiles` en wordt in `main.ts` als eerste geïmporteerd. Entiteiten/DI leunen op `emitDecoratorMetadata` + `experimentalDecorators` (tsconfig).
- **`APP_CONFIG` vóór TypeORM:** `TypeOrmModule.forRootAsync` injecteert `APP_CONFIG`; die provider staat in dezelfde module. Klaagt Nest over resolutievolgorde, verplaats `APP_CONFIG` naar een kleine `@Global()`-`ConfigModule` die je importeert.
- **Migraties bij bootstrap:** `migrationsRun: true` draait `InitReadmodel` + `Domeintabellen` automatisch bij het opstarten (lokaal en in de container) — er is dus géén aparte migrate-stap in de `CMD` nodig. De CLI-variant (`npm run migration:run`) gebruikt dezelfde `data-source.ts`.
- **`amqplib` 0.10.5-typen:** `connect()` levert een `ChannelModel`; sluit in `onModuleDestroy` eerst het kanaal, dan de verbinding.
- **`MeldStoring` gebruikt de `IdGenerator` twee keer** bij Hoog/Kritiek (storing + traject); de tests rekenen op `X-1`/`X-2`.
- **Read-model-instanties gedeeld via twee tokens** (`useExisting`) zodat consumer-writes en use-case-reads over hetzelfde object lopen; de dedupe (`verwerkt_event`) is service-breed op `eventId`.
- **De drie consumers starten in `onApplicationBootstrap`** — ná `RabbitMqConnection.onModuleInit`, zodat het kanaal verbonden is.

