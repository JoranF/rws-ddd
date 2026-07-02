# Onderhoud-service Fase 1 — Implementation Plan (NestJS + TypeORM)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠️ Stackbesluit gewijzigd (2026-07-01):** Onderhoud gebruikt **Node.js + NestJS + TypeORM** (niet Fastify/Prisma), voor meer stackdiversiteit in de repo. Dezelfde lagen, domeinlogica en use-cases blijven gelden, maar de taakcode hieronder staat nog in de oorspronkelijke Fastify/Prisma-vorm en moet in de nieuwe tools (her)schreven worden — bij voorkeur door de Onderhoud-eigenaar of via een verse `writing-plans`-ronde. Zie [docs/vervolgstappen.md](../../vervolgstappen.md) voor het stackoverzicht en de Fase 2-integratie.

**Goal:** Bouw de Onderhoud bounded context (Fase 1) als zelfstandig draaiende service: drie aggregates (Storing, Onderhoud, OnderhoudsSchema), twee instappunten (MeldStoring + StelDiagnose), alle 4 gepubliceerde events, idempotente consumers voor Monitoring/Contract/Beheer, een Anti-Corruption Layer voor externe aannemersfacturen, REST + OpenAPI, en Docker.

**Architecture:** Vier lagen met de afhankelijkheidsregel naar binnen (`interface → application → domain`, `infrastructure → domain/application`). `domain` is **puur TypeScript zonder NestJS-, TypeORM- of andere framework-imports** — dat is de kern van de laagscheiding en het maakt het domein snel en los te testen. NestJS levert de dependency-injection, HTTP en modules; TypeORM de persistentie; amqplib de RabbitMQ-integratie. Bouwvolgorde: walking skeleton (Nest-app/DB/broker/health) → domein met TDD → applicatie-use-cases (als injectables) met in-memory fakes → infrastructure (TypeORM-repos, publisher, consumers, ACL) → interface (controllers + DTO's) + modules → Docker.

**Tech Stack:** Node.js 22, TypeScript (CommonJS/`nest build`), **NestJS 11** (Express-platform), **TypeORM 0.3** (+ PostgreSQL `onderhoud_db`, migraties), **amqplib** (RabbitMQ topic-exchange `rws.events`), `@nestjs/config`, `@nestjs/terminus` (health), `@nestjs/swagger` (OpenAPI), `class-validator`/`class-transformer` (DTO-validatie), **Jest** + `supertest` (tests), uuid.

> **Waarom deze stack.** Het team spreekt bewust verschillende stacks af per service om te bewijzen dat de contexts alleen via REST/events koppelen (zie `docs/vervolgstappen.md`). Onderhoud draait op **NestJS + TypeORM** (Contract op Fastify + Prisma, Beheer op Python/FastAPI, Monitoring op .NET). Poort, DB-naam, event-envelope en `/health` zijn identiek ongeacht stack.

> **Waarom Jest i.p.v. Vitest.** NestJS leunt op `emitDecoratorMetadata` voor dependency-injection. Vitest (esbuild) emit die metadata niet zonder extra SWC-plugin; Jest met `ts-jest` doet dat out-of-the-box. Nest-conventie is `*.spec.ts`. De domein-/applicatietests zijn framework-vrij en draaien even goed in Jest.

> **Waarom amqplib i.p.v. `@nestjs/microservices`.** De Nest RMQ-transport is queue-/RPC-georiënteerd; ons contract (`docs/events.md`) is een gedeelde durable **topic-exchange** met eigen routing keys en een vaste envelope. amqplib in een Nest-provider mapt daar 1-op-1 op en houdt de envelope exact.

## Global Constraints

- Poort **8003** via `SERVICE_PORT`; DB via `DATABASE_URL` (`postgres://rws:rws@postgres:5432/onderhoud_db`); broker via `RABBITMQ_URL` (`amqp://rws:rws@rabbitmq:5672`).
- Globale route-prefix **`/api`**, met `/health` uitgezonderd (`app.setGlobalPrefix('api', { exclude: ['health'] })`). `GET /health` geeft `200` zodra DB- en broker-connectie er zijn.
- Events publiceren op durable topic-exchange **`rws.events`**, routing key `onderhoud.<aggregate>.<event>`, met de vaste envelope: `{ eventId (uuid), eventType, occurredAt (ISO-8601 UTC), producer:"onderhoud", version:1, data }`.
- Gepubliceerde events (exact deze 4, payloads uit `docs/events.md`): `onderhoud.storing.gemeld`, `onderhoud.onderhoud.gestart`, `onderhoud.onderhoud.afgerond`, `onderhoud.contractaanvraag.ingediend`.
- Geconsumeerde events: `monitoring.incident.aangemaakt`, `contract.onderhoudscontract.gegund` (+ `.afgerond`), `beheer.kunstwerk.*`, `beheer.onderhoudseisen.vastgesteld`. Consumers zijn **idempotent** (dedupe op `eventId` in tabel `verwerkt_event`).
- Ubiquitous language uit `onderhoud/README.md`: Storing (StoringId) · Diagnose · Onderhoud (OnderhoudId) · OnderhoudsSchema (SchemaId) · Inspectie · Factuur (FactuurId) · AannemerId · Status. `kunstwerkId`/`contractId`/`incidentId` zijn referenties naar andere contexts — nooit hun model kopiëren.
- `ernst` volgt de enum uit het verslag: **Laag / Middel / Hoog / Kritiek**.
- Vertaal inkomende events en externe aannemersformaten aan de rand (`infrastructure`); envelope en externe modellen lekken nooit in `domain`.
- `domain` importeert **niets** uit `infrastructure`/`interface`/NestJS/TypeORM. Geen decorators op domeinklassen.
- `VALIDATIE` = `soepel` (default, Fase 1: onbekend kunstwerk/contract → waarschuwing) of `streng` (Fase 2: weigeren).
- Bedragen als gehele **centen** (integer); valuta `EUR`.
- Poort-injectie in Nest gaat via **string-tokens** (bv. `STORING_REPOSITORY`, `EVENT_PUBLISHER`); use cases hangen af van de domein-/applicatie-interfaces, niet van concrete klassen.
- Werk op branch `onderhoud-service`. Commit na elke taak.

---

### Task 1: NestJS-scaffold + config + `/health` (static)

Walking-skeleton-start: een NestJS-app die op 8003 draait met globale prefix `/api` en een statisch `/health` via Terminus.

**Files:**
- Create: `onderhoud/package.json`
- Create: `onderhoud/tsconfig.json`
- Create: `onderhoud/tsconfig.build.json`
- Create: `onderhoud/nest-cli.json`
- Create: `onderhoud/.gitignore`
- Create: `onderhoud/src/infrastructure/config/config.ts`
- Create: `onderhoud/src/infrastructure/config/config.module.ts`
- Create: `onderhoud/src/interface/health/health.controller.ts`
- Create: `onderhoud/src/interface/health/health.module.ts`
- Create: `onderhoud/src/app.module.ts`
- Create: `onderhoud/src/main.ts`
- Test: `onderhoud/test/infrastructure/config.spec.ts`

**Interfaces:**
- Produces: `laadConfig(env: NodeJS.ProcessEnv): AppConfig` waarbij `AppConfig = { poort: number; databaseUrl: string; rabbitmqUrl: string; validatie: 'soepel' | 'streng' }`; token `APP_CONFIG`.
- Produces: `AppModule` (uitgebreid in latere taken), `HealthModule`.

- [ ] **Step 1: Branch aanmaken + scaffold `package.json`**

```bash
git checkout -b onderhoud-service
```

`onderhoud/package.json`:
```json
{
  "name": "onderhoud-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "typeorm": "typeorm-ts-node-commonjs -d src/infrastructure/db/data-source.ts",
    "migration:generate": "npm run typeorm -- migration:generate",
    "migration:run": "npm run typeorm -- migration:run"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/swagger": "^8.1.0",
    "@nestjs/terminus": "^11.0.0",
    "@nestjs/typeorm": "^11.0.0",
    "amqplib": "^0.10.5",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "pg": "^8.13.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.20",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
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
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": ".",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "collectCoverageFrom": ["src/**/*.ts"],
    "testEnvironment": "node"
  }
}
```

> **Let op:** anders dan de Prisma-versie gebruiken we **geen** `"type": "module"`. NestJS + TypeORM + `ts-jest` draaien op CommonJS; imports gebruiken daarom **geen** `.js`-extensie.

- [ ] **Step 2: `tsconfig.json` + `tsconfig.build.json`**

`onderhoud/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "moduleResolution": "node",
    "outDir": "./dist",
    "baseUrl": "./",
    "declaration": false,
    "sourceMap": true,
    "esModuleInterop": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist"]
}
```

> `strictPropertyInitialization: false` is nodig omdat NestJS-controllers/providers en TypeORM-entities eigenschappen via DI/ORM vullen. De rest van `strict` blijft aan.

`onderhoud/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

- [ ] **Step 3: `nest-cli.json` en `.gitignore`**

`onderhoud/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

`onderhoud/.gitignore`:
```
node_modules/
dist/
.env
```

- [ ] **Step 4: Write the failing test voor config**

`onderhoud/test/infrastructure/config.spec.ts`:
```ts
import { laadConfig } from '../../src/infrastructure/config/config';

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

  it('gooit als een verplichte variabele ontbreekt', () => {
    expect(() => laadConfig({ ...basis, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd onderhoud && npm install && npm test -- config`
Expected: FAIL — `laadConfig` bestaat nog niet.

- [ ] **Step 6: Implementeer `config.ts` + `config.module.ts`**

`onderhoud/src/infrastructure/config/config.ts`:
```ts
export interface AppConfig {
  poort: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  validatie: 'soepel' | 'streng';
}

export const APP_CONFIG = 'APP_CONFIG';

function verplicht(env: NodeJS.ProcessEnv, naam: string): string {
  const waarde = env[naam];
  if (!waarde) throw new Error(`Ontbrekende omgevingsvariabele: ${naam}`);
  return waarde;
}

export function laadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    poort: Number(env.SERVICE_PORT ?? '8003'),
    databaseUrl: verplicht(env, 'DATABASE_URL'),
    rabbitmqUrl: verplicht(env, 'RABBITMQ_URL'),
    validatie: env.VALIDATIE === 'streng' ? 'streng' : 'soepel',
  };
}
```

`onderhoud/src/infrastructure/config/config.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, laadConfig } from './config';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => laadConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS (2 tests).

- [ ] **Step 8: Health-controller + module (static)**

`onderhoud/src/interface/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
```

`onderhoud/src/interface/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 9: `app.module.ts` + `main.ts`**

`onderhoud/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { HealthModule } from './interface/health/health.module';

@Module({
  imports: [AppConfigModule, HealthModule],
})
export class AppModule {}
```

`onderhoud/src/main.ts`:
```ts
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
```

- [ ] **Step 10: Manuele verificatie**

Run: `SERVICE_PORT=8003 DATABASE_URL=x RABBITMQ_URL=x npm run start` en in een tweede shell `curl -s localhost:8003/health`.
Expected: `{"status":"ok","info":{},"error":{},"details":{}}` en HTTP 200. `curl -s localhost:8003/api/health` geeft 404 (health staat buiten de prefix). Stop de server.

- [ ] **Step 11: Commit**

```bash
git add onderhoud/package.json onderhoud/tsconfig.json onderhoud/tsconfig.build.json onderhoud/nest-cli.json onderhoud/.gitignore onderhoud/src onderhoud/test
git commit -m "feat(onderhoud): NestJS-scaffold met config en /health"
```

---

### Task 2: TypeORM-bootstrap + DB-health

Verbind met `onderhoud_db` via TypeORM en laat `/health` de DB pingen. Nu alleen de read-model-/idempotentie-entities; domein-entities volgen in Task 11.

**Files:**
- Create: `onderhoud/src/infrastructure/db/entities/bekend-kunstwerk.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/geldend-contract.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/onderhoudseis.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/verwerkt-event.entity.ts`
- Create: `onderhoud/src/infrastructure/db/data-source.ts`
- Create: `onderhoud/src/infrastructure/db/database.module.ts`
- Modify: `onderhoud/src/app.module.ts`
- Modify: `onderhoud/src/interface/health/health.controller.ts`
- Modify: `onderhoud/src/interface/health/health.module.ts`
- Modify: `onderhoud/.env.example` (var `VALIDATIE` toevoegen)

**Interfaces:**
- Consumes: `APP_CONFIG`/`AppConfig` (Task 1).
- Produces: `buildTypeOrmOptions(databaseUrl: string): DataSourceOptions`, `AppDataSource` (voor de CLI), `DatabaseModule`.

- [ ] **Step 1: Read-model-entities**

`onderhoud/src/infrastructure/db/entities/bekend-kunstwerk.entity.ts`:
```ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'bekend_kunstwerk' })
export class BekendKunstwerkEntity {
  @PrimaryColumn()
  kunstwerkId: string;

  @Column({ type: 'text', nullable: true })
  type: string | null;

  @Column({ type: 'text', nullable: true })
  locatie: string | null;

  @Column({ default: true })
  inGebruik: boolean;

  @UpdateDateColumn()
  bijgewerktOp: Date;
}
```

`onderhoud/src/infrastructure/db/entities/geldend-contract.entity.ts`:
```ts
import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'geldend_contract' })
export class GeldendContractEntity {
  @PrimaryColumn()
  contractId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  opdrachtnemer: string;

  @Column({ type: 'timestamptz', nullable: true })
  looptijdStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  looptijdEind: Date | null;

  @Column({ default: true })
  actief: boolean;

  @UpdateDateColumn()
  bijgewerktOp: Date;
}
```

`onderhoud/src/infrastructure/db/entities/onderhoudseis.entity.ts`:
```ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'onderhoudseis' })
export class OnderhoudseisEntity {
  @PrimaryColumn()
  kunstwerkId: string;

  @Column({ type: 'jsonb' })
  eisen: unknown;

  @UpdateDateColumn()
  bijgewerktOp: Date;
}
```

`onderhoud/src/infrastructure/db/entities/verwerkt-event.entity.ts`:
```ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'verwerkt_event' })
export class VerwerktEventEntity {
  @PrimaryColumn()
  eventId: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  verwerktOp: Date;
}
```

- [ ] **Step 2: `data-source.ts` (gedeeld door app + CLI)**

`onderhoud/src/infrastructure/db/data-source.ts`:
```ts
import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';

export function buildTypeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [__dirname + '/entities/*.entity.{ts,js}'],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize: false,
  };
}

// Voor de TypeORM-CLI (migration:generate / migration:run).
export const AppDataSource = new DataSource(
  buildTypeOrmOptions(process.env.DATABASE_URL ?? 'postgres://rws:rws@localhost:5432/onderhoud_db'),
);
```

- [ ] **Step 3: `database.module.ts`**

`onderhoud/src/infrastructure/db/database.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { buildTypeOrmOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        ...buildTypeOrmOptions(config.databaseUrl),
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
```

> `migrationsRun: true` draait openstaande migraties bij het opstarten — de NestJS/TypeORM-tegenhanger van `prisma migrate deploy` in de container.

- [ ] **Step 4: `.env.example` bijwerken**

`onderhoud/.env.example`:
```
# Onderhoud service — kopieer naar .env
SERVICE_PORT=8003
DATABASE_URL=postgres://rws:rws@postgres:5432/onderhoud_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
VALIDATIE=soepel
```

- [ ] **Step 5: Migratie aanmaken**

Start de gedeelde infra vanuit de repo-root: `docker compose up -d postgres`.
Run (in `onderhoud/`): `DATABASE_URL=postgres://rws:rws@localhost:5432/onderhoud_db npm run migration:generate -- src/infrastructure/db/migrations/InitReadModel`
Expected: migratie `src/infrastructure/db/migrations/*-InitReadModel.ts` aangemaakt met de vier tabellen. Draai `DATABASE_URL=postgres://rws:rws@localhost:5432/onderhoud_db npm run migration:run` en controleer dat `bekend_kunstwerk`, `geldend_contract`, `onderhoudseis`, `verwerkt_event` bestaan.

- [ ] **Step 6: DB-health via Terminus koppelen**

`onderhoud/src/interface/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
```

`onderhoud/src/interface/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

> `TypeOrmHealthIndicator` gebruikt de default TypeORM-connectie uit `DatabaseModule`; geen extra provider nodig.

- [ ] **Step 7: `app.module.ts` uitbreiden**

`onderhoud/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/db/database.module';
import { HealthModule } from './interface/health/health.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 8: Manuele verificatie**

Run: `cp .env.example .env` (zet `DATABASE_URL`-host op `localhost` voor lokaal draaien), dan `npm run start`, dan `curl -s localhost:8003/health`.
Expected: `{"status":"ok",...,"details":{"database":{"status":"up"}}}` (HTTP 200). Zet postgres stil → `status:"error"` en HTTP 503.

- [ ] **Step 9: Commit**

```bash
git add onderhoud/src/infrastructure/db onderhoud/src/interface/health onderhoud/src/app.module.ts onderhoud/.env.example
git commit -m "feat(onderhoud): TypeORM-bootstrap met read-modeltabellen en DB-health"
```

---

### Task 3: RabbitMQ-connectie + broker-health

Bewijs broker-connectiviteit met een amqplib-provider die de durable topic-exchange declareert. Nog geen event-mapping (publisher in Task 12, consumers in Task 13).

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/rabbitmq-connectie.ts`
- Create: `onderhoud/src/infrastructure/messaging/messaging.module.ts`
- Create: `onderhoud/src/interface/health/broker-health.indicator.ts`
- Modify: `onderhoud/src/interface/health/health.controller.ts`
- Modify: `onderhoud/src/interface/health/health.module.ts`
- Modify: `onderhoud/src/app.module.ts`

**Interfaces:**
- Consumes: `APP_CONFIG`/`AppConfig` (Task 1).
- Produces: `class RabbitMqConnectie { static async verbind(url: string): Promise<RabbitMqConnectie>; get kanaal(): Channel; isVerbonden(): boolean; async sluit(): Promise<void> }`; constante `RWS_EXCHANGE = 'rws.events'`; token `RABBITMQ_CONNECTIE`; `MessagingModule` (global) dat de connectie als provider levert; `BrokerHealthIndicator`.

- [ ] **Step 1: Connectiemodule (framework-vrij)**

`onderhoud/src/infrastructure/messaging/rabbitmq-connectie.ts`:
```ts
import amqp, { type ChannelModel, type Channel } from 'amqplib';

const EXCHANGE = 'rws.events';

export class RabbitMqConnectie {
  private constructor(
    private readonly verbinding: ChannelModel,
    private readonly ch: Channel,
  ) {}

  static async verbind(url: string): Promise<RabbitMqConnectie> {
    const verbinding = await amqp.connect(url);
    const ch = await verbinding.createChannel();
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
    return new RabbitMqConnectie(verbinding, ch);
  }

  get kanaal(): Channel {
    return this.ch;
  }

  isVerbonden(): boolean {
    return this.ch !== undefined;
  }

  async sluit(): Promise<void> {
    await this.ch.close();
    await this.verbinding.close();
  }
}

export const RWS_EXCHANGE = EXCHANGE;
export const RABBITMQ_CONNECTIE = 'RABBITMQ_CONNECTIE';
```

- [ ] **Step 2: `messaging.module.ts` (async provider)**

`onderhoud/src/infrastructure/messaging/messaging.module.ts`:
```ts
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
```

- [ ] **Step 3: Broker-health-indicator**

`onderhoud/src/interface/health/broker-health.indicator.ts`:
```ts
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
```

> `HealthIndicatorService` is de Terminus 11-API voor eigen indicatoren (`check(key).up()/.down()`).

- [ ] **Step 4: Broker-health koppelen**

`onderhoud/src/interface/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { BrokerHealthIndicator } from './broker-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly broker: BrokerHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.broker.isGezond('broker'),
    ]);
  }
}
```

`onderhoud/src/interface/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { BrokerHealthIndicator } from './broker-health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [BrokerHealthIndicator],
})
export class HealthModule {}
```

- [ ] **Step 5: `app.module.ts` uitbreiden**

`onderhoud/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/db/database.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { HealthModule } from './interface/health/health.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, MessagingModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 6: Manuele verificatie**

Run: repo-root `docker compose up -d rabbitmq postgres`; dan in `onderhoud/` `npm run start`; `curl -s localhost:8003/health`.
Expected: `status:"ok"` met `details.database.status:"up"` en `details.broker.status:"up"`. Open `http://localhost:15672` (rws/rws) → exchange `rws.events` bestaat (type topic, durable).

- [ ] **Step 7: Commit**

```bash
git add onderhoud/src/infrastructure/messaging onderhoud/src/interface/health onderhoud/src/app.module.ts
git commit -m "feat(onderhoud): RabbitMQ-connectie en broker-health"
```

---

### Task 4: Domein — value objects

Pure value objects met invarianten. Volledig TDD; **geen NestJS/TypeORM-imports, geen decorators**.

**Files:**
- Create: `onderhoud/src/domain/gedeeld/fouten.ts`
- Create: `onderhoud/src/domain/gedeeld/waarden.ts`
- Test: `onderhoud/test/domain/waarden.spec.ts`

**Interfaces:**
- Produces: `class DomeinFout extends Error`.
- Produces: identiteiten `StoringId`, `OnderhoudId`, `SchemaId`, `FactuurId`, `InspectieId`, `KunstwerkId`, `ContractId`, `IncidentId`, `AannemerId` (elk: `static van(waarde: string)`, `readonly waarde: string`, `gelijkAan(a): boolean`).
- Produces: `type Ernst = 'Laag' | 'Middel' | 'Hoog' | 'Kritiek'` + `ernstVan(waarde: string): Ernst`.
- Produces: `class Bedrag { static vanEuro(euro: number, valuta?: string): Bedrag; static vanCenten(centen: number, valuta?: string): Bedrag; readonly centen: number; readonly valuta: string; get euro(): number }`.
- Produces: `class Periode { static van(start: Date, eind: Date): Periode; readonly start: Date; readonly eind: Date; bevat(datum: Date): boolean }`.

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
  static van(waarde: string): StoringId {
    return new StoringId(eisNietLeeg(waarde, 'storingId'));
  }
}
export class OnderhoudId extends Identiteit {
  static van(waarde: string): OnderhoudId {
    return new OnderhoudId(eisNietLeeg(waarde, 'onderhoudId'));
  }
}
export class SchemaId extends Identiteit {
  static van(waarde: string): SchemaId {
    return new SchemaId(eisNietLeeg(waarde, 'schemaId'));
  }
}
export class FactuurId extends Identiteit {
  static van(waarde: string): FactuurId {
    return new FactuurId(eisNietLeeg(waarde, 'factuurId'));
  }
}
export class InspectieId extends Identiteit {
  static van(waarde: string): InspectieId {
    return new InspectieId(eisNietLeeg(waarde, 'inspectieId'));
  }
}
export class KunstwerkId extends Identiteit {
  static van(waarde: string): KunstwerkId {
    return new KunstwerkId(eisNietLeeg(waarde, 'kunstwerkId'));
  }
}
export class ContractId extends Identiteit {
  static van(waarde: string): ContractId {
    return new ContractId(eisNietLeeg(waarde, 'contractId'));
  }
}
export class IncidentId extends Identiteit {
  static van(waarde: string): IncidentId {
    return new IncidentId(eisNietLeeg(waarde, 'incidentId'));
  }
}
export class AannemerId extends Identiteit {
  static van(waarde: string): AannemerId {
    return new AannemerId(eisNietLeeg(waarde, 'aannemerId'));
  }
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
  get euro(): number {
    return this.centen / 100;
  }
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
Expected: PASS (alle assertions).

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/domain/gedeeld onderhoud/test/domain/waarden.spec.ts
git commit -m "feat(onderhoud): domein-value-objects met invarianten"
```

---

### Task 5: Domein — AggregateRoot + event-definities

Basisklasse voor event-registratie en de discriminated union van alle 4 gepubliceerde domain events (payloads = `data`-velden uit `docs/events.md`).

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
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5).
- Produces: `type StoringStatus = 'Gemeld' | 'InBehandeling' | 'Afgehandeld'`.
- Produces: `class Storing extends AggregateRoot` met:
  - `static meld(p: { id: StoringId; kunstwerkId: KunstwerkId; omschrijving: string; ernst: Ernst }): Storing`
  - `koppelAanOnderhoud(onderhoudId: OnderhoudId): void`
  - `handelAf(): void`
  - getters: `id`, `kunstwerkId`, `omschrijving`, `ernst`, `status`, `onderhoudId: OnderhoudId | undefined`.
  - `static herstel(p): Storing` (voor de repo; zonder events).
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
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5), `Diagnose` (Task 6).
- Produces: `type OnderhoudStatus = 'Gepland' | 'Gestart' | 'Afgerond'`.
- Produces: `type Aanleiding = { soort: 'Storing'; storingId: StoringId } | { soort: 'Diagnose'; diagnose: Diagnose }`.
- Produces: `type InspectieOordeel = 'Goedgekeurd' | 'Afgekeurd'`; `interface Inspectie { id: InspectieId; datum: Date; oordeel: InspectieOordeel; opmerkingen?: string }`.
- Produces: `type FactuurStatus = 'Ontvangen' | 'Goedgekeurd' | 'Afgekeurd'`; `interface Factuur { id: FactuurId; bedrag: Bedrag; status: FactuurStatus; ontvangenOp: Date }`.
- Produces: `class Onderhoud extends AggregateRoot` met:
  - `static plan(p: { id: OnderhoudId; kunstwerkId: KunstwerkId; aanleiding: Aanleiding }): Onderhoud` (status `Gepland`, geen event)
  - `start(p: { datum: Date; contractId?: ContractId; aannemerId?: AannemerId }): void` → event `onderhoud.onderhoud.gestart`
  - `registreerInspectie(p: { id: InspectieId; datum: Date; oordeel: InspectieOordeel; opmerkingen?: string }): void`
  - `rondAf(p: { resultaat: string; datum: Date }): void` → event `onderhoud.onderhoud.afgerond`
  - `ontvangFactuur(p: { id: FactuurId; bedrag: Bedrag; ontvangenOp: Date }): void`
  - `keurFactuurGoed(factuurId: FactuurId): void`
  - getters: `id`, `kunstwerkId`, `status`, `aanleiding`, `contractId`, `aannemerId`, `gestartOp`, `afgerondOp`, `resultaat`, `inspecties`, `facturen`.
  - `static herstel(p): Onderhoud`.

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

Het schema met de gegunde aannemer, plus de repository-interfaces van alle drie de aggregates (contracten horen in `domain`, implementaties in `infrastructure`).

**Files:**
- Create: `onderhoud/src/domain/schema/onderhouds-schema.ts`
- Create: `onderhoud/src/domain/repositories.ts`
- Test: `onderhoud/test/domain/onderhouds-schema.spec.ts`

**Interfaces:**
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5), aggregates (Tasks 6-7).
- Produces: `interface GeplandMoment { datum: Date; omschrijving: string }`.
- Produces: `class OnderhoudsSchema extends AggregateRoot` met:
  - `static maak(p: { id: SchemaId; kunstwerkId: KunstwerkId; contractId: ContractId; aannemer: string; periode: Periode; momenten: GeplandMoment[] }): OnderhoudsSchema`
  - `voegMomentToe(m: GeplandMoment): void`
  - getters: `id`, `kunstwerkId`, `contractId`, `aannemer`, `periode`, `momenten`.
  - `static herstel(p): OnderhoudsSchema`.
- Produces (repository-interfaces + DI-tokens):
  - `interface StoringRepository { bewaar(s: Storing): Promise<void>; zoek(id: StoringId): Promise<Storing | null>; zoekAlle(): Promise<Storing[]> }` + `STORING_REPOSITORY`
  - `interface OnderhoudRepository { bewaar(o: Onderhoud): Promise<void>; zoek(id: OnderhoudId): Promise<Onderhoud | null>; zoekAlle(): Promise<Onderhoud[]>; zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> }` + `ONDERHOUD_REPOSITORY`
  - `interface SchemaRepository { bewaar(s: OnderhoudsSchema): Promise<void>; zoek(id: SchemaId): Promise<OnderhoudsSchema | null>; zoekAlle(): Promise<OnderhoudsSchema[]> }` + `SCHEMA_REPOSITORY`

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

export const STORING_REPOSITORY = 'STORING_REPOSITORY';
export const ONDERHOUD_REPOSITORY = 'ONDERHOUD_REPOSITORY';
export const SCHEMA_REPOSITORY = 'SCHEMA_REPOSITORY';

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

De twee instappunten uit de README. `MeldStoring` plant bij ernst Hoog/Kritiek automatisch een onderhoudstraject en koppelt de storing; `StelDiagnose` doet hetzelfde op basis van monitoringdata (incident). **Use cases zijn plain TypeScript-klassen zonder NestJS-decorators** — de DI-bedrading (Task 17) roept `new` aan via `useFactory`, zodat de application-laag framework-vrij blijft en de unit-tests de fakes rechtstreeks injecteren.

**Files:**
- Create: `onderhoud/src/application/ports.ts`
- Create: `onderhoud/src/application/storing/meld-storing.ts`
- Create: `onderhoud/src/application/diagnose/stel-diagnose.ts`
- Create: `onderhoud/test/support/fakes.ts`
- Test: `onderhoud/test/application/instap-usecases.spec.ts`

**Interfaces:**
- Consumes: repository-interfaces (Task 8), aggregates (Tasks 6-8), `vereistOnderhoud` (Task 6).
- Produces (ports + DI-tokens):
  - `interface EventPublisher { publiceer(events: OnderhoudDomainEvent[]): Promise<void> }` + `EVENT_PUBLISHER`
  - `interface KunstwerkenReadModel { isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> }` + `KUNSTWERKEN_READ_MODEL`
  - `interface ContractenReadModel { geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null> }` + `CONTRACTEN_READ_MODEL`
  - `interface IdGenerator { nieuw(): string }` + `ID_GENERATOR`
- Produces (use cases): `MeldStoring`, `StelDiagnose` (elk `uitvoeren(cmd)`).
- Produces (test-fakes): `InMemoryStoringRepository`, `InMemoryOnderhoudRepository`, `InMemorySchemaRepository`, `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `FakeContractenReadModel`, `VasteIdGenerator`.

- [ ] **Step 1: Ports definiëren**

`onderhoud/src/application/ports.ts`:
```ts
import type { KunstwerkId } from '../domain/gedeeld/waarden';
import type { OnderhoudDomainEvent } from '../domain/gedeeld/domain-events';

export const EVENT_PUBLISHER = 'EVENT_PUBLISHER';
export const KUNSTWERKEN_READ_MODEL = 'KUNSTWERKEN_READ_MODEL';
export const CONTRACTEN_READ_MODEL = 'CONTRACTEN_READ_MODEL';
export const ID_GENERATOR = 'ID_GENERATOR';

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

De rest van de use cases: traject sturen (`StartOnderhoud`/`RegistreerInspectie`/`RondOnderhoudAf`), factuurafhandeling, `MaakSchema` en `DienContractaanvraagIn`. Queries lopen in Fase 1 rechtstreeks via de repositories. Ook deze use cases zijn plain klassen zonder decorators.

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
- Consumes: aggregates (Tasks 6-8), repos (Task 8), ports + fakes (Task 9).
- Produces:
  - `class StartOnderhoud { constructor(onderhouden: OnderhoudRepository, contracten: ContractenReadModel, publisher: EventPublisher, validatie: 'soepel' | 'streng'); uitvoeren(cmd: { onderhoudId: string; datum: string }): Promise<void> }`
  - `class RegistreerInspectie { constructor(onderhouden: OnderhoudRepository, ids: IdGenerator); uitvoeren(cmd: { onderhoudId: string; datum: string; oordeel: 'Goedgekeurd' | 'Afgekeurd'; opmerkingen?: string }): Promise<void> }`
  - `class RondOnderhoudAf { constructor(onderhouden: OnderhoudRepository, storingen: StoringRepository, publisher: EventPublisher); uitvoeren(cmd: { onderhoudId: string; resultaat: string; datum: string }): Promise<void> }`
  - `class OntvangFactuur { constructor(onderhouden: OnderhoudRepository, ids: IdGenerator); uitvoeren(cmd: { onderhoudId: string; bedragEuro: number; ontvangenOp: string }): Promise<{ factuurId: string }> }`
  - `class KeurFactuurGoed { constructor(onderhouden: OnderhoudRepository); uitvoeren(cmd: { onderhoudId: string; factuurId: string }): Promise<void> }`
  - `class MaakSchema { constructor(schemas: SchemaRepository, contracten: ContractenReadModel, ids: IdGenerator, validatie: 'soepel' | 'streng'); uitvoeren(cmd: { kunstwerkId: string; periodeStart: string; periodeEind: string; momenten: Array<{ datum: string; omschrijving: string }> }): Promise<{ schemaId: string }> }`
  - `class DienContractaanvraagIn { constructor(publisher: EventPublisher); uitvoeren(cmd: { kunstwerkId: string; aanleiding: string }): Promise<void> }`

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

### Task 11: Infrastructure — TypeORM-domein-entities, mappers + repo-implementaties

Persistente opslag voor de drie aggregates. Pure mappers vertalen tussen entity en domeinobject (los getest, zonder DB); de repo-klassen (`@Injectable`, `@InjectRepository`) doen de I/O. Domeinobjecten blijven TypeORM-vrij dankzij de `herstel`-fabrieken.

**Files:**
- Create: `onderhoud/src/infrastructure/db/entities/storing.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/onderhoud.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/inspectie.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/factuur.entity.ts`
- Create: `onderhoud/src/infrastructure/db/entities/onderhouds-schema.entity.ts`
- Create: `onderhoud/src/infrastructure/db/typeorm-storing-repository.ts`
- Create: `onderhoud/src/infrastructure/db/typeorm-onderhoud-repository.ts`
- Create: `onderhoud/src/infrastructure/db/typeorm-schema-repository.ts`
- Test: `onderhoud/test/infrastructure/typeorm-mapping.spec.ts`

**Interfaces:**
- Consumes: repository-interfaces (Task 8), aggregates (Tasks 6-8).
- Produces: entities `StoringEntity`, `OnderhoudEntity`, `InspectieEntity`, `FactuurEntity`, `OnderhoudsSchemaEntity`.
- Produces: `TypeOrmStoringRepository`, `TypeOrmOnderhoudRepository`, `TypeOrmSchemaRepository` (implementeren de domain-interfaces) plus pure mappers `storingNaarEntity`/`entityNaarStoring`, `onderhoudNaarEntity`/`entityNaarOnderhoud`, `schemaNaarEntity`/`entityNaarSchema`.

- [ ] **Step 1: Domein-entities**

`onderhoud/src/infrastructure/db/entities/storing.entity.ts`:
```ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'storing' })
export class StoringEntity {
  @PrimaryColumn()
  storingId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  omschrijving: string;

  @Column()
  ernst: string;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  onderhoudId: string | null;
}
```

`onderhoud/src/infrastructure/db/entities/inspectie.entity.ts`:
```ts
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OnderhoudEntity } from './onderhoud.entity';

@Entity({ name: 'inspectie' })
export class InspectieEntity {
  @PrimaryColumn()
  inspectieId: string;

  @Column()
  onderhoudId: string;

  @Column({ type: 'timestamptz' })
  datum: Date;

  @Column()
  oordeel: string;

  @Column({ type: 'text', nullable: true })
  opmerkingen: string | null;

  @ManyToOne(() => OnderhoudEntity, (o) => o.inspecties, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'onderhoudId' })
  onderhoud: OnderhoudEntity;
}
```

`onderhoud/src/infrastructure/db/entities/factuur.entity.ts`:
```ts
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OnderhoudEntity } from './onderhoud.entity';

@Entity({ name: 'factuur' })
export class FactuurEntity {
  @PrimaryColumn()
  factuurId: string;

  @Column()
  onderhoudId: string;

  @Column({ type: 'int' })
  bedragCenten: number;

  @Column({ default: 'EUR' })
  valuta: string;

  @Column()
  status: string;

  @Column({ type: 'timestamptz' })
  ontvangenOp: Date;

  @ManyToOne(() => OnderhoudEntity, (o) => o.facturen, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'onderhoudId' })
  onderhoud: OnderhoudEntity;
}
```

`onderhoud/src/infrastructure/db/entities/onderhoud.entity.ts`:
```ts
import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { InspectieEntity } from './inspectie.entity';
import { FactuurEntity } from './factuur.entity';

@Entity({ name: 'onderhoud' })
export class OnderhoudEntity {
  @PrimaryColumn()
  onderhoudId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  status: string;

  @Column()
  aanleidingSoort: string;

  @Column({ type: 'text', nullable: true })
  storingId: string | null;

  @Column({ type: 'text', nullable: true })
  incidentId: string | null;

  @Column({ type: 'text', nullable: true })
  bevinding: string | null;

  @Column({ type: 'text', nullable: true })
  ernst: string | null;

  @Column({ type: 'text', nullable: true })
  contractId: string | null;

  @Column({ type: 'text', nullable: true })
  aannemerId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  gestartOp: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  afgerondOp: Date | null;

  @Column({ type: 'text', nullable: true })
  resultaat: string | null;

  @OneToMany(() => InspectieEntity, (i) => i.onderhoud, { cascade: true, eager: true })
  inspecties: InspectieEntity[];

  @OneToMany(() => FactuurEntity, (f) => f.onderhoud, { cascade: true, eager: true })
  facturen: FactuurEntity[];
}
```

`onderhoud/src/infrastructure/db/entities/onderhouds-schema.entity.ts`:
```ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'onderhouds_schema' })
export class OnderhoudsSchemaEntity {
  @PrimaryColumn()
  schemaId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  contractId: string;

  @Column()
  aannemer: string;

  @Column({ type: 'timestamptz' })
  periodeStart: Date;

  @Column({ type: 'timestamptz' })
  periodeEind: Date;

  @Column({ type: 'jsonb' })
  momenten: Array<{ datum: string; omschrijving: string }>;
}
```

- [ ] **Step 2: Migratie aanmaken**

Run (in `onderhoud/`, met lokale `DATABASE_URL` op host `localhost`): `npm run migration:generate -- src/infrastructure/db/migrations/DomeinTabellen` en daarna `npm run migration:run`.
Expected: migratie met de tabellen `storing`, `onderhoud`, `inspectie`, `factuur`, `onderhouds_schema` (incl. FK's op `onderhoud`). Controleer met `\dt` in psql of ze bestaan.

- [ ] **Step 3: Write the failing test (pure mappers)**

`onderhoud/test/infrastructure/typeorm-mapping.spec.ts`:
```ts
import { entityNaarStoring, storingNaarEntity } from '../../src/infrastructure/db/typeorm-storing-repository';
import { entityNaarOnderhoud, onderhoudNaarEntity } from '../../src/infrastructure/db/typeorm-onderhoud-repository';
import { entityNaarSchema, schemaNaarEntity } from '../../src/infrastructure/db/typeorm-schema-repository';
import { Storing } from '../../src/domain/storing/storing';
import { Onderhoud } from '../../src/domain/onderhoud/onderhoud';
import { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema';
import { Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, Periode, SchemaId, StoringId } from '../../src/domain/gedeeld/waarden';

describe('typeorm-mapping', () => {
  it('mapt een Storing heen en terug', () => {
    const storing = Storing.meld({ id: StoringId.van('S1'), kunstwerkId: KunstwerkId.van('KW1'), omschrijving: 'scheur', ernst: 'Hoog' });
    storing.koppelAanOnderhoud(OnderhoudId.van('O1'));
    const terug = entityNaarStoring(storingNaarEntity(storing));
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
    const terug = entityNaarOnderhoud(onderhoudNaarEntity(traject));
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
    const terug = entityNaarSchema(schemaNaarEntity(schema));
    expect(terug.aannemer).toBe('BAM');
    expect(terug.momenten[0].omschrijving).toBe('smeren');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- typeorm-mapping`
Expected: FAIL — modules ontbreken.

- [ ] **Step 5: Implementeer `typeorm-storing-repository.ts`**

`onderhoud/src/infrastructure/db/typeorm-storing-repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoringEntity } from './entities/storing.entity';
import { Storing, type StoringStatus } from '../../domain/storing/storing';
import { ernstVan, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden';
import type { StoringRepository } from '../../domain/repositories';

export function storingNaarEntity(s: Storing): StoringEntity {
  const e = new StoringEntity();
  e.storingId = s.id.waarde;
  e.kunstwerkId = s.kunstwerkId.waarde;
  e.omschrijving = s.omschrijving;
  e.ernst = s.ernst;
  e.status = s.status;
  e.onderhoudId = s.onderhoudId?.waarde ?? null;
  return e;
}

export function entityNaarStoring(e: StoringEntity): Storing {
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
    await this.repo.save(storingNaarEntity(s));
  }

  async zoek(id: StoringId): Promise<Storing | null> {
    const e = await this.repo.findOne({ where: { storingId: id.waarde } });
    return e ? entityNaarStoring(e) : null;
  }

  async zoekAlle(): Promise<Storing[]> {
    return (await this.repo.find()).map(entityNaarStoring);
  }
}
```

- [ ] **Step 6: Implementeer `typeorm-onderhoud-repository.ts`**

`onderhoud/src/infrastructure/db/typeorm-onderhoud-repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnderhoudEntity } from './entities/onderhoud.entity';
import { InspectieEntity } from './entities/inspectie.entity';
import { FactuurEntity } from './entities/factuur.entity';
import { Onderhoud, type Aanleiding, type FactuurStatus, type InspectieOordeel, type OnderhoudStatus } from '../../domain/onderhoud/onderhoud';
import { AannemerId, Bedrag, ContractId, ernstVan, FactuurId, IncidentId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden';
import type { OnderhoudRepository } from '../../domain/repositories';

export function onderhoudNaarEntity(o: Onderhoud): OnderhoudEntity {
  const e = new OnderhoudEntity();
  e.onderhoudId = o.id.waarde;
  e.kunstwerkId = o.kunstwerkId.waarde;
  e.status = o.status;
  const aanleiding = o.aanleiding;
  e.aanleidingSoort = aanleiding.soort;
  e.storingId = aanleiding.soort === 'Storing' ? aanleiding.storingId.waarde : null;
  e.incidentId = aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.incidentId?.waarde ?? null : null;
  e.bevinding = aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.bevinding : null;
  e.ernst = aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.ernst : null;
  e.contractId = o.contractId?.waarde ?? null;
  e.aannemerId = o.aannemerId?.waarde ?? null;
  e.gestartOp = o.gestartOp ?? null;
  e.afgerondOp = o.afgerondOp ?? null;
  e.resultaat = o.resultaat ?? null;
  e.inspecties = o.inspecties.map((i) => {
    const ie = new InspectieEntity();
    ie.inspectieId = i.id.waarde;
    ie.onderhoudId = o.id.waarde;
    ie.datum = i.datum;
    ie.oordeel = i.oordeel;
    ie.opmerkingen = i.opmerkingen ?? null;
    return ie;
  });
  e.facturen = o.facturen.map((f) => {
    const fe = new FactuurEntity();
    fe.factuurId = f.id.waarde;
    fe.onderhoudId = o.id.waarde;
    fe.bedragCenten = f.bedrag.centen;
    fe.valuta = f.bedrag.valuta;
    fe.status = f.status;
    fe.ontvangenOp = f.ontvangenOp;
    return fe;
  });
  return e;
}

export function entityNaarOnderhoud(e: OnderhoudEntity): Onderhoud {
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
    inspecties: (e.inspecties ?? []).map((i) => ({
      id: InspectieId.van(i.inspectieId),
      datum: i.datum,
      oordeel: i.oordeel as InspectieOordeel,
      opmerkingen: i.opmerkingen ?? undefined,
    })),
    facturen: (e.facturen ?? []).map((f) => ({
      id: FactuurId.van(f.factuurId),
      bedrag: Bedrag.vanCenten(f.bedragCenten, f.valuta),
      status: f.status as FactuurStatus,
      ontvangenOp: f.ontvangenOp,
    })),
  });
}

@Injectable()
export class TypeOrmOnderhoudRepository implements OnderhoudRepository {
  constructor(@InjectRepository(OnderhoudEntity) private readonly repo: Repository<OnderhoudEntity>) {}

  async bewaar(o: Onderhoud): Promise<void> {
    await this.repo.save(onderhoudNaarEntity(o));
  }

  async zoek(id: OnderhoudId): Promise<Onderhoud | null> {
    const e = await this.repo.findOne({ where: { onderhoudId: id.waarde } });
    return e ? entityNaarOnderhoud(e) : null;
  }

  async zoekAlle(): Promise<Onderhoud[]> {
    return (await this.repo.find()).map(entityNaarOnderhoud);
  }

  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> {
    return (await this.repo.find({ where: { kunstwerkId: kunstwerkId.waarde } })).map(entityNaarOnderhoud);
  }
}
```

> `inspecties`/`facturen` staan op `eager: true` + `cascade: true`, dus `find`/`findOne` laadt ze mee en `save` persisteert ze in één keer. In Fase 1 worden ze alleen toegevoegd, nooit verwijderd; orphan-removal is daarom niet nodig.

- [ ] **Step 7: Implementeer `typeorm-schema-repository.ts`**

`onderhoud/src/infrastructure/db/typeorm-schema-repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnderhoudsSchemaEntity } from './entities/onderhouds-schema.entity';
import { OnderhoudsSchema } from '../../domain/schema/onderhouds-schema';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../domain/gedeeld/waarden';
import type { SchemaRepository } from '../../domain/repositories';

export function schemaNaarEntity(s: OnderhoudsSchema): OnderhoudsSchemaEntity {
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

export function entityNaarSchema(e: OnderhoudsSchemaEntity): OnderhoudsSchema {
  return OnderhoudsSchema.herstel({
    id: SchemaId.van(e.schemaId),
    kunstwerkId: KunstwerkId.van(e.kunstwerkId),
    contractId: ContractId.van(e.contractId),
    aannemer: e.aannemer,
    periode: Periode.van(new Date(e.periodeStart), new Date(e.periodeEind)),
    momenten: e.momenten.map((m) => ({ datum: new Date(m.datum), omschrijving: m.omschrijving })),
  });
}

@Injectable()
export class TypeOrmSchemaRepository implements SchemaRepository {
  constructor(@InjectRepository(OnderhoudsSchemaEntity) private readonly repo: Repository<OnderhoudsSchemaEntity>) {}

  async bewaar(s: OnderhoudsSchema): Promise<void> {
    await this.repo.save(schemaNaarEntity(s));
  }

  async zoek(id: SchemaId): Promise<OnderhoudsSchema | null> {
    const e = await this.repo.findOne({ where: { schemaId: id.waarde } });
    return e ? entityNaarSchema(e) : null;
  }

  async zoekAlle(): Promise<OnderhoudsSchema[]> {
    return (await this.repo.find()).map(entityNaarSchema);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- typeorm-mapping`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add onderhoud/src/infrastructure/db onderhoud/test/infrastructure/typeorm-mapping.spec.ts
git commit -m "feat(onderhoud): TypeORM-domein-entities, mappers en repo-implementaties"
```

---

### Task 12: Infrastructure — RabbitMQ EventPublisher (envelope)

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/rabbitmq-event-publisher.ts`
- Test: `onderhoud/test/infrastructure/rabbitmq-event-publisher.spec.ts`

**Interfaces:**
- Consumes: `EventPublisher` (Task 9), `OnderhoudDomainEvent` (Task 5), `RWS_EXCHANGE` (Task 3).
- Produces: `class RabbitMqEventPublisher implements EventPublisher` — constructor `(kanaal: KanaalPublish, idGenerator?: () => string, klok?: () => Date)`, met `interface KanaalPublish { publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean }`. Framework-vrij; de Nest-provider (Task 17) levert de `kanaal` uit de connectie.

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
    const publisher = new RabbitMqEventPublisher(kanaal, () => 'vaste-uuid', () => new Date('2026-07-01T12:00:00Z'));

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
import { RWS_EXCHANGE } from './rabbitmq-connectie';

export interface KanaalPublish {
  publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean;
}

export class RabbitMqEventPublisher implements EventPublisher {
  constructor(
    private readonly kanaal: KanaalPublish,
    private readonly nieuwId: () => string = uuid,
    private readonly nu: () => Date = () => new Date(),
  ) {}

  async publiceer(events: OnderhoudDomainEvent[]): Promise<void> {
    for (const event of events) {
      const envelope = {
        eventId: this.nieuwId(),
        eventType: event.eventType,
        occurredAt: this.nu().toISOString(),
        producer: 'onderhoud',
        version: 1,
        data: event.data,
      };
      this.kanaal.publish(RWS_EXCHANGE, event.eventType, Buffer.from(JSON.stringify(envelope)), { persistent: true });
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

Drie consumers, elk met eigen durable queue op `rws.events`. Vertaling van envelope naar use-case/read-model gebeurt hier — de envelope komt niet voorbij deze laag. Dedupe op `eventId` via één gedeelde `TypeOrmEventDedup`. De verwerkers zijn framework-vrij (plain klassen, direct te testen); de bedrading naar de queues (`startConsumer`) en het opstarten (`OnModuleInit`) staan in Task 17.

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/consumer-helpers.ts`
- Create: `onderhoud/src/infrastructure/messaging/monitoring-incident-consumer.ts`
- Create: `onderhoud/src/infrastructure/messaging/contract-consumer.ts`
- Create: `onderhoud/src/infrastructure/messaging/beheer-consumer.ts`
- Create: `onderhoud/src/infrastructure/db/typeorm-read-models.ts`
- Test: `onderhoud/test/infrastructure/consumers.spec.ts`

**Interfaces:**
- Consumes: `StelDiagnose` (Task 9), `KunstwerkenReadModel`/`ContractenReadModel` (Task 9), `RabbitMqConnectie`/`RWS_EXCHANGE` (Task 3), entities (Task 2).
- Produces (helpers): `interface Envelope { eventId: string; eventType: string; data: Record<string, unknown> }`, `interface EventDedup { isVerwerkt(eventId): Promise<boolean>; markeerVerwerkt(eventId): Promise<void> }`, `startConsumer(connectie, queue, bindings, verwerk): Promise<void>`.
- Produces (verwerkers, idempotent): `MonitoringIncidentVerwerker`, `ContractVerwerker` (+ `ContractStore`), `BeheerVerwerker` (+ `BeheerStore`), elk met queue/bindings-constanten.
- Produces (TypeORM): `TypeOrmEventDedup`, `TypeOrmKunstwerkenReadModel` (impl. `KunstwerkenReadModel` + `BeheerStore`), `TypeOrmContractenReadModel` (impl. `ContractenReadModel` + `ContractStore`).

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
import type { RabbitMqConnectie } from './rabbitmq-connectie';
import { RWS_EXCHANGE } from './rabbitmq-connectie';

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
  connectie: RabbitMqConnectie,
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
      await verwerk(JSON.parse(bericht.content.toString()));
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
    await this.repo.save(this.repo.create({ eventId }));
  }
}

@Injectable()
export class TypeOrmKunstwerkenReadModel implements KunstwerkenReadModel, BeheerStore {
  constructor(
    @InjectRepository(BekendKunstwerkEntity) private readonly kunstwerken: Repository<BekendKunstwerkEntity>,
    @InjectRepository(OnderhoudseisEntity) private readonly eisen: Repository<OnderhoudseisEntity>,
  ) {}

  async isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> {
    const rij = await this.kunstwerken.findOne({ where: { kunstwerkId: id.waarde } });
    return rij?.inGebruik ?? false;
  }
  async upsertKunstwerk(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void> {
    await this.kunstwerken.save(this.kunstwerken.create({ kunstwerkId, type, locatie, inGebruik: true }));
  }
  async markeerBuitenGebruik(kunstwerkId: string): Promise<void> {
    const bestaand = await this.kunstwerken.findOne({ where: { kunstwerkId } });
    await this.kunstwerken.save(this.kunstwerken.create({ ...bestaand, kunstwerkId, inGebruik: false }));
  }
  async bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void> {
    await this.eisen.save(this.eisen.create({ kunstwerkId, eisen }));
  }
}

@Injectable()
export class TypeOrmContractenReadModel implements ContractenReadModel, ContractStore {
  constructor(@InjectRepository(GeldendContractEntity) private readonly repo: Repository<GeldendContractEntity>) {}

  async geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null> {
    const rij = await this.repo.findOne({
      where: { kunstwerkId: id.waarde, actief: true },
      order: { bijgewerktOp: 'DESC' },
    });
    return rij ? { contractId: rij.contractId, opdrachtnemer: rij.opdrachtnemer } : null;
  }
  async upsertGegund(p: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijdStart: string | null; looptijdEind: string | null }): Promise<void> {
    await this.repo.save(this.repo.create({
      contractId: p.contractId,
      kunstwerkId: p.kunstwerkId,
      opdrachtnemer: p.opdrachtnemer,
      looptijdStart: p.looptijdStart ? new Date(p.looptijdStart) : null,
      looptijdEind: p.looptijdEind ? new Date(p.looptijdEind) : null,
      actief: true,
    }));
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
git commit -m "feat(onderhoud): idempotente consumers voor Monitoring, Contract en Beheer"
```

---

### Task 14: Infrastructure — Anti-Corruption Layer voor externe aannemersfacturen

Externe aannemers sturen facturen in hun eigen formaat. De ACL vertaalt dat naar het interne `OntvangFactuurCommand`; het externe model komt nooit voorbij deze module.

**Files:**
- Create: `onderhoud/src/infrastructure/acl/aannemer-factuur-vertaler.ts`
- Test: `onderhoud/test/infrastructure/aannemer-factuur-vertaler.spec.ts`

**Interfaces:**
- Consumes: `OntvangFactuurCommand` (Task 10).
- Produces: `interface ExterneFactuur { invoiceNumber: string; workOrderRef: string; totalExVatCents: number; vatCents: number; currency: string; issuedAt: string }` en `vertaalExterneFactuur(extern: ExterneFactuur): OntvangFactuurCommand` (gooit `AclFout` bij niet-EUR-valuta of ontbrekende `workOrderRef`); `class AclFout extends Error`.

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

### Task 15: Interface — exception-filter + storing-/diagnose-/onderhoud-controllers

NestJS-controllers voor de instappunten en het traject, met class-validator-DTO's en een exception-filter die `DomeinFout` → 400 (of 404 bij "niet gevonden") en `AclFout` → 422 vertaalt. Bedrijfsregels blijven in `domain`.

**Files:**
- Create: `onderhoud/src/interface/http/domein-fout.filter.ts`
- Create: `onderhoud/src/interface/http/dto/meld-storing.dto.ts`
- Create: `onderhoud/src/interface/http/dto/onderhoud.dto.ts`
- Create: `onderhoud/src/interface/http/storing.controller.ts`
- Create: `onderhoud/src/interface/http/onderhoud.controller.ts`
- Test: `onderhoud/test/interface/onderhoud-controllers.e2e-spec.ts`

**Interfaces:**
- Consumes: use cases (Tasks 9-10), repo-tokens (Task 8).
- Produces: `DomeinFoutFilter` (`@Catch(DomeinFout, AclFout)`).
- Produces: DTO-klassen (class-validator).
- Produces: `StoringController` (`POST /storingen` 201, `GET /storingen`), `OnderhoudController` (`POST /diagnoses`, `GET /onderhoud`, `GET /onderhoud/:id`, `POST /onderhoud/:id/start`, `.../inspecties`, `.../afronden`, `.../facturen`, `.../facturen/:factuurId/goedkeuring`).

- [ ] **Step 1: Write the failing test (Nest e2e met supertest)**

`onderhoud/test/interface/onderhoud-controllers.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { StoringController } from '../../src/interface/http/storing.controller';
import { OnderhoudController } from '../../src/interface/http/onderhoud.controller';
import { DomeinFoutFilter } from '../../src/interface/http/domein-fout.filter';
import { MeldStoring } from '../../src/application/storing/meld-storing';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../../src/application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../../src/application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../../src/application/onderhoud/keur-factuur-goed';
import { ONDERHOUD_REPOSITORY, STORING_REPOSITORY } from '../../src/domain/repositories';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('Onderhoud-controllers (e2e)', () => {
  let app: INestApplication;
  let publisher: FakeEventPublisher;

  beforeEach(async () => {
    const storingen = new InMemoryStoringRepository();
    const onderhouden = new InMemoryOnderhoudRepository();
    publisher = new FakeEventPublisher();
    const ids = new VasteIdGenerator('X');

    const moduleRef = await Test.createTestingModule({
      controllers: [StoringController, OnderhoudController],
      providers: [
        { provide: MeldStoring, useValue: new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(true), ids, 'soepel') },
        { provide: StelDiagnose, useValue: new StelDiagnose(onderhouden, ids) },
        { provide: StartOnderhoud, useValue: new StartOnderhoud(onderhouden, new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), publisher, 'soepel') },
        { provide: RegistreerInspectie, useValue: new RegistreerInspectie(onderhouden, ids) },
        { provide: RondOnderhoudAf, useValue: new RondOnderhoudAf(onderhouden, storingen, publisher) },
        { provide: OntvangFactuur, useValue: new OntvangFactuur(onderhouden, ids) },
        { provide: KeurFactuurGoed, useValue: new KeurFactuurGoed(onderhouden) },
        { provide: STORING_REPOSITORY, useValue: storingen },
        { provide: ONDERHOUD_REPOSITORY, useValue: onderhouden },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomeinFoutFilter());
    await app.init();
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
    const diagnose = await request(app.getHttpServer())
      .post('/api/diagnoses')
      .send({ kunstwerkId: 'KW1', incidentId: 'INC1', bevinding: 'trilling', ernst: 'Kritiek' });
    expect(diagnose.status).toBe(201);
    const onderhoudId = diagnose.body.onderhoudId;

    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/start`).send({ datum: '2026-07-01' })).status).toBe(200);
    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/inspecties`).send({ datum: '2026-07-05', oordeel: 'Goedgekeurd' })).status).toBe(201);
    const factuur = await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/facturen`).send({ bedragEuro: 2500, ontvangenOp: '2026-07-06' });
    expect(factuur.status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/afronden`).send({ resultaat: 'hersteld', datum: '2026-07-10' })).status).toBe(200);
    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/facturen/${factuur.body.factuurId}/goedkeuring`).send()).status).toBe(200);

    const detail = await request(app.getHttpServer()).get(`/api/onderhoud/${onderhoudId}`);
    expect(detail.body.status).toBe('Afgerond');
    expect(publisher.types()).toEqual(expect.arrayContaining(['onderhoud.onderhoud.gestart', 'onderhoud.onderhoud.afgerond']));
  });

  it('geeft 200 zonder traject bij een diagnose onder de drempel', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/diagnoses')
      .send({ kunstwerkId: 'KW1', bevinding: 'lichte afwijking', ernst: 'Laag' });
    expect(antwoord.status).toBe(200);
    expect(antwoord.body.onderhoudId).toBeNull();
  });

  it('geeft 404 bij een onbekend traject', async () => {
    expect((await request(app.getHttpServer()).get('/api/onderhoud/BESTAAT-NIET')).status).toBe(404);
    expect((await request(app.getHttpServer()).post('/api/onderhoud/BESTAAT-NIET/start').send({ datum: '2026-07-01' })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onderhoud-controllers`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer de exception-filter**

`onderhoud/src/interface/http/domein-fout.filter.ts`:
```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import { AclFout } from '../../infrastructure/acl/aannemer-factuur-vertaler';

@Catch(DomeinFout, AclFout)
export class DomeinFoutFilter implements ExceptionFilter {
  catch(fout: DomeinFout | AclFout, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.BAD_REQUEST;
    if (fout instanceof AclFout) status = HttpStatus.UNPROCESSABLE_ENTITY;
    else if (fout.message.includes('niet gevonden')) status = HttpStatus.NOT_FOUND;
    response.status(status).json({ fout: fout.message });
  }
}
```

- [ ] **Step 4: Implementeer de DTO's**

`onderhoud/src/interface/http/dto/meld-storing.dto.ts`:
```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class MeldStoringDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsNotEmpty()
  omschrijving: string;

  @IsString()
  @IsNotEmpty()
  ernst: string;
}
```

`onderhoud/src/interface/http/dto/onderhoud.dto.ts`:
```ts
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class StelDiagnoseDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsOptional()
  incidentId?: string;

  @IsString()
  @IsNotEmpty()
  bevinding: string;

  @IsString()
  @IsNotEmpty()
  ernst: string;
}

export class StartOnderhoudDto {
  @IsString()
  @IsNotEmpty()
  datum: string;
}

export class RegistreerInspectieDto {
  @IsString()
  @IsNotEmpty()
  datum: string;

  @IsIn(['Goedgekeurd', 'Afgekeurd'])
  oordeel: 'Goedgekeurd' | 'Afgekeurd';

  @IsString()
  @IsOptional()
  opmerkingen?: string;
}

export class RondAfDto {
  @IsString()
  @IsNotEmpty()
  resultaat: string;

  @IsString()
  @IsNotEmpty()
  datum: string;
}

export class OntvangFactuurDto {
  @IsNumber()
  bedragEuro: number;

  @IsString()
  @IsNotEmpty()
  ontvangenOp: string;
}
```

- [ ] **Step 5: Implementeer `storing.controller.ts`**

`onderhoud/src/interface/http/storing.controller.ts`:
```ts
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { MeldStoring } from '../../application/storing/meld-storing';
import { STORING_REPOSITORY, type StoringRepository } from '../../domain/repositories';
import { MeldStoringDto } from './dto/meld-storing.dto';

@Controller('storingen')
export class StoringController {
  constructor(
    private readonly meldStoring: MeldStoring,
    @Inject(STORING_REPOSITORY) private readonly storingen: StoringRepository,
  ) {}

  @Post()
  async meld(@Body() dto: MeldStoringDto) {
    return this.meldStoring.uitvoeren(dto);
  }

  @Get()
  async lijst() {
    const storingen = await this.storingen.zoekAlle();
    return storingen.map((s) => ({
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

- [ ] **Step 6: Implementeer `onderhoud.controller.ts`**

`onderhoud/src/interface/http/onderhoud.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StelDiagnose } from '../../application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../../application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../../application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../../application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../../application/onderhoud/keur-factuur-goed';
import { ONDERHOUD_REPOSITORY, type OnderhoudRepository } from '../../domain/repositories';
import { OnderhoudId } from '../../domain/gedeeld/waarden';
import type { Onderhoud } from '../../domain/onderhoud/onderhoud';
import { OntvangFactuurDto, RegistreerInspectieDto, RondAfDto, StartOnderhoudDto, StelDiagnoseDto } from './dto/onderhoud.dto';

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

@Controller()
export class OnderhoudController {
  constructor(
    private readonly stelDiagnose: StelDiagnose,
    private readonly start: StartOnderhoud,
    private readonly inspecteer: RegistreerInspectie,
    private readonly rondAf: RondOnderhoudAf,
    private readonly ontvangFactuur: OntvangFactuur,
    private readonly keurFactuurGoed: KeurFactuurGoed,
    @Inject(ONDERHOUD_REPOSITORY) private readonly onderhouden: OnderhoudRepository,
  ) {}

  @Post('diagnoses')
  async diagnose(@Body() dto: StelDiagnoseDto, @Res({ passthrough: true }) res: Response) {
    const uitkomst = await this.stelDiagnose.uitvoeren(dto);
    res.status(uitkomst.onderhoudId ? 201 : 200);
    return uitkomst;
  }

  @Get('onderhoud')
  async lijst() {
    return (await this.onderhouden.zoekAlle()).map(naarDto);
  }

  @Get('onderhoud/:id')
  async detail(@Param('id') id: string) {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(id));
    if (!traject) throw new NotFoundException({ fout: 'onderhoudstraject niet gevonden' });
    return naarDto(traject);
  }

  @Post('onderhoud/:id/start')
  @HttpCode(200)
  async startTraject(@Param('id') id: string, @Body() dto: StartOnderhoudDto) {
    await this.start.uitvoeren({ onderhoudId: id, datum: dto.datum });
    return { status: 'Gestart' };
  }

  @Post('onderhoud/:id/inspecties')
  async inspectie(@Param('id') id: string, @Body() dto: RegistreerInspectieDto) {
    await this.inspecteer.uitvoeren({ onderhoudId: id, ...dto });
    return { status: 'Geregistreerd' };
  }

  @Post('onderhoud/:id/afronden')
  @HttpCode(200)
  async afronden(@Param('id') id: string, @Body() dto: RondAfDto) {
    await this.rondAf.uitvoeren({ onderhoudId: id, ...dto });
    return { status: 'Afgerond' };
  }

  @Post('onderhoud/:id/facturen')
  async factuur(@Param('id') id: string, @Body() dto: OntvangFactuurDto) {
    return this.ontvangFactuur.uitvoeren({ onderhoudId: id, ...dto });
  }

  @Post('onderhoud/:id/facturen/:factuurId/goedkeuring')
  @HttpCode(200)
  async keurGoed(@Param('id') id: string, @Param('factuurId') factuurId: string) {
    await this.keurFactuurGoed.uitvoeren({ onderhoudId: id, factuurId });
    return { status: 'Goedgekeurd' };
  }
}
```

> `GET /onderhoud/:id` gooit `NotFoundException` (Nest-standaard 404); de overige "niet gevonden"-fouten uit de use cases worden door `DomeinFoutFilter` óók 404. Zo geeft zowel de query als het commando 404 bij een onbekend traject.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- onderhoud-controllers`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add onderhoud/src/interface/http onderhoud/test/interface/onderhoud-controllers.e2e-spec.ts
git commit -m "feat(onderhoud): exception-filter en storing-/onderhoud-controllers"
```

---

### Task 16: Interface — schema-, externe-factuur- en contractaanvraag-controllers

**Files:**
- Create: `onderhoud/src/interface/http/dto/schema.dto.ts`
- Create: `onderhoud/src/interface/http/dto/extern.dto.ts`
- Create: `onderhoud/src/interface/http/schema.controller.ts`
- Create: `onderhoud/src/interface/http/extern.controller.ts`
- Test: `onderhoud/test/interface/schema-extern-controllers.e2e-spec.ts`

**Interfaces:**
- Consumes: `MaakSchema`/`DienContractaanvraagIn` (Task 10), `OntvangFactuur` (Task 10), ACL-vertaler (Task 14), repo-tokens (Task 8).
- Produces: `SchemaController` (`POST /schemas` 201, `GET /schemas`), `ExternController` (`POST /extern/facturen` 201, `AclFout` → 422 via filter; `POST /contractaanvragen` 202).

- [ ] **Step 1: Write the failing test**

`onderhoud/test/interface/schema-extern-controllers.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { SchemaController } from '../../src/interface/http/schema.controller';
import { ExternController } from '../../src/interface/http/extern.controller';
import { DomeinFoutFilter } from '../../src/interface/http/domein-fout.filter';
import { MaakSchema } from '../../src/application/schema/maak-schema';
import { DienContractaanvraagIn } from '../../src/application/contractaanvraag/dien-contractaanvraag-in';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import { SCHEMA_REPOSITORY } from '../../src/domain/repositories';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  InMemoryOnderhoudRepository,
  InMemorySchemaRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('Schema- en extern-controllers (e2e)', () => {
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
      controllers: [SchemaController, ExternController],
      providers: [
        { provide: MaakSchema, useValue: new MaakSchema(schemas, new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), ids, 'soepel') },
        { provide: DienContractaanvraagIn, useValue: new DienContractaanvraagIn(publisher) },
        { provide: OntvangFactuur, useValue: new OntvangFactuur(onderhouden, ids) },
        { provide: SCHEMA_REPOSITORY, useValue: schemas },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomeinFoutFilter());
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

Run: `npm test -- schema-extern-controllers`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer de DTO's**

`onderhoud/src/interface/http/dto/schema.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class GeplandMomentDto {
  @IsString()
  @IsNotEmpty()
  datum: string;

  @IsString()
  @IsNotEmpty()
  omschrijving: string;
}

export class MaakSchemaDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsNotEmpty()
  periodeStart: string;

  @IsString()
  @IsNotEmpty()
  periodeEind: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GeplandMomentDto)
  momenten: GeplandMomentDto[];
}
```

> `@ArrayNotEmpty` geeft al 400 bij een leeg `momenten`-array; de domeininvariant in `OnderhoudsSchema.maak` is de tweede verdedigingslinie.

`onderhoud/src/interface/http/dto/extern.dto.ts`:
```ts
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class ExterneFactuurDto {
  @IsString()
  @IsNotEmpty()
  invoiceNumber: string;

  @IsString()
  @IsNotEmpty()
  workOrderRef: string;

  @IsInt()
  totalExVatCents: number;

  @IsInt()
  vatCents: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  issuedAt: string;
}

export class ContractaanvraagDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsNotEmpty()
  aanleiding: string;
}
```

- [ ] **Step 4: Implementeer `schema.controller.ts`**

`onderhoud/src/interface/http/schema.controller.ts`:
```ts
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { MaakSchema } from '../../application/schema/maak-schema';
import { SCHEMA_REPOSITORY, type SchemaRepository } from '../../domain/repositories';
import { MaakSchemaDto } from './dto/schema.dto';

@Controller('schemas')
export class SchemaController {
  constructor(
    private readonly maakSchema: MaakSchema,
    @Inject(SCHEMA_REPOSITORY) private readonly schemas: SchemaRepository,
  ) {}

  @Post()
  async maak(@Body() dto: MaakSchemaDto) {
    return this.maakSchema.uitvoeren(dto);
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

- [ ] **Step 5: Implementeer `extern.controller.ts`**

`onderhoud/src/interface/http/extern.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { OntvangFactuur } from '../../application/onderhoud/ontvang-factuur';
import { DienContractaanvraagIn } from '../../application/contractaanvraag/dien-contractaanvraag-in';
import { vertaalExterneFactuur } from '../../infrastructure/acl/aannemer-factuur-vertaler';
import { ContractaanvraagDto, ExterneFactuurDto } from './dto/extern.dto';

@Controller()
export class ExternController {
  constructor(
    private readonly ontvangFactuur: OntvangFactuur,
    private readonly dienContractaanvraagIn: DienContractaanvraagIn,
  ) {}

  @Post('extern/facturen')
  async factuur(@Body() dto: ExterneFactuurDto) {
    const command = vertaalExterneFactuur(dto);
    return this.ontvangFactuur.uitvoeren(command);
  }

  @Post('contractaanvragen')
  @HttpCode(202)
  async contractaanvraag(@Body() dto: ContractaanvraagDto) {
    await this.dienContractaanvraagIn.uitvoeren(dto);
    return { status: 'Ingediend' };
  }
}
```

> `vertaalExterneFactuur` gooit `AclFout` → 422 via `DomeinFoutFilter`. `OntvangFactuur` gooit `DomeinFout('... niet gevonden')` → 404 als de `workOrderRef` naar een onbekend traject wijst.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- schema-extern-controllers`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add onderhoud/src/interface/http onderhoud/test/interface/schema-extern-controllers.e2e-spec.ts
git commit -m "feat(onderhoud): schema-, externe-factuur- en contractaanvraag-controllers"
```

---

### Task 17: Modules-bedrading + OpenAPI + consumers opstarten

Bedraad alle lagen in NestJS-modules: infra levert repos/read-models/publisher/id-generator onder de DI-tokens, application levert de use cases via `useFactory` (framework-vrije klassen), interface bundelt de controllers, en een `ConsumersService` start bij `OnModuleInit` de drie queue-consumers. `main.ts` krijgt Swagger + de globale exception-filter.

**Files:**
- Create: `onderhoud/src/infrastructure/id-generator.ts`
- Create: `onderhoud/src/infrastructure/infrastructure.module.ts`
- Create: `onderhoud/src/application/application.module.ts`
- Create: `onderhoud/src/interface/http/http-api.module.ts`
- Create: `onderhoud/src/infrastructure/messaging/consumers.service.ts`
- Create: `onderhoud/src/infrastructure/messaging/consumers.module.ts`
- Modify: `onderhoud/src/app.module.ts`
- Modify: `onderhoud/src/main.ts`

**Interfaces:**
- Consumes: alle voorgaande taken.
- Produces: `class UuidIdGenerator implements IdGenerator`; `InfrastructureModule`, `ApplicationModule`, `HttpApiModule`, `ConsumersModule`, `ConsumersService`.

- [ ] **Step 1: UUID-id-generator**

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

- [ ] **Step 2: `infrastructure.module.ts`**

`onderhoud/src/infrastructure/infrastructure.module.ts`:
```ts
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
```

- [ ] **Step 3: `application.module.ts`**

`onderhoud/src/application/application.module.ts`:
```ts
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
```

- [ ] **Step 4: `http-api.module.ts`**

`onderhoud/src/interface/http/http-api.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApplicationModule } from '../../application/application.module';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { StoringController } from './storing.controller';
import { OnderhoudController } from './onderhoud.controller';
import { SchemaController } from './schema.controller';
import { ExternController } from './extern.controller';
import { DomeinFoutFilter } from './domein-fout.filter';

@Module({
  imports: [ApplicationModule, InfrastructureModule],
  controllers: [StoringController, OnderhoudController, SchemaController, ExternController],
  providers: [{ provide: APP_FILTER, useClass: DomeinFoutFilter }],
})
export class HttpApiModule {}
```

> De controllers hebben de repo-tokens (`STORING_REPOSITORY`, `ONDERHOUD_REPOSITORY`, `SCHEMA_REPOSITORY`) nodig voor hun GET-endpoints; die komen uit `InfrastructureModule`. De use cases komen uit `ApplicationModule`.

- [ ] **Step 5: `consumers.service.ts` + `consumers.module.ts`**

`onderhoud/src/infrastructure/messaging/consumers.service.ts`:
```ts
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
```

`onderhoud/src/infrastructure/messaging/consumers.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application/application.module';
import { InfrastructureModule } from '../infrastructure.module';
import { ConsumersService } from './consumers.service';

@Module({
  imports: [ApplicationModule, InfrastructureModule],
  providers: [ConsumersService],
})
export class ConsumersModule {}
```

- [ ] **Step 6: `app.module.ts` compleet maken**

`onderhoud/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/db/database.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ApplicationModule } from './application/application.module';
import { HttpApiModule } from './interface/http/http-api.module';
import { ConsumersModule } from './infrastructure/messaging/consumers.module';
import { HealthModule } from './interface/health/health.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    MessagingModule,
    InfrastructureModule,
    ApplicationModule,
    HttpApiModule,
    ConsumersModule,
    HealthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: `main.ts` — Swagger + globale filter**

`onderhoud/src/main.ts`:
```ts
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
```

> `DomeinFoutFilter` staat al globaal geregistreerd via `APP_FILTER` in `HttpApiModule`; in `main.ts` is geen `useGlobalFilters` meer nodig. `enableShutdownHooks()` zorgt dat `MessagingModule.onApplicationShutdown` de broker netjes sluit.

- [ ] **Step 8: Volledige build + tests**

Run: `npm run build && npm test`
Expected: build zonder fouten; alle tests groen (config, domein, application, infra-mappers, consumers, ACL, controllers-e2e).

- [ ] **Step 9: Manuele smoke-test**

Run: repo-root `docker compose up -d postgres rabbitmq`; in `onderhoud/` `npm run migration:run` (met lokale `DATABASE_URL`); `npm run start`.
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
Expected: health 200; POST's 200/201; `GET /api/onderhoud` toont het afgeronde traject. Controleer in de RabbitMQ-UI (`http://localhost:15672`) dat er events op `rws.events` staan (bind een tijdelijke queue op `onderhoud.#`) en dat de queues `onderhoud.monitoring-incident`, `onderhoud.contract` en `onderhoud.beheer` bestaan. Open `http://localhost:8003/api/docs` voor de OpenAPI-UI.

- [ ] **Step 10: Commit**

```bash
git add onderhoud/src
git commit -m "feat(onderhoud): modules-bedrading, OpenAPI en consumers — service volledig bedraad"
```

---

### Task 18: Docker + docker-compose + eind-verificatie

**Files:**
- Modify: `onderhoud/Dockerfile`
- Modify: `docker-compose.yml` (repo-root)
- Create: `onderhoud/.dockerignore`

**Interfaces:** geen code-interfaces; leveren een draaiende container.

- [ ] **Step 1: Dockerfile (multi-stage NestJS)**

Vervang de inhoud van `onderhoud/Dockerfile`:
```dockerfile
# Onderhoud-service — NestJS (TypeScript) multi-stage
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

> Migraties draaien automatisch bij het opstarten dankzij `migrationsRun: true` in `DatabaseModule` — de gecompileerde migratie-`.js` staan in `dist/infrastructure/db/migrations/` en de `data-source`-glob pikt ze daar op. Geen aparte migrate-stap in het `CMD` nodig.

- [ ] **Step 2: `.dockerignore`**

`onderhoud/.dockerignore`:
```
node_modules
dist
.env
test
```

- [ ] **Step 3: Compose-blok activeren**

In `docker-compose.yml` (repo-root): verwijder de `#`-comments van het `onderhoud`-blok, zodat het actief wordt. Laat de andere service-blokken ongemoeid. Controleer dat het blok `SERVICE_PORT=8003`, `DATABASE_URL` (host `postgres`), `RABBITMQ_URL` (host `rabbitmq`) en `depends_on: [postgres, rabbitmq]` zet, en poort `8003:8003` mapt.

- [ ] **Step 4: `.env` aanmaken**

Run (in `onderhoud/`): `cp .env.example .env` (laat de hostnamen op `postgres`/`rabbitmq` staan — binnen compose kloppen die).

- [ ] **Step 5: Eind-verificatie via compose**

Run (repo-root): `docker compose up --build onderhoud postgres rabbitmq`
Verifieer in een tweede shell:
```bash
curl -s localhost:8003/health         # status ok, database up, broker up
```
Herhaal daarna de POST-flow uit Task 17 tegen `localhost:8003`. Expected: 200/201-antwoorden, traject zichtbaar via `GET /api/onderhoud`, events op `rws.events`. Publiceer als extra check via de RabbitMQ-UI een testbericht op `rws.events` met routing key `monitoring.incident.aangemaakt` en body:
```json
{ "eventId": "test-1", "eventType": "monitoring.incident.aangemaakt", "occurredAt": "2026-07-01T12:00:00Z", "producer": "monitoring", "version": 1, "data": { "incidentId": "INC1", "kunstwerkId": "KW1", "ernst": "Kritiek", "omschrijving": "trilling boven drempel" } }
```
Expected: `GET /api/onderhoud` toont een nieuw gepland traject met aanleiding `Diagnose`; nogmaals hetzelfde bericht publiceren maakt géén tweede traject (idempotentie).

- [ ] **Step 6: Commit**

```bash
git add onderhoud/Dockerfile onderhoud/.dockerignore docker-compose.yml
git commit -m "feat(onderhoud): Docker-image en compose-integratie"
```

---

## Self-Review (uitgevoerd)

**Stack-conformiteit (`docs/vervolgstappen.md`):** Fastify → **NestJS** (Task 1-3, 15-17), Prisma → **TypeORM** (Task 2, 11, 13). Poort 8003, DB `onderhoud_db`, event-envelope en `/health` identiek aan de conventies. ✔
**Spec-dekking:** alle 4 gepubliceerde events (Tasks 6/7/10/12), beide instappunten MeldStoring + StelDiagnose (9), traject met StartOnderhoud/AfrondenOnderhoud (7/10), OnderhoudsSchema met gegunde aannemer (8/10), Inspectie + Factuur (7/10), contractaanvraag naar Contract (10/16), ACL externe aannemers (14/16), idempotente consumers voor `monitoring.incident.aangemaakt` / `contract.onderhoudscontract.*` / `beheer.onderhoudseisen.vastgesteld` / `beheer.kunstwerk.*` (13/17), REST `GET /api/onderhoud` + `POST /api/storingen` uit de README plus traject-/schema-/extern-routes (15/16), OpenAPI + health + Docker (17/18). ✔
**Laagscheiding:** `domain` (Tasks 4-8) en `application` (9-10) bevatten **geen** NestJS/TypeORM-imports of decorators; alleen `infrastructure` (entities/repos/read-models/publisher/consumers) en `interface` (controllers/DTO's/filter/health) kennen het framework. Use cases worden via `useFactory` bedraad zodat ze framework-vrij blijven. ✔
**Fase-grens:** strenge validatie als default, reageren op `beheer.kunstwerk.buitengebruikgesteld` richting lopende trajecten, AannemerId als eigen aggregate, herplannen van schema-momenten, Testcontainers en Dokploy zitten bewust **niet** in dit plan (Fase 2, zie `docs/vervolgstappen.md`). ✔
**Type-consistentie:** `trekEventsLeeg`, `OnderhoudDomainEvent`, `Bedrag.centen/euro`, `ernstVan`, `vereistOnderhoud`, de DI-tokens (`STORING_REPOSITORY`, `ONDERHOUD_REPOSITORY`, `SCHEMA_REPOSITORY`, `EVENT_PUBLISHER`, `KUNSTWERKEN_READ_MODEL`, `CONTRACTEN_READ_MODEL`, `ID_GENERATOR`, `RABBITMQ_CONNECTIE`, `APP_CONFIG`) worden vóór gebruik gedefinieerd; de controller-provider-namen (Task 15/16) matchen de use-case-klassen uit Tasks 9/10 en de `useFactory`-providers in Task 17. ✔

## Aandachtspunten bij uitvoering

- **Geen `type: module`.** NestJS + TypeORM + `ts-jest` draaien op CommonJS; imports gebruiken géén `.js`-extensie (anders dan de Prisma/ESM-variant van Contract).
- **Decorators + metadata:** `tsconfig` moet `emitDecoratorMetadata` + `experimentalDecorators` aan hebben (Task 1) — anders faalt de NestJS-DI en TypeORM-kolomtypering. Daarom Jest/`ts-jest`, niet Vitest.
- **`strictPropertyInitialization: false`** is nodig voor entity-/controller-velden die door TypeORM/DI worden gevuld; de rest van `strict` blijft aan.
- **Migraties** draaien lokaal met `DATABASE_URL` op host `localhost` (CLI), in de container automatisch via `migrationsRun: true` (host `postgres`). Genereer eerst `InitReadModel` (Task 2) en daarna `DomeinTabellen` (Task 11).
- **`eager: true`** op `Onderhoud.inspecties`/`.facturen` laadt kinderen mee; `cascade: true` persisteert ze bij `save`. In Fase 1 worden ze alleen toegevoegd, dus orphan-removal is niet nodig.
- De drie consumers delen één `TypeOrmEventDedup` (tabel `verwerkt_event`) — dedupe is service-breed op `eventId`.
- `MeldStoring` gebruikt de `IdGenerator` twee keer bij Hoog/Kritiek (storing + traject); de tests rekenen daarop (`X-1`/`X-2`).
- Controllers injecteren zowel use cases (uit `ApplicationModule`) als repo-tokens (uit `InfrastructureModule`); `HttpApiModule` importeert beide.
