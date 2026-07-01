# Monitoring-service Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouw de Monitoring bounded context (Fase 1) als zelfstandig draaiende service: twee aggregates (MonitoringSessie + Incident), AnalyseService met afwijkingsdetectie, MonitoringRapport, alle 4 gepubliceerde events, REST + OpenAPI, een idempotente Beheer-`kunstwerk.*`-consumer, en Docker.

**Architecture:** Vier lagen met de afhankelijkheidsregel naar binnen (`interface → application → domain`, `infrastructure → domain/application`). `domain` is puur TypeScript; Prisma/Fastify/amqplib leven alleen in `infrastructure`/`interface`. Bouwvolgorde: walking skeleton (server/DB/broker/health) → domein met TDD → applicatie-use-cases met in-memory fakes → infrastructure-implementaties → interface + composition root → Docker.

**Tech Stack:** Node.js 22, TypeScript (ESM), Fastify 5, Prisma 6 (+ PostgreSQL `monitoring_db`), amqplib (RabbitMQ topic-exchange `rws.events`), Vitest 2, uuid.

## Global Constraints

- Poort **8002** via `SERVICE_PORT`; DB via `DATABASE_URL` (`postgres://rws:rws@postgres:5432/monitoring_db`); broker via `RABBITMQ_URL` (`amqp://rws:rws@rabbitmq:5672`).
- `GET /health` geeft `200` zodra DB- en broker-connectie er zijn.
- Alle REST onder basispad **`/api`**.
- Events publiceren op durable topic-exchange **`rws.events`**, routing key `monitoring.<aggregate>.<event>`, met de vaste envelope: `{ eventId (uuid), eventType, occurredAt (ISO-8601 UTC), producer:"monitoring", version:1, data }`.
- Consumers zijn **idempotent** (dedupe op `eventId`).
- Verwijs naar een kunstwerk via **`kunstwerkId`** (`KunstwerkReferentie`); kopieer geen beheer-model. Vertaal inkomende events aan de rand (`infrastructure`) naar domeintaal.
- `domain` importeert **niets** uit `infrastructure`/`interface`/frameworks.
- `KUNSTWERK_VALIDATIE` = `soepel` (default, Fase 1) of `streng` (Fase 2).
- Meetwaarden als **`Float`** met een vaste eenheid per `SensorType` (Trilling mm/s, Belasting kN, Temperatuur °C, Slijtage %); geen centen-conversie (geen geld).
- Een incident is een **feit + advies** (`vervolgactie`); Monitoring beslist niet over het onderhoud — dat doet Onderhoud op basis van het event.
- Werk op branch `monitoring-service`. Commit na elke taak.

---

### Task 1: Projectscaffold + config + `/health` (static)

Walking-skeleton-start: een Fastify-server die op 8002 draait met een statisch `/health`.

**Files:**
- Create: `monitoring/package.json`
- Create: `monitoring/tsconfig.json`
- Create: `monitoring/vitest.config.ts`
- Create: `monitoring/.gitignore`
- Create: `monitoring/src/infrastructure/config.ts`
- Create: `monitoring/src/interface/http/health-route.ts`
- Create: `monitoring/src/interface/http/app.ts`
- Create: `monitoring/src/main.ts`
- Test: `monitoring/test/infrastructure/config.test.ts`

**Interfaces:**
- Produces: `laadConfig(env: NodeJS.ProcessEnv): Config` waarbij `Config = { poort: number; databaseUrl: string; rabbitmqUrl: string; kunstwerkValidatie: 'soepel' | 'streng' }`.
- Produces: `bouwApp(deps?: AppDeps): FastifyInstance` (in Task 1 zonder deps; uitgebreid in Task 16).

- [ ] **Step 1: Scaffold `package.json`**

```json
{
  "name": "monitoring-service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@fastify/swagger": "^9.4.0",
    "@fastify/swagger-ui": "^5.2.0",
    "@prisma/client": "^6.1.0",
    "amqplib": "^0.10.5",
    "fastify": "^5.2.0",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.6",
    "@types/node": "^22.10.0",
    "prisma": "^6.1.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: `vitest.config.ts` en `.gitignore`**

`monitoring/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

`monitoring/.gitignore`:
```
node_modules/
dist/
.env
```

- [ ] **Step 4: Write the failing test voor config**

`monitoring/test/infrastructure/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { laadConfig } from '../../src/infrastructure/config.js';

describe('laadConfig', () => {
  const basis = {
    SERVICE_PORT: '8002',
    DATABASE_URL: 'postgres://rws:rws@postgres:5432/monitoring_db',
    RABBITMQ_URL: 'amqp://rws:rws@rabbitmq:5672',
  };

  it('leest de poort als getal en gebruikt soepele validatie als default', () => {
    const config = laadConfig(basis);
    expect(config.poort).toBe(8002);
    expect(config.kunstwerkValidatie).toBe('soepel');
  });

  it('gooit als een verplichte variabele ontbreekt', () => {
    expect(() => laadConfig({ ...basis, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd monitoring && npm install && npm test -- config`
Expected: FAIL — `laadConfig` bestaat nog niet.

- [ ] **Step 6: Implementeer `config.ts`**

`monitoring/src/infrastructure/config.ts`:
```ts
export interface Config {
  poort: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  kunstwerkValidatie: 'soepel' | 'streng';
}

function verplicht(env: NodeJS.ProcessEnv, naam: string): string {
  const waarde = env[naam];
  if (!waarde) throw new Error(`Ontbrekende omgevingsvariabele: ${naam}`);
  return waarde;
}

export function laadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    poort: Number(env.SERVICE_PORT ?? '8002'),
    databaseUrl: verplicht(env, 'DATABASE_URL'),
    rabbitmqUrl: verplicht(env, 'RABBITMQ_URL'),
    kunstwerkValidatie: env.KUNSTWERK_VALIDATIE === 'streng' ? 'streng' : 'soepel',
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS (2 tests).

- [ ] **Step 8: Health-route + app + main (static skeleton)**

`monitoring/src/interface/http/health-route.ts`:
```ts
import type { FastifyInstance } from 'fastify';

export interface HealthChecks {
  db?: () => Promise<boolean>;
  broker?: () => Promise<boolean>;
}

export function registreerHealthRoute(app: FastifyInstance, checks: HealthChecks = {}): void {
  app.get('/health', async (_req, reply) => {
    const db = checks.db ? await checks.db().catch(() => false) : true;
    const broker = checks.broker ? await checks.broker().catch(() => false) : true;
    const gezond = db && broker;
    reply.code(gezond ? 200 : 503).send({ status: gezond ? 'ok' : 'degraded', db, broker });
  });
}
```

`monitoring/src/interface/http/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { registreerHealthRoute, type HealthChecks } from './health-route.js';

export interface AppDeps {
  health?: HealthChecks;
}

export function bouwApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  registreerHealthRoute(app, deps.health);
  return app;
}
```

`monitoring/src/main.ts`:
```ts
import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const app = bouwApp();
  await app.listen({ host: '0.0.0.0', port: config.poort });
}

start().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
```

- [ ] **Step 9: Manuele verificatie**

Run: `SERVICE_PORT=8002 DATABASE_URL=x RABBITMQ_URL=x npx tsx src/main.ts` en in een tweede shell `curl -s localhost:8002/health`.
Expected: `{"status":"ok","db":true,"broker":true}` en HTTP 200. Stop de server.

- [ ] **Step 10: Commit**

```bash
git add monitoring/package.json monitoring/tsconfig.json monitoring/vitest.config.ts monitoring/.gitignore monitoring/src monitoring/test
git commit -m "feat(monitoring): scaffold Fastify-skeleton met config en /health"
```

---

### Task 2: Prisma-bootstrap + DB-health

Verbind met `monitoring_db` en laat `/health` de DB checken. Schema bevat nu alleen de read-model-tabellen; domeintabellen volgen in Task 12.

**Files:**
- Create: `monitoring/prisma/schema.prisma`
- Create: `monitoring/src/infrastructure/db/prisma-client.ts`
- Modify: `monitoring/src/main.ts`
- Create: `monitoring/.env.example` (overschrijf bestaande met extra var)

**Interfaces:**
- Consumes: `laadConfig` (Task 1), `registreerHealthRoute`/`AppDeps` (Task 1).
- Produces: `maakPrismaClient(databaseUrl: string): PrismaClient`.

- [ ] **Step 1: Prisma-schema (read-model + idempotentie)**

`monitoring/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model BekendKunstwerk {
  kunstwerkId String   @id
  type        String?
  locatie     String?
  inGebruik   Boolean  @default(true)
  bijgewerktOp DateTime @updatedAt
}

model VerwerktEvent {
  eventId    String   @id
  verwerktOp DateTime @default(now())
}
```

- [ ] **Step 2: `.env.example` bijwerken**

`monitoring/.env.example`:
```
# Monitoring service — kopieer naar .env
SERVICE_PORT=8002
DATABASE_URL=postgres://rws:rws@postgres:5432/monitoring_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
KUNSTWERK_VALIDATIE=soepel
```

- [ ] **Step 3: Migratie aanmaken**

Start de gedeelde infra vanuit de repo-root: `docker compose up -d postgres`.
Run (in `monitoring/`): `DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db npx prisma migrate dev --name init-readmodel`
Expected: migratie `prisma/migrations/*/migration.sql` aangemaakt; tabellen `BekendKunstwerk` + `VerwerktEvent` bestaan.

- [ ] **Step 4: Prisma-clientfabriek**

`monitoring/src/infrastructure/db/prisma-client.ts`:
```ts
import { PrismaClient } from '@prisma/client';

export function maakPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
```

- [ ] **Step 5: DB-health koppelen in `main.ts`**

Vervang de body van `start()` in `monitoring/src/main.ts`:
```ts
import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';
import { maakPrismaClient } from './infrastructure/db/prisma-client.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const prisma = maakPrismaClient(config.databaseUrl);

  const app = bouwApp({
    health: {
      db: async () => {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      },
    },
  });

  await app.listen({ host: '0.0.0.0', port: config.poort });
}

start().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
```

- [ ] **Step 6: Manuele verificatie**

Run: `cp .env.example .env` (pas `DATABASE_URL`-host aan naar `localhost` voor lokaal draaien), `npx prisma generate`, `npx tsx src/main.ts`, dan `curl -s localhost:8002/health`.
Expected: `{"status":"ok","db":true,...}`; zet postgres stil → `db:false` en HTTP 503.

- [ ] **Step 7: Commit**

```bash
git add monitoring/prisma monitoring/src/infrastructure/db monitoring/src/main.ts monitoring/.env.example
git commit -m "feat(monitoring): Prisma-bootstrap met read-modeltabellen en DB-health"
```

---

### Task 3: RabbitMQ-connectie + broker-health

Bewijs broker-connectiviteit. Nog geen event-mapping (die volgt in Task 13 na de domain-events).

**Files:**
- Create: `monitoring/src/infrastructure/messaging/rabbitmq-connectie.ts`
- Modify: `monitoring/src/main.ts`

**Interfaces:**
- Produces: `class RabbitMqConnectie { static async verbind(url: string): Promise<RabbitMqConnectie>; get kanaal(): Channel; isVerbonden(): boolean; async sluit(): Promise<void> }`.

- [ ] **Step 1: Connectiemodule**

`monitoring/src/infrastructure/messaging/rabbitmq-connectie.ts`:
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
```

- [ ] **Step 2: Broker-health koppelen in `main.ts`**

Voeg toe in `start()` (na de prisma-regel) en breid de health-deps uit:
```ts
import { RabbitMqConnectie } from './infrastructure/messaging/rabbitmq-connectie.js';
// ...
  const rabbit = await RabbitMqConnectie.verbind(config.rabbitmqUrl);

  const app = bouwApp({
    health: {
      db: async () => {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      },
      broker: async () => rabbit.isVerbonden(),
    },
  });
```

- [ ] **Step 3: Manuele verificatie**

Run: repo-root `docker compose up -d rabbitmq postgres`; dan in `monitoring/` `npx tsx src/main.ts`; `curl -s localhost:8002/health`.
Expected: `{"status":"ok","db":true,"broker":true}`. Open `http://localhost:15672` (rws/rws) → exchange `rws.events` bestaat (type topic, durable).

- [ ] **Step 4: Commit**

```bash
git add monitoring/src/infrastructure/messaging monitoring/src/main.ts
git commit -m "feat(monitoring): RabbitMQ-connectie en broker-health"
```

---

### Task 4: Domein — value objects

Pure value objects met invarianten. Volledig TDD; geen framework-imports.

**Files:**
- Create: `monitoring/src/domain/gedeeld/fouten.ts`
- Create: `monitoring/src/domain/gedeeld/waarden.ts`
- Create: `monitoring/src/domain/gedeeld/sensor.ts`
- Create: `monitoring/src/domain/gedeeld/ernst.ts`
- Create: `monitoring/src/domain/gedeeld/vervolgactie.ts`
- Create: `monitoring/src/domain/gedeeld/afwijking.ts`
- Test: `monitoring/test/domain/waarden.test.ts`
- Test: `monitoring/test/domain/sensor.test.ts`

**Interfaces:**
- Produces: `class DomeinFout extends Error`.
- Produces: `KunstwerkReferentie`, `SessieId`, `MetingId`, `IncidentId`, `RapportId` (elk: `static van(waarde: string)`, `readonly waarde: string`, `gelijkAan(a): boolean`).
- Produces: `type SensorType = 'Trilling' | 'Belasting' | 'Temperatuur' | 'Slijtage'`; `isSensorType(waarde: string)`; `standaardEenheid(type: SensorType): string`; `class SensorData { static van(sensorType, waarde): SensorData; readonly sensorType; readonly waarde; readonly eenheid }`.
- Produces: `type Ernst = 'Laag' | 'Middel' | 'Hoog' | 'Kritiek'`; `ernstOrde(ernst): number`.
- Produces: `type Vervolgactie = 'IntensieverMonitoren' | 'Inspectie' | 'Onderhoud'`; `vervolgactieVoor(ernst): Vervolgactie`.
- Produces: `class Afwijking { static van(p): Afwijking; readonly sensorType, gemetenWaarde, drempelwaarde, ernst, tijdstip; get omschrijving(): string }`.

- [ ] **Step 1: Write the failing tests**

`monitoring/test/domain/waarden.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { KunstwerkReferentie, SessieId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

describe('KunstwerkReferentie', () => {
  it('weigert een lege waarde', () => {
    expect(() => KunstwerkReferentie.van('')).toThrow(DomeinFout);
  });
  it('is gelijk bij dezelfde waarde', () => {
    expect(KunstwerkReferentie.van('KW-1').gelijkAan(KunstwerkReferentie.van('KW-1'))).toBe(true);
  });
});

describe('SessieId', () => {
  it('weigert een lege waarde', () => {
    expect(() => SessieId.van('')).toThrow(DomeinFout);
  });
});
```

`monitoring/test/domain/sensor.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SensorData, isSensorType, standaardEenheid } from '../../src/domain/gedeeld/sensor.js';
import { vervolgactieVoor } from '../../src/domain/gedeeld/vervolgactie.js';
import { Afwijking } from '../../src/domain/gedeeld/afwijking.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

describe('SensorType', () => {
  it('herkent geldige en ongeldige sensortypes', () => {
    expect(isSensorType('Trilling')).toBe(true);
    expect(isSensorType('Geluid')).toBe(false);
  });
  it('koppelt de vaste eenheid aan elk type', () => {
    expect(standaardEenheid('Trilling')).toBe('mm/s');
    expect(standaardEenheid('Belasting')).toBe('kN');
    expect(standaardEenheid('Temperatuur')).toBe('°C');
    expect(standaardEenheid('Slijtage')).toBe('%');
  });
});

describe('SensorData', () => {
  it('leidt de eenheid af van het sensortype', () => {
    const data = SensorData.van('Trilling', 3.5);
    expect(data.eenheid).toBe('mm/s');
    expect(data.waarde).toBe(3.5);
  });
  it('weigert een negatieve waarde behalve bij temperatuur', () => {
    expect(() => SensorData.van('Belasting', -1)).toThrow(DomeinFout);
    expect(SensorData.van('Temperatuur', -5).waarde).toBe(-5);
  });
  it('weigert slijtage boven 100%', () => {
    expect(() => SensorData.van('Slijtage', 101)).toThrow(DomeinFout);
  });
});

describe('Vervolgactie', () => {
  it('leidt de vervolgactie af van de ernst', () => {
    expect(vervolgactieVoor('Laag')).toBe('IntensieverMonitoren');
    expect(vervolgactieVoor('Middel')).toBe('Inspectie');
    expect(vervolgactieVoor('Hoog')).toBe('Onderhoud');
    expect(vervolgactieVoor('Kritiek')).toBe('Onderhoud');
  });
});

describe('Afwijking', () => {
  it('weigert een waarde onder de drempel', () => {
    expect(() =>
      Afwijking.van({ sensorType: 'Trilling', gemetenWaarde: 3, drempelwaarde: 5, ernst: 'Laag', tijdstip: new Date() }),
    ).toThrow(DomeinFout);
  });
  it('beschrijft zichzelf met waarde, drempel en eenheid', () => {
    const afwijking = Afwijking.van({ sensorType: 'Trilling', gemetenWaarde: 7.5, drempelwaarde: 5, ernst: 'Middel', tijdstip: new Date() });
    expect(afwijking.omschrijving).toBe('Trilling van 7.5 mm/s overschrijdt drempel 5 mm/s');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- domain`
Expected: FAIL — modules bestaan nog niet.

- [ ] **Step 3: Implementeer `fouten.ts`**

`monitoring/src/domain/gedeeld/fouten.ts`:
```ts
export class DomeinFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = 'DomeinFout';
  }
}
```

- [ ] **Step 4: Implementeer `waarden.ts`**

`monitoring/src/domain/gedeeld/waarden.ts`:
```ts
import { DomeinFout } from './fouten.js';

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

export class KunstwerkReferentie extends Identiteit {
  static van(waarde: string): KunstwerkReferentie {
    return new KunstwerkReferentie(eisNietLeeg(waarde, 'kunstwerkId'));
  }
}
export class SessieId extends Identiteit {
  static van(waarde: string): SessieId {
    return new SessieId(eisNietLeeg(waarde, 'sessieId'));
  }
}
export class MetingId extends Identiteit {
  static van(waarde: string): MetingId {
    return new MetingId(eisNietLeeg(waarde, 'metingId'));
  }
}
export class IncidentId extends Identiteit {
  static van(waarde: string): IncidentId {
    return new IncidentId(eisNietLeeg(waarde, 'incidentId'));
  }
}
export class RapportId extends Identiteit {
  static van(waarde: string): RapportId {
    return new RapportId(eisNietLeeg(waarde, 'rapportId'));
  }
}
```

- [ ] **Step 5: Implementeer `sensor.ts`, `ernst.ts` en `vervolgactie.ts`**

`monitoring/src/domain/gedeeld/sensor.ts`:
```ts
import { DomeinFout } from './fouten.js';

export const SENSOR_TYPES = ['Trilling', 'Belasting', 'Temperatuur', 'Slijtage'] as const;
export type SensorType = (typeof SENSOR_TYPES)[number];

export function isSensorType(waarde: string): waarde is SensorType {
  return (SENSOR_TYPES as readonly string[]).includes(waarde);
}

export function standaardEenheid(type: SensorType): string {
  switch (type) {
    case 'Trilling':
      return 'mm/s';
    case 'Belasting':
      return 'kN';
    case 'Temperatuur':
      return '°C';
    case 'Slijtage':
      return '%';
  }
}

export class SensorData {
  private constructor(
    readonly sensorType: SensorType,
    readonly waarde: number,
    readonly eenheid: string,
  ) {}

  static van(sensorType: SensorType, waarde: number): SensorData {
    if (!Number.isFinite(waarde)) throw new DomeinFout('waarde moet een eindig getal zijn');
    if (waarde < 0 && sensorType !== 'Temperatuur') {
      throw new DomeinFout(`${sensorType} mag niet negatief zijn`);
    }
    if (sensorType === 'Slijtage' && waarde > 100) {
      throw new DomeinFout('slijtage is een percentage (0-100)');
    }
    return new SensorData(sensorType, waarde, standaardEenheid(sensorType));
  }
}
```

`monitoring/src/domain/gedeeld/ernst.ts`:
```ts
export const ERNST_NIVEAUS = ['Laag', 'Middel', 'Hoog', 'Kritiek'] as const;
export type Ernst = (typeof ERNST_NIVEAUS)[number];

const ORDE: Record<Ernst, number> = { Laag: 1, Middel: 2, Hoog: 3, Kritiek: 4 };

export function ernstOrde(ernst: Ernst): number {
  return ORDE[ernst];
}
```

`monitoring/src/domain/gedeeld/vervolgactie.ts`:
```ts
import type { Ernst } from './ernst.js';

export type Vervolgactie = 'IntensieverMonitoren' | 'Inspectie' | 'Onderhoud';

export function vervolgactieVoor(ernst: Ernst): Vervolgactie {
  switch (ernst) {
    case 'Laag':
      return 'IntensieverMonitoren';
    case 'Middel':
      return 'Inspectie';
    case 'Hoog':
    case 'Kritiek':
      return 'Onderhoud';
  }
}
```

- [ ] **Step 6: Implementeer `afwijking.ts`**

`monitoring/src/domain/gedeeld/afwijking.ts`:
```ts
import { DomeinFout } from './fouten.js';
import type { Ernst } from './ernst.js';
import { standaardEenheid, type SensorType } from './sensor.js';

export class Afwijking {
  private constructor(
    readonly sensorType: SensorType,
    readonly gemetenWaarde: number,
    readonly drempelwaarde: number,
    readonly ernst: Ernst,
    readonly tijdstip: Date,
  ) {}

  static van(p: {
    sensorType: SensorType;
    gemetenWaarde: number;
    drempelwaarde: number;
    ernst: Ernst;
    tijdstip: Date;
  }): Afwijking {
    if (p.gemetenWaarde < p.drempelwaarde) {
      throw new DomeinFout('een afwijking vereist een waarde op of boven de drempel');
    }
    return new Afwijking(p.sensorType, p.gemetenWaarde, p.drempelwaarde, p.ernst, p.tijdstip);
  }

  get omschrijving(): string {
    const eenheid = standaardEenheid(this.sensorType);
    return `${this.sensorType} van ${this.gemetenWaarde} ${eenheid} overschrijdt drempel ${this.drempelwaarde} ${eenheid}`;
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- domain`
Expected: PASS (alle assertions).

- [ ] **Step 8: Commit**

```bash
git add monitoring/src/domain/gedeeld monitoring/test/domain
git commit -m "feat(monitoring): domein-value-objects met invarianten"
```

---

### Task 5: Domein — AggregateRoot + event-definities

Basisklasse voor event-registratie en de discriminated union van alle 4 domain events (payloads = `data`-velden uit `docs/events.md`, aangevuld met achterwaarts-compatibele extra velden).

**Files:**
- Create: `monitoring/src/domain/gedeeld/aggregate-root.ts`
- Create: `monitoring/src/domain/gedeeld/domain-events.ts`
- Test: `monitoring/test/domain/aggregate-root.test.ts`

**Interfaces:**
- Produces: `interface DomainEvent { eventType: string; data: Record<string, unknown> }`.
- Produces: `type MonitoringDomainEvent` — union met `eventType`-waarden: `monitoring.meting.geregistreerd`, `monitoring.incident.aangemaakt`, `monitoring.incident.opgelost`, `monitoring.rapport.opgesteld`.
- Produces: `abstract class AggregateRoot { protected registreerEvent(e: MonitoringDomainEvent): void; trekEventsLeeg(): MonitoringDomainEvent[] }`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/domain/aggregate-root.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AggregateRoot } from '../../src/domain/gedeeld/aggregate-root.js';
import type { MonitoringDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

class Test extends AggregateRoot {
  doe(): void {
    this.registreerEvent({
      eventType: 'monitoring.incident.aangemaakt',
      data: { incidentId: 'I1', kunstwerkId: 'KW1', ernst: 'Hoog', omschrijving: 'x', sensorType: 'Trilling', vervolgactie: 'Onderhoud' },
    });
  }
}

describe('AggregateRoot', () => {
  it('verzamelt events en trekt ze daarna leeg', () => {
    const t = new Test();
    t.doe();
    const events: MonitoringDomainEvent[] = t.trekEventsLeeg();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('monitoring.incident.aangemaakt');
    expect(t.trekEventsLeeg()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aggregate-root`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `domain-events.ts`**

`monitoring/src/domain/gedeeld/domain-events.ts`:
```ts
export interface DomainEvent {
  eventType: string;
  data: Record<string, unknown>;
}

export interface MetingGeregistreerd extends DomainEvent {
  eventType: 'monitoring.meting.geregistreerd';
  data: { metingId: string; sessieId: string; kunstwerkId: string; sensorType: string; waarde: number; eenheid: string; tijdstip: string };
}
export interface IncidentAangemaakt extends DomainEvent {
  eventType: 'monitoring.incident.aangemaakt';
  data: { incidentId: string; kunstwerkId: string; ernst: string; omschrijving: string; sensorType: string; vervolgactie: string };
}
export interface IncidentOpgelost extends DomainEvent {
  eventType: 'monitoring.incident.opgelost';
  data: { incidentId: string; kunstwerkId: string; datum: string };
}
export interface RapportOpgesteld extends DomainEvent {
  eventType: 'monitoring.rapport.opgesteld';
  data: { kunstwerkId: string; incidentId: string | null; resultaten: Record<string, unknown> };
}

export type MonitoringDomainEvent =
  | MetingGeregistreerd
  | IncidentAangemaakt
  | IncidentOpgelost
  | RapportOpgesteld;
```

- [ ] **Step 4: Implementeer `aggregate-root.ts`**

`monitoring/src/domain/gedeeld/aggregate-root.ts`:
```ts
import type { MonitoringDomainEvent } from './domain-events.js';

export abstract class AggregateRoot {
  private events: MonitoringDomainEvent[] = [];

  protected registreerEvent(event: MonitoringDomainEvent): void {
    this.events.push(event);
  }

  trekEventsLeeg(): MonitoringDomainEvent[] {
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
git add monitoring/src/domain/gedeeld/aggregate-root.ts monitoring/src/domain/gedeeld/domain-events.ts monitoring/test/domain/aggregate-root.test.ts
git commit -m "feat(monitoring): AggregateRoot en domain-event-definities"
```

---

### Task 6: Domein — MonitoringSessie-aggregate + Meting

De sessie bewaakt de regels; de meting is een apart immutabel record dat de sessie retourneert (het aggregate draagt de meethistorie bewust niet zelf).

**Files:**
- Create: `monitoring/src/domain/sessie/meting.ts`
- Create: `monitoring/src/domain/sessie/monitoring-sessie.ts`
- Test: `monitoring/test/domain/monitoring-sessie.test.ts`

**Interfaces:**
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5).
- Produces: `interface Meting { id: MetingId; sessieId: SessieId; kunstwerkId: KunstwerkReferentie; sensorData: SensorData; tijdstip: Date }`.
- Produces: `class MonitoringSessie extends AggregateRoot` met:
  - `static start(p: { id: SessieId; kunstwerkId: KunstwerkReferentie; gestartOp: Date }): MonitoringSessie`
  - `registreerMeting(p: { id: MetingId; sensorData: SensorData; tijdstip: Date }): Meting`
  - `pauzeer(): void`, `hervat(): void`, `rondAf(op: Date): void`
  - getters: `id`, `kunstwerkId`, `status: 'Actief' | 'Gepauzeerd' | 'Afgerond'`, `gestartOp`, `beeindigdOp`, `aantalMetingen`.
  - `static herstel(p): MonitoringSessie` (voor de repo; zonder events).

- [ ] **Step 1: Write the failing test**

`monitoring/test/domain/monitoring-sessie.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MonitoringSessie } from '../../src/domain/sessie/monitoring-sessie.js';
import { KunstwerkReferentie, MetingId, SessieId } from '../../src/domain/gedeeld/waarden.js';
import { SensorData } from '../../src/domain/gedeeld/sensor.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

function nieuweSessie(): MonitoringSessie {
  return MonitoringSessie.start({
    id: SessieId.van('S1'),
    kunstwerkId: KunstwerkReferentie.van('KW1'),
    gestartOp: new Date('2026-07-01T08:00:00Z'),
  });
}

describe('MonitoringSessie', () => {
  it('start als Actief met nul metingen', () => {
    const sessie = nieuweSessie();
    expect(sessie.status).toBe('Actief');
    expect(sessie.aantalMetingen).toBe(0);
  });

  it('registreert een meting, verhoogt de teller en registreert het event', () => {
    const sessie = nieuweSessie();
    const meting = sessie.registreerMeting({
      id: MetingId.van('M1'),
      sensorData: SensorData.van('Trilling', 3.5),
      tijdstip: new Date('2026-07-01T09:00:00Z'),
    });
    expect(meting.sessieId.waarde).toBe('S1');
    expect(meting.kunstwerkId.waarde).toBe('KW1');
    expect(sessie.aantalMetingen).toBe(1);
    const events = sessie.trekEventsLeeg();
    expect(events[0].eventType).toBe('monitoring.meting.geregistreerd');
    expect(events[0].data).toMatchObject({ metingId: 'M1', sensorType: 'Trilling', waarde: 3.5, eenheid: 'mm/s' });
  });

  it('weigert meten bij een gepauzeerde of afgeronde sessie', () => {
    const sessie = nieuweSessie();
    sessie.pauzeer();
    expect(() =>
      sessie.registreerMeting({ id: MetingId.van('M1'), sensorData: SensorData.van('Trilling', 1), tijdstip: new Date() }),
    ).toThrow(DomeinFout);
  });

  it('pauzeert alleen vanaf Actief en hervat alleen vanaf Gepauzeerd', () => {
    const sessie = nieuweSessie();
    expect(() => sessie.hervat()).toThrow(DomeinFout);
    sessie.pauzeer();
    expect(sessie.status).toBe('Gepauzeerd');
    expect(() => sessie.pauzeer()).toThrow(DomeinFout);
    sessie.hervat();
    expect(sessie.status).toBe('Actief');
  });

  it('rondt af (ook vanaf Gepauzeerd) en blokkeert daarna alles', () => {
    const sessie = nieuweSessie();
    sessie.pauzeer();
    sessie.rondAf(new Date('2026-07-02T08:00:00Z'));
    expect(sessie.status).toBe('Afgerond');
    expect(sessie.beeindigdOp?.toISOString()).toBe('2026-07-02T08:00:00.000Z');
    expect(() => sessie.rondAf(new Date())).toThrow(DomeinFout);
    expect(() => sessie.hervat()).toThrow(DomeinFout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- monitoring-sessie`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `meting.ts`**

`monitoring/src/domain/sessie/meting.ts`:
```ts
import type { SensorData } from '../gedeeld/sensor.js';
import type { KunstwerkReferentie, MetingId, SessieId } from '../gedeeld/waarden.js';

export interface Meting {
  id: MetingId;
  sessieId: SessieId;
  kunstwerkId: KunstwerkReferentie;
  sensorData: SensorData;
  tijdstip: Date;
}
```

- [ ] **Step 4: Implementeer `monitoring-sessie.ts`**

`monitoring/src/domain/sessie/monitoring-sessie.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import type { SensorData } from '../gedeeld/sensor.js';
import type { KunstwerkReferentie, MetingId, SessieId } from '../gedeeld/waarden.js';
import type { Meting } from './meting.js';

export type MonitoringStatus = 'Actief' | 'Gepauzeerd' | 'Afgerond';

interface HerstelData {
  id: SessieId;
  kunstwerkId: KunstwerkReferentie;
  status: MonitoringStatus;
  gestartOp: Date;
  beeindigdOp?: Date;
  aantalMetingen: number;
}

export class MonitoringSessie extends AggregateRoot {
  private constructor(
    private readonly _id: SessieId,
    private readonly _kunstwerkId: KunstwerkReferentie,
    private _status: MonitoringStatus,
    private readonly _gestartOp: Date,
    private _beeindigdOp: Date | undefined,
    private _aantalMetingen: number,
  ) {
    super();
  }

  static start(p: { id: SessieId; kunstwerkId: KunstwerkReferentie; gestartOp: Date }): MonitoringSessie {
    return new MonitoringSessie(p.id, p.kunstwerkId, 'Actief', p.gestartOp, undefined, 0);
  }

  static herstel(d: HerstelData): MonitoringSessie {
    return new MonitoringSessie(d.id, d.kunstwerkId, d.status, d.gestartOp, d.beeindigdOp, d.aantalMetingen);
  }

  get id(): SessieId { return this._id; }
  get kunstwerkId(): KunstwerkReferentie { return this._kunstwerkId; }
  get status(): MonitoringStatus { return this._status; }
  get gestartOp(): Date { return this._gestartOp; }
  get beeindigdOp(): Date | undefined { return this._beeindigdOp; }
  get aantalMetingen(): number { return this._aantalMetingen; }

  registreerMeting(p: { id: MetingId; sensorData: SensorData; tijdstip: Date }): Meting {
    if (this._status !== 'Actief') throw new DomeinFout('meten kan alleen bij een actieve sessie');
    this._aantalMetingen += 1;
    const meting: Meting = {
      id: p.id,
      sessieId: this._id,
      kunstwerkId: this._kunstwerkId,
      sensorData: p.sensorData,
      tijdstip: p.tijdstip,
    };
    this.registreerEvent({
      eventType: 'monitoring.meting.geregistreerd',
      data: {
        metingId: p.id.waarde,
        sessieId: this._id.waarde,
        kunstwerkId: this._kunstwerkId.waarde,
        sensorType: p.sensorData.sensorType,
        waarde: p.sensorData.waarde,
        eenheid: p.sensorData.eenheid,
        tijdstip: p.tijdstip.toISOString(),
      },
    });
    return meting;
  }

  pauzeer(): void {
    if (this._status !== 'Actief') throw new DomeinFout('pauzeren kan alleen bij een actieve sessie');
    this._status = 'Gepauzeerd';
  }

  hervat(): void {
    if (this._status !== 'Gepauzeerd') throw new DomeinFout('hervatten kan alleen bij een gepauzeerde sessie');
    this._status = 'Actief';
  }

  rondAf(op: Date): void {
    if (this._status === 'Afgerond') throw new DomeinFout('sessie is al afgerond');
    this._status = 'Afgerond';
    this._beeindigdOp = op;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- monitoring-sessie`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add monitoring/src/domain/sessie monitoring/test/domain/monitoring-sessie.test.ts
git commit -m "feat(monitoring): MonitoringSessie-aggregate met Meting-record"
```

---

### Task 7: Domein — Incident-aggregate + AnalyseService

**Files:**
- Create: `monitoring/src/domain/incident/incident.ts`
- Create: `monitoring/src/domain/analyse/analyse-service.ts`
- Test: `monitoring/test/domain/incident.test.ts`
- Test: `monitoring/test/domain/analyse-service.test.ts`

**Interfaces:**
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5).
- Produces: `class Incident extends AggregateRoot` met:
  - `static maakAan(p: { id: IncidentId; kunstwerkId: KunstwerkReferentie; afwijking: Afwijking }): Incident`
  - `neemInBehandeling(): void`, `losOp(datum: Date): void`
  - getters: `id`, `kunstwerkId`, `sensorType`, `gemetenWaarde`, `drempelwaarde`, `ernst`, `omschrijving`, `vervolgactie`, `status: 'Nieuw' | 'InBehandeling' | 'Opgelost'`, `aangemaaktOp`, `opgelostOp`.
  - `static herstel(p): Incident`.
- Produces: `type Drempelwaarden = Record<SensorType, number>`; `STANDAARD_DREMPELS`; `class AnalyseService { constructor(drempels?: Drempelwaarden); analyseer(sensorData: SensorData, tijdstip: Date): Afwijking | null }`.

- [ ] **Step 1: Write the failing tests**

`monitoring/test/domain/analyse-service.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AnalyseService } from '../../src/domain/analyse/analyse-service.js';
import { SensorData } from '../../src/domain/gedeeld/sensor.js';

const analyse = new AnalyseService();
const tijdstip = new Date('2026-07-01T09:00:00Z');

describe('AnalyseService', () => {
  it('geeft null onder de drempel', () => {
    expect(analyse.analyseer(SensorData.van('Trilling', 4.9), tijdstip)).toBeNull();
  });

  it('leidt de ernst af van de overschrijdingsfactor (grensgevallen)', () => {
    // drempel Trilling = 5 → factor = waarde / 5
    expect(analyse.analyseer(SensorData.van('Trilling', 5), tijdstip)?.ernst).toBe('Laag');       // f = 1
    expect(analyse.analyseer(SensorData.van('Trilling', 6.25), tijdstip)?.ernst).toBe('Middel');  // f = 1.25
    expect(analyse.analyseer(SensorData.van('Trilling', 7.5), tijdstip)?.ernst).toBe('Hoog');     // f = 1.5
    expect(analyse.analyseer(SensorData.van('Trilling', 10), tijdstip)?.ernst).toBe('Kritiek');   // f = 2
  });

  it('gebruikt de drempel per sensortype', () => {
    expect(analyse.analyseer(SensorData.van('Belasting', 99), tijdstip)).toBeNull();
    expect(analyse.analyseer(SensorData.van('Temperatuur', 41), tijdstip)?.drempelwaarde).toBe(40);
    expect(analyse.analyseer(SensorData.van('Slijtage', 61), tijdstip)?.drempelwaarde).toBe(60);
  });

  it('accepteert aangepaste drempels (voor tests/Fase 2)', () => {
    const strenger = new AnalyseService({ Trilling: 2, Belasting: 100, Temperatuur: 40, Slijtage: 60 });
    expect(strenger.analyseer(SensorData.van('Trilling', 4), tijdstip)?.ernst).toBe('Kritiek'); // f = 2
  });
});
```

`monitoring/test/domain/incident.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Incident } from '../../src/domain/incident/incident.js';
import { Afwijking } from '../../src/domain/gedeeld/afwijking.js';
import { IncidentId, KunstwerkReferentie } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

function nieuwIncident(ernst: 'Laag' | 'Middel' | 'Hoog' | 'Kritiek' = 'Hoog'): Incident {
  return Incident.maakAan({
    id: IncidentId.van('I1'),
    kunstwerkId: KunstwerkReferentie.van('KW1'),
    afwijking: Afwijking.van({
      sensorType: 'Trilling',
      gemetenWaarde: 7.5,
      drempelwaarde: 5,
      ernst,
      tijdstip: new Date('2026-07-01T09:00:00Z'),
    }),
  });
}

describe('Incident', () => {
  it('ontstaat als Nieuw met afgeleide omschrijving en vervolgactie, en registreert het event', () => {
    const incident = nieuwIncident('Hoog');
    expect(incident.status).toBe('Nieuw');
    expect(incident.vervolgactie).toBe('Onderhoud');
    expect(incident.omschrijving).toBe('Trilling van 7.5 mm/s overschrijdt drempel 5 mm/s');
    const events = incident.trekEventsLeeg();
    expect(events[0].eventType).toBe('monitoring.incident.aangemaakt');
    expect(events[0].data).toMatchObject({ incidentId: 'I1', kunstwerkId: 'KW1', ernst: 'Hoog', vervolgactie: 'Onderhoud' });
  });

  it('adviseert IntensieverMonitoren bij Laag en Inspectie bij Middel', () => {
    expect(nieuwIncident('Laag').vervolgactie).toBe('IntensieverMonitoren');
    expect(nieuwIncident('Middel').vervolgactie).toBe('Inspectie');
  });

  it('kan in behandeling genomen worden, maar alleen vanaf Nieuw', () => {
    const incident = nieuwIncident();
    incident.neemInBehandeling();
    expect(incident.status).toBe('InBehandeling');
    expect(() => incident.neemInBehandeling()).toThrow(DomeinFout);
  });

  it('lost op vanaf Nieuw of InBehandeling en registreert het event', () => {
    const incident = nieuwIncident();
    incident.trekEventsLeeg();
    incident.losOp(new Date('2026-07-03T10:00:00Z'));
    expect(incident.status).toBe('Opgelost');
    const events = incident.trekEventsLeeg();
    expect(events[0].eventType).toBe('monitoring.incident.opgelost');
    expect(events[0].data).toMatchObject({ incidentId: 'I1', kunstwerkId: 'KW1', datum: '2026-07-03T10:00:00.000Z' });
  });

  it('is maar één keer oplosbaar', () => {
    const incident = nieuwIncident();
    incident.losOp(new Date());
    expect(() => incident.losOp(new Date())).toThrow(DomeinFout);
    expect(() => incident.neemInBehandeling()).toThrow(DomeinFout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- incident` en `npm test -- analyse-service`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `analyse-service.ts`**

`monitoring/src/domain/analyse/analyse-service.ts`:
```ts
import { Afwijking } from '../gedeeld/afwijking.js';
import type { Ernst } from '../gedeeld/ernst.js';
import type { SensorData, SensorType } from '../gedeeld/sensor.js';

export type Drempelwaarden = Record<SensorType, number>;

export const STANDAARD_DREMPELS: Drempelwaarden = {
  Trilling: 5, // mm/s
  Belasting: 100, // kN
  Temperatuur: 40, // °C
  Slijtage: 60, // %
};

export class AnalyseService {
  constructor(private readonly drempels: Drempelwaarden = STANDAARD_DREMPELS) {}

  analyseer(sensorData: SensorData, tijdstip: Date): Afwijking | null {
    const drempel = this.drempels[sensorData.sensorType];
    const factor = sensorData.waarde / drempel;
    if (factor < 1) return null;
    return Afwijking.van({
      sensorType: sensorData.sensorType,
      gemetenWaarde: sensorData.waarde,
      drempelwaarde: drempel,
      ernst: this.ernstVoor(factor),
      tijdstip,
    });
  }

  private ernstVoor(factor: number): Ernst {
    if (factor >= 2) return 'Kritiek';
    if (factor >= 1.5) return 'Hoog';
    if (factor >= 1.25) return 'Middel';
    return 'Laag';
  }
}
```

- [ ] **Step 4: Implementeer `incident.ts`**

`monitoring/src/domain/incident/incident.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import type { Afwijking } from '../gedeeld/afwijking.js';
import type { Ernst } from '../gedeeld/ernst.js';
import type { SensorType } from '../gedeeld/sensor.js';
import { vervolgactieVoor, type Vervolgactie } from '../gedeeld/vervolgactie.js';
import type { IncidentId, KunstwerkReferentie } from '../gedeeld/waarden.js';

export type IncidentStatus = 'Nieuw' | 'InBehandeling' | 'Opgelost';

interface HerstelData {
  id: IncidentId;
  kunstwerkId: KunstwerkReferentie;
  sensorType: SensorType;
  gemetenWaarde: number;
  drempelwaarde: number;
  ernst: Ernst;
  omschrijving: string;
  vervolgactie: Vervolgactie;
  status: IncidentStatus;
  aangemaaktOp: Date;
  opgelostOp?: Date;
}

export class Incident extends AggregateRoot {
  private constructor(
    private readonly _id: IncidentId,
    private readonly _kunstwerkId: KunstwerkReferentie,
    private readonly _sensorType: SensorType,
    private readonly _gemetenWaarde: number,
    private readonly _drempelwaarde: number,
    private readonly _ernst: Ernst,
    private readonly _omschrijving: string,
    private readonly _vervolgactie: Vervolgactie,
    private _status: IncidentStatus,
    private readonly _aangemaaktOp: Date,
    private _opgelostOp: Date | undefined,
  ) {
    super();
  }

  static maakAan(p: { id: IncidentId; kunstwerkId: KunstwerkReferentie; afwijking: Afwijking }): Incident {
    const incident = new Incident(
      p.id,
      p.kunstwerkId,
      p.afwijking.sensorType,
      p.afwijking.gemetenWaarde,
      p.afwijking.drempelwaarde,
      p.afwijking.ernst,
      p.afwijking.omschrijving,
      vervolgactieVoor(p.afwijking.ernst),
      'Nieuw',
      p.afwijking.tijdstip,
      undefined,
    );
    incident.registreerEvent({
      eventType: 'monitoring.incident.aangemaakt',
      data: {
        incidentId: p.id.waarde,
        kunstwerkId: p.kunstwerkId.waarde,
        ernst: incident._ernst,
        omschrijving: incident._omschrijving,
        sensorType: incident._sensorType,
        vervolgactie: incident._vervolgactie,
      },
    });
    return incident;
  }

  static herstel(d: HerstelData): Incident {
    return new Incident(
      d.id, d.kunstwerkId, d.sensorType, d.gemetenWaarde, d.drempelwaarde,
      d.ernst, d.omschrijving, d.vervolgactie, d.status, d.aangemaaktOp, d.opgelostOp,
    );
  }

  get id(): IncidentId { return this._id; }
  get kunstwerkId(): KunstwerkReferentie { return this._kunstwerkId; }
  get sensorType(): SensorType { return this._sensorType; }
  get gemetenWaarde(): number { return this._gemetenWaarde; }
  get drempelwaarde(): number { return this._drempelwaarde; }
  get ernst(): Ernst { return this._ernst; }
  get omschrijving(): string { return this._omschrijving; }
  get vervolgactie(): Vervolgactie { return this._vervolgactie; }
  get status(): IncidentStatus { return this._status; }
  get aangemaaktOp(): Date { return this._aangemaaktOp; }
  get opgelostOp(): Date | undefined { return this._opgelostOp; }

  neemInBehandeling(): void {
    if (this._status !== 'Nieuw') throw new DomeinFout('alleen een nieuw incident kan in behandeling worden genomen');
    this._status = 'InBehandeling';
  }

  losOp(datum: Date): void {
    if (this._status === 'Opgelost') throw new DomeinFout('incident is al opgelost');
    this._status = 'Opgelost';
    this._opgelostOp = datum;
    this.registreerEvent({
      eventType: 'monitoring.incident.opgelost',
      data: { incidentId: this._id.waarde, kunstwerkId: this._kunstwerkId.waarde, datum: datum.toISOString() },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- incident` en `npm test -- analyse-service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add monitoring/src/domain/incident monitoring/src/domain/analyse monitoring/test/domain/incident.test.ts monitoring/test/domain/analyse-service.test.ts
git commit -m "feat(monitoring): Incident-aggregate en AnalyseService met drempelmodel"
```

---

### Task 8: Domein — MonitoringRapport

Write-once domeinobject met factory: berekent de resultaten over een periode en registreert het event; daarna immutabel.

**Files:**
- Create: `monitoring/src/domain/rapport/monitoring-rapport.ts`
- Test: `monitoring/test/domain/monitoring-rapport.test.ts`

**Interfaces:**
- Consumes: `Meting` (Task 6), `Incident` (Task 7), value objects (Task 4), `AggregateRoot` (Task 5), `ernstOrde` (Task 4).
- Produces: `interface SensorSamenvatting { aantal: number; min: number; max: number; gemiddelde: number }`.
- Produces: `interface RapportResultaten { periode: { start: string; eind: string }; aantalMetingen: number; perSensorType: Record<string, SensorSamenvatting>; incidenten: { totaal: number; open: number; opgelost: number; incidentIds: string[] } }`.
- Produces: `class MonitoringRapport extends AggregateRoot` met:
  - `static stelOp(p: { id: RapportId; kunstwerkId: KunstwerkReferentie; periodeStart: Date; periodeEind: Date; metingen: Meting[]; incidenten: Incident[]; opgesteldOp: Date }): MonitoringRapport`
  - getters: `id`, `kunstwerkId`, `periodeStart`, `periodeEind`, `incidentId: string | null` (zwaarste openstaande incident), `resultaten`, `opgesteldOp`.
  - `static herstel(p): MonitoringRapport`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/domain/monitoring-rapport.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MonitoringRapport } from '../../src/domain/rapport/monitoring-rapport.js';
import { Incident } from '../../src/domain/incident/incident.js';
import { Afwijking } from '../../src/domain/gedeeld/afwijking.js';
import { SensorData } from '../../src/domain/gedeeld/sensor.js';
import { IncidentId, KunstwerkReferentie, MetingId, RapportId, SessieId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';
import type { Meting } from '../../src/domain/sessie/meting.js';

const kunstwerkId = KunstwerkReferentie.van('KW1');

function meting(id: string, waarde: number): Meting {
  return {
    id: MetingId.van(id),
    sessieId: SessieId.van('S1'),
    kunstwerkId,
    sensorData: SensorData.van('Trilling', waarde),
    tijdstip: new Date('2026-07-01T09:00:00Z'),
  };
}

function incident(id: string, ernst: 'Laag' | 'Kritiek', opgelost = false): Incident {
  const i = Incident.maakAan({
    id: IncidentId.van(id),
    kunstwerkId,
    afwijking: Afwijking.van({ sensorType: 'Trilling', gemetenWaarde: 10, drempelwaarde: 5, ernst, tijdstip: new Date('2026-07-01T09:00:00Z') }),
  });
  if (opgelost) i.losOp(new Date('2026-07-02T09:00:00Z'));
  i.trekEventsLeeg();
  return i;
}

describe('MonitoringRapport', () => {
  it('weigert een periode-eind vóór de start', () => {
    expect(() =>
      MonitoringRapport.stelOp({
        id: RapportId.van('R1'), kunstwerkId,
        periodeStart: new Date('2026-07-31'), periodeEind: new Date('2026-07-01'),
        metingen: [], incidenten: [], opgesteldOp: new Date(),
      }),
    ).toThrow(DomeinFout);
  });

  it('vat metingen samen per sensortype en telt incidenten', () => {
    const rapport = MonitoringRapport.stelOp({
      id: RapportId.van('R1'), kunstwerkId,
      periodeStart: new Date('2026-07-01'), periodeEind: new Date('2026-07-31'),
      metingen: [meting('M1', 2), meting('M2', 4), meting('M3', 6)],
      incidenten: [incident('I1', 'Laag'), incident('I2', 'Kritiek'), incident('I3', 'Laag', true)],
      opgesteldOp: new Date('2026-08-01T08:00:00Z'),
    });
    expect(rapport.resultaten.aantalMetingen).toBe(3);
    expect(rapport.resultaten.perSensorType.Trilling).toEqual({ aantal: 3, min: 2, max: 6, gemiddelde: 4 });
    expect(rapport.resultaten.incidenten).toMatchObject({ totaal: 3, open: 2, opgelost: 1 });
    // zwaarste openstaande incident als hoofd-incidentId
    expect(rapport.incidentId).toBe('I2');
  });

  it('heeft incidentId null zonder openstaande incidenten en registreert het event', () => {
    const rapport = MonitoringRapport.stelOp({
      id: RapportId.van('R1'), kunstwerkId,
      periodeStart: new Date('2026-07-01'), periodeEind: new Date('2026-07-31'),
      metingen: [], incidenten: [], opgesteldOp: new Date('2026-08-01T08:00:00Z'),
    });
    expect(rapport.incidentId).toBeNull();
    const events = rapport.trekEventsLeeg();
    expect(events[0].eventType).toBe('monitoring.rapport.opgesteld');
    expect(events[0].data).toMatchObject({ kunstwerkId: 'KW1', incidentId: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- monitoring-rapport`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer `monitoring-rapport.ts`**

`monitoring/src/domain/rapport/monitoring-rapport.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import { ernstOrde } from '../gedeeld/ernst.js';
import type { KunstwerkReferentie, RapportId } from '../gedeeld/waarden.js';
import type { Incident } from '../incident/incident.js';
import type { Meting } from '../sessie/meting.js';

export interface SensorSamenvatting {
  aantal: number;
  min: number;
  max: number;
  gemiddelde: number;
}

export interface RapportResultaten {
  periode: { start: string; eind: string };
  aantalMetingen: number;
  perSensorType: Record<string, SensorSamenvatting>;
  incidenten: { totaal: number; open: number; opgelost: number; incidentIds: string[] };
}

interface HerstelData {
  id: RapportId;
  kunstwerkId: KunstwerkReferentie;
  periodeStart: Date;
  periodeEind: Date;
  incidentId: string | null;
  resultaten: RapportResultaten;
  opgesteldOp: Date;
}

export class MonitoringRapport extends AggregateRoot {
  private constructor(
    private readonly _id: RapportId,
    private readonly _kunstwerkId: KunstwerkReferentie,
    private readonly _periodeStart: Date,
    private readonly _periodeEind: Date,
    private readonly _incidentId: string | null,
    private readonly _resultaten: RapportResultaten,
    private readonly _opgesteldOp: Date,
  ) {
    super();
  }

  static stelOp(p: {
    id: RapportId;
    kunstwerkId: KunstwerkReferentie;
    periodeStart: Date;
    periodeEind: Date;
    metingen: Meting[];
    incidenten: Incident[];
    opgesteldOp: Date;
  }): MonitoringRapport {
    if (p.periodeEind.getTime() <= p.periodeStart.getTime()) {
      throw new DomeinFout('periode-eind moet na periode-start liggen');
    }

    const perSensorType: Record<string, SensorSamenvatting> = {};
    for (const meting of p.metingen) {
      const type = meting.sensorData.sensorType;
      const waarde = meting.sensorData.waarde;
      const huidige = perSensorType[type];
      if (!huidige) {
        perSensorType[type] = { aantal: 1, min: waarde, max: waarde, gemiddelde: waarde };
      } else {
        const aantal = huidige.aantal + 1;
        perSensorType[type] = {
          aantal,
          min: Math.min(huidige.min, waarde),
          max: Math.max(huidige.max, waarde),
          gemiddelde: (huidige.gemiddelde * huidige.aantal + waarde) / aantal,
        };
      }
    }

    const open = p.incidenten.filter((i) => i.status !== 'Opgelost');
    const zwaarsteOpen = [...open].sort((a, b) => ernstOrde(b.ernst) - ernstOrde(a.ernst))[0];

    const resultaten: RapportResultaten = {
      periode: { start: p.periodeStart.toISOString(), eind: p.periodeEind.toISOString() },
      aantalMetingen: p.metingen.length,
      perSensorType,
      incidenten: {
        totaal: p.incidenten.length,
        open: open.length,
        opgelost: p.incidenten.length - open.length,
        incidentIds: p.incidenten.map((i) => i.id.waarde),
      },
    };

    const rapport = new MonitoringRapport(
      p.id, p.kunstwerkId, p.periodeStart, p.periodeEind,
      zwaarsteOpen ? zwaarsteOpen.id.waarde : null, resultaten, p.opgesteldOp,
    );
    rapport.registreerEvent({
      eventType: 'monitoring.rapport.opgesteld',
      data: {
        kunstwerkId: p.kunstwerkId.waarde,
        incidentId: rapport._incidentId,
        resultaten: resultaten as unknown as Record<string, unknown>,
      },
    });
    return rapport;
  }

  static herstel(d: HerstelData): MonitoringRapport {
    return new MonitoringRapport(d.id, d.kunstwerkId, d.periodeStart, d.periodeEind, d.incidentId, d.resultaten, d.opgesteldOp);
  }

  get id(): RapportId { return this._id; }
  get kunstwerkId(): KunstwerkReferentie { return this._kunstwerkId; }
  get periodeStart(): Date { return this._periodeStart; }
  get periodeEind(): Date { return this._periodeEind; }
  get incidentId(): string | null { return this._incidentId; }
  get resultaten(): RapportResultaten { return this._resultaten; }
  get opgesteldOp(): Date { return this._opgesteldOp; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- monitoring-rapport`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add monitoring/src/domain/rapport monitoring/test/domain/monitoring-rapport.test.ts
git commit -m "feat(monitoring): MonitoringRapport met resultaten-berekening"
```

---

### Task 9: Application — ports, fakes & sessie-use-cases

**Files:**
- Create: `monitoring/src/application/ports.ts`
- Create: `monitoring/src/application/sessie/start-monitoring-sessie.ts`
- Create: `monitoring/src/application/sessie/pauzeer-monitoring-sessie.ts`
- Create: `monitoring/src/application/sessie/hervat-monitoring-sessie.ts`
- Create: `monitoring/src/application/sessie/rond-monitoring-sessie-af.ts`
- Create: `monitoring/test/support/fakes.ts`
- Test: `monitoring/test/application/sessie-usecases.test.ts`

**Interfaces:**
- Produces (ports):
  - `interface MonitoringSessieRepository { bewaar(s: MonitoringSessie): Promise<void>; zoek(id: SessieId): Promise<MonitoringSessie | null>; zoekAlle(): Promise<MonitoringSessie[]>; zoekLopendeVoorKunstwerk(kunstwerkId: KunstwerkReferentie): Promise<MonitoringSessie | null> }` (lopend = status ≠ `Afgerond`)
  - `interface MetingRepository { bewaar(m: Meting): Promise<void>; zoekPerKunstwerk(kunstwerkId: KunstwerkReferentie, sensorType?: SensorType): Promise<Meting[]> }`
  - `interface IncidentRepository { bewaar(i: Incident): Promise<void>; zoek(id: IncidentId): Promise<Incident | null>; zoekAlle(filter?: { status?: IncidentStatus; kunstwerkId?: string }): Promise<Incident[]> }`
  - `interface RapportRepository { bewaar(r: MonitoringRapport): Promise<void>; zoek(id: RapportId): Promise<MonitoringRapport | null>; zoekAlle(kunstwerkId?: string): Promise<MonitoringRapport[]> }`
  - `interface EventPublisher { publiceer(events: MonitoringDomainEvent[]): Promise<void> }`
  - `interface KunstwerkenReadModel { isBekendEnInGebruik(id: KunstwerkReferentie): Promise<boolean> }`
  - `interface IdGenerator { nieuw(): string }`
  - `interface Klok { nu(): Date }`
- Produces (use cases): `StartMonitoringSessie`, `PauzeerMonitoringSessie`, `HervatMonitoringSessie`, `RondMonitoringSessieAf` — elk een klasse met `uitvoeren(command)`.
- Produces (test-fakes): `InMemoryMonitoringSessieRepository`, `InMemoryMetingRepository`, `InMemoryIncidentRepository`, `InMemoryRapportRepository`, `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `VasteIdGenerator`, `VasteKlok`.

- [ ] **Step 1: Ports definiëren**

`monitoring/src/application/ports.ts`:
```ts
import type { MonitoringSessie } from '../domain/sessie/monitoring-sessie.js';
import type { Meting } from '../domain/sessie/meting.js';
import type { Incident, IncidentStatus } from '../domain/incident/incident.js';
import type { MonitoringRapport } from '../domain/rapport/monitoring-rapport.js';
import type { IncidentId, KunstwerkReferentie, RapportId, SessieId } from '../domain/gedeeld/waarden.js';
import type { SensorType } from '../domain/gedeeld/sensor.js';
import type { MonitoringDomainEvent } from '../domain/gedeeld/domain-events.js';

export interface MonitoringSessieRepository {
  bewaar(s: MonitoringSessie): Promise<void>;
  zoek(id: SessieId): Promise<MonitoringSessie | null>;
  zoekAlle(): Promise<MonitoringSessie[]>;
  zoekLopendeVoorKunstwerk(kunstwerkId: KunstwerkReferentie): Promise<MonitoringSessie | null>;
}

export interface MetingRepository {
  bewaar(m: Meting): Promise<void>;
  zoekPerKunstwerk(kunstwerkId: KunstwerkReferentie, sensorType?: SensorType): Promise<Meting[]>;
}

export interface IncidentRepository {
  bewaar(i: Incident): Promise<void>;
  zoek(id: IncidentId): Promise<Incident | null>;
  zoekAlle(filter?: { status?: IncidentStatus; kunstwerkId?: string }): Promise<Incident[]>;
}

export interface RapportRepository {
  bewaar(r: MonitoringRapport): Promise<void>;
  zoek(id: RapportId): Promise<MonitoringRapport | null>;
  zoekAlle(kunstwerkId?: string): Promise<MonitoringRapport[]>;
}

export interface EventPublisher {
  publiceer(events: MonitoringDomainEvent[]): Promise<void>;
}

export interface KunstwerkenReadModel {
  isBekendEnInGebruik(id: KunstwerkReferentie): Promise<boolean>;
}

export interface IdGenerator {
  nieuw(): string;
}

export interface Klok {
  nu(): Date;
}
```

- [ ] **Step 2: Test-fakes**

`monitoring/test/support/fakes.ts`:
```ts
import type {
  EventPublisher,
  IdGenerator,
  IncidentRepository,
  Klok,
  KunstwerkenReadModel,
  MetingRepository,
  MonitoringSessieRepository,
  RapportRepository,
} from '../../src/application/ports.js';
import type { MonitoringSessie } from '../../src/domain/sessie/monitoring-sessie.js';
import type { Meting } from '../../src/domain/sessie/meting.js';
import type { Incident, IncidentStatus } from '../../src/domain/incident/incident.js';
import type { MonitoringRapport } from '../../src/domain/rapport/monitoring-rapport.js';
import type { IncidentId, KunstwerkReferentie, RapportId, SessieId } from '../../src/domain/gedeeld/waarden.js';
import type { SensorType } from '../../src/domain/gedeeld/sensor.js';
import type { MonitoringDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

export class InMemoryMonitoringSessieRepository implements MonitoringSessieRepository {
  private opslag = new Map<string, MonitoringSessie>();
  async bewaar(s: MonitoringSessie): Promise<void> { this.opslag.set(s.id.waarde, s); }
  async zoek(id: SessieId): Promise<MonitoringSessie | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<MonitoringSessie[]> { return [...this.opslag.values()]; }
  async zoekLopendeVoorKunstwerk(kunstwerkId: KunstwerkReferentie): Promise<MonitoringSessie | null> {
    return [...this.opslag.values()].find((s) => s.kunstwerkId.gelijkAan(kunstwerkId) && s.status !== 'Afgerond') ?? null;
  }
}

export class InMemoryMetingRepository implements MetingRepository {
  metingen: Meting[] = [];
  async bewaar(m: Meting): Promise<void> { this.metingen.push(m); }
  async zoekPerKunstwerk(kunstwerkId: KunstwerkReferentie, sensorType?: SensorType): Promise<Meting[]> {
    return this.metingen.filter(
      (m) => m.kunstwerkId.gelijkAan(kunstwerkId) && (!sensorType || m.sensorData.sensorType === sensorType),
    );
  }
}

export class InMemoryIncidentRepository implements IncidentRepository {
  private opslag = new Map<string, Incident>();
  async bewaar(i: Incident): Promise<void> { this.opslag.set(i.id.waarde, i); }
  async zoek(id: IncidentId): Promise<Incident | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(filter?: { status?: IncidentStatus; kunstwerkId?: string }): Promise<Incident[]> {
    return [...this.opslag.values()].filter(
      (i) =>
        (!filter?.status || i.status === filter.status) &&
        (!filter?.kunstwerkId || i.kunstwerkId.waarde === filter.kunstwerkId),
    );
  }
}

export class InMemoryRapportRepository implements RapportRepository {
  private opslag = new Map<string, MonitoringRapport>();
  async bewaar(r: MonitoringRapport): Promise<void> { this.opslag.set(r.id.waarde, r); }
  async zoek(id: RapportId): Promise<MonitoringRapport | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(kunstwerkId?: string): Promise<MonitoringRapport[]> {
    return [...this.opslag.values()].filter((r) => !kunstwerkId || r.kunstwerkId.waarde === kunstwerkId);
  }
}

export class FakeEventPublisher implements EventPublisher {
  gepubliceerd: MonitoringDomainEvent[] = [];
  async publiceer(events: MonitoringDomainEvent[]): Promise<void> { this.gepubliceerd.push(...events); }
  types(): string[] { return this.gepubliceerd.map((e) => e.eventType); }
}

export class FakeKunstwerkenReadModel implements KunstwerkenReadModel {
  constructor(private antwoord = true) {}
  async isBekendEnInGebruik(): Promise<boolean> { return this.antwoord; }
}

export class VasteIdGenerator implements IdGenerator {
  private teller = 0;
  constructor(private readonly prefix = 'ID') {}
  nieuw(): string { this.teller += 1; return `${this.prefix}-${this.teller}`; }
}

export class VasteKlok implements Klok {
  constructor(private readonly vast = new Date('2026-07-01T12:00:00Z')) {}
  nu(): Date { return this.vast; }
}
```

- [ ] **Step 3: Write the failing test**

`monitoring/test/application/sessie-usecases.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { StartMonitoringSessie } from '../../src/application/sessie/start-monitoring-sessie.js';
import { PauzeerMonitoringSessie } from '../../src/application/sessie/pauzeer-monitoring-sessie.js';
import { HervatMonitoringSessie } from '../../src/application/sessie/hervat-monitoring-sessie.js';
import { RondMonitoringSessieAf } from '../../src/application/sessie/rond-monitoring-sessie-af.js';
import { SessieId } from '../../src/domain/gedeeld/waarden.js';
import {
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryMonitoringSessieRepository,
  VasteIdGenerator,
  VasteKlok,
} from '../support/fakes.js';

describe('Sessie-use-cases', () => {
  let sessies: InMemoryMonitoringSessieRepository;
  let publisher: FakeEventPublisher;
  let ids: VasteIdGenerator;
  let klok: VasteKlok;

  beforeEach(() => {
    sessies = new InMemoryMonitoringSessieRepository();
    publisher = new FakeEventPublisher();
    ids = new VasteIdGenerator('S');
    klok = new VasteKlok();
  });

  function startUseCase(bekend = true, validatie: 'soepel' | 'streng' = 'soepel'): StartMonitoringSessie {
    return new StartMonitoringSessie(sessies, new FakeKunstwerkenReadModel(bekend), publisher, ids, klok, validatie);
  }

  it('start een sessie voor een kunstwerk', async () => {
    const { sessieId } = await startUseCase().uitvoeren({ kunstwerkId: 'KW1' });
    expect(sessieId).toBe('S-1');
    const sessie = await sessies.zoek(SessieId.van('S-1'));
    expect(sessie?.status).toBe('Actief');
    expect(sessie?.gestartOp.toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('weigert een tweede lopende sessie voor hetzelfde kunstwerk', async () => {
    await startUseCase().uitvoeren({ kunstwerkId: 'KW1' });
    await expect(startUseCase().uitvoeren({ kunstwerkId: 'KW1' })).rejects.toThrow(/al een/);
  });

  it('blokkeert starten bij streng + onbekend kunstwerk; soepel gaat door', async () => {
    await expect(startUseCase(false, 'streng').uitvoeren({ kunstwerkId: 'KW9' })).rejects.toThrow();
    await expect(startUseCase(false, 'soepel').uitvoeren({ kunstwerkId: 'KW9' })).resolves.toMatchObject({ sessieId: 'S-1' });
  });

  it('pauzeert, hervat en rondt af', async () => {
    const { sessieId } = await startUseCase().uitvoeren({ kunstwerkId: 'KW1' });
    await new PauzeerMonitoringSessie(sessies, publisher).uitvoeren({ sessieId });
    expect((await sessies.zoek(SessieId.van(sessieId)))?.status).toBe('Gepauzeerd');
    await new HervatMonitoringSessie(sessies, publisher).uitvoeren({ sessieId });
    expect((await sessies.zoek(SessieId.van(sessieId)))?.status).toBe('Actief');
    await new RondMonitoringSessieAf(sessies, publisher, klok).uitvoeren({ sessieId });
    expect((await sessies.zoek(SessieId.van(sessieId)))?.status).toBe('Afgerond');
  });

  it('gooit bij een onbekende sessie', async () => {
    await expect(new PauzeerMonitoringSessie(sessies, publisher).uitvoeren({ sessieId: 'S-999' })).rejects.toThrow(/niet gevonden/);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- sessie-usecases`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 5: Implementeer `StartMonitoringSessie`**

`monitoring/src/application/sessie/start-monitoring-sessie.ts`:
```ts
import { MonitoringSessie } from '../../domain/sessie/monitoring-sessie.js';
import { KunstwerkReferentie, SessieId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, IdGenerator, Klok, KunstwerkenReadModel, MonitoringSessieRepository } from '../ports.js';

export interface StartMonitoringSessieCommand {
  kunstwerkId: string;
}

export class StartMonitoringSessie {
  constructor(
    private readonly sessies: MonitoringSessieRepository,
    private readonly kunstwerken: KunstwerkenReadModel,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
    private readonly klok: Klok,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: StartMonitoringSessieCommand): Promise<{ sessieId: string }> {
    const kunstwerkId = KunstwerkReferentie.van(command.kunstwerkId);

    const bekend = await this.kunstwerken.isBekendEnInGebruik(kunstwerkId);
    if (!bekend) {
      if (this.validatie === 'streng') throw new DomeinFout('kunstwerk onbekend of buiten gebruik');
      // soepel: doorgaan (Fase 1); een waarschuwing is voldoende
      console.warn(`kunstwerk ${kunstwerkId.waarde} onbekend in read-model — soepele validatie, sessie start toch`);
    }

    const lopend = await this.sessies.zoekLopendeVoorKunstwerk(kunstwerkId);
    if (lopend) throw new DomeinFout('er loopt al een monitoringsessie voor dit kunstwerk');

    const id = SessieId.van(this.ids.nieuw());
    const sessie = MonitoringSessie.start({ id, kunstwerkId, gestartOp: this.klok.nu() });
    await this.sessies.bewaar(sessie);
    await this.publisher.publiceer(sessie.trekEventsLeeg());
    return { sessieId: id.waarde };
  }
}
```

- [ ] **Step 6: Implementeer pauzeer/hervat/rondaf**

`monitoring/src/application/sessie/pauzeer-monitoring-sessie.ts`:
```ts
import { SessieId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, MonitoringSessieRepository } from '../ports.js';

export class PauzeerMonitoringSessie {
  constructor(
    private readonly sessies: MonitoringSessieRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async uitvoeren(command: { sessieId: string }): Promise<void> {
    const sessie = await this.sessies.zoek(SessieId.van(command.sessieId));
    if (!sessie) throw new DomeinFout('sessie niet gevonden');
    sessie.pauzeer();
    await this.sessies.bewaar(sessie);
    await this.publisher.publiceer(sessie.trekEventsLeeg());
  }
}
```

`monitoring/src/application/sessie/hervat-monitoring-sessie.ts`:
```ts
import { SessieId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, MonitoringSessieRepository } from '../ports.js';

export class HervatMonitoringSessie {
  constructor(
    private readonly sessies: MonitoringSessieRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async uitvoeren(command: { sessieId: string }): Promise<void> {
    const sessie = await this.sessies.zoek(SessieId.van(command.sessieId));
    if (!sessie) throw new DomeinFout('sessie niet gevonden');
    sessie.hervat();
    await this.sessies.bewaar(sessie);
    await this.publisher.publiceer(sessie.trekEventsLeeg());
  }
}
```

`monitoring/src/application/sessie/rond-monitoring-sessie-af.ts`:
```ts
import { SessieId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, Klok, MonitoringSessieRepository } from '../ports.js';

export class RondMonitoringSessieAf {
  constructor(
    private readonly sessies: MonitoringSessieRepository,
    private readonly publisher: EventPublisher,
    private readonly klok: Klok,
  ) {}

  async uitvoeren(command: { sessieId: string }): Promise<void> {
    const sessie = await this.sessies.zoek(SessieId.van(command.sessieId));
    if (!sessie) throw new DomeinFout('sessie niet gevonden');
    sessie.rondAf(this.klok.nu());
    await this.sessies.bewaar(sessie);
    await this.publisher.publiceer(sessie.trekEventsLeeg());
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- sessie-usecases`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add monitoring/src/application monitoring/test/support/fakes.ts monitoring/test/application/sessie-usecases.test.ts
git commit -m "feat(monitoring): application-ports, fakes en sessie-use-cases"
```

---

### Task 10: Application — RegistreerMeting + incident-use-cases

Het hart van de service: meting → analyse → eventueel incident, in één use case/transactie (zelfde pragmatiek als Contract's `GunAanbesteding`; de zuivere event-handler-variant is Fase 2).

**Files:**
- Create: `monitoring/src/application/meting/registreer-meting.ts`
- Create: `monitoring/src/application/incident/neem-incident-in-behandeling.ts`
- Create: `monitoring/src/application/incident/los-incident-op.ts`
- Test: `monitoring/test/application/registreer-meting.test.ts`
- Test: `monitoring/test/application/incident-usecases.test.ts`

**Interfaces:**
- Consumes: ports + fakes (Task 9), `MonitoringSessie` (Task 6), `Incident` + `AnalyseService` (Task 7).
- Produces: `RegistreerMeting` met `uitvoeren(command): Promise<{ metingId: string; incidentId?: string }>`; `NeemIncidentInBehandeling`, `LosIncidentOp`.

- [ ] **Step 1: Write the failing tests**

`monitoring/test/application/registreer-meting.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { RegistreerMeting } from '../../src/application/meting/registreer-meting.js';
import { StartMonitoringSessie } from '../../src/application/sessie/start-monitoring-sessie.js';
import { AnalyseService } from '../../src/domain/analyse/analyse-service.js';
import {
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryIncidentRepository,
  InMemoryMetingRepository,
  InMemoryMonitoringSessieRepository,
  VasteIdGenerator,
  VasteKlok,
} from '../support/fakes.js';

describe('RegistreerMeting', () => {
  let sessies: InMemoryMonitoringSessieRepository;
  let metingen: InMemoryMetingRepository;
  let incidenten: InMemoryIncidentRepository;
  let publisher: FakeEventPublisher;
  let useCase: RegistreerMeting;

  beforeEach(async () => {
    sessies = new InMemoryMonitoringSessieRepository();
    metingen = new InMemoryMetingRepository();
    incidenten = new InMemoryIncidentRepository();
    publisher = new FakeEventPublisher();
    useCase = new RegistreerMeting(
      sessies, metingen, incidenten, new AnalyseService(), publisher, new VasteIdGenerator('M'), new VasteKlok(),
    );
    await new StartMonitoringSessie(
      sessies, new FakeKunstwerkenReadModel(true), publisher, new VasteIdGenerator('S'), new VasteKlok(), 'soepel',
    ).uitvoeren({ kunstwerkId: 'KW1' });
  });

  it('registreert een normale meting zonder incident', async () => {
    const resultaat = await useCase.uitvoeren({ kunstwerkId: 'KW1', sensorType: 'Trilling', waarde: 3 });
    expect(resultaat.metingId).toBe('M-1');
    expect(resultaat.incidentId).toBeUndefined();
    expect(metingen.metingen).toHaveLength(1);
    expect(publisher.types()).toContain('monitoring.meting.geregistreerd');
    expect(publisher.types()).not.toContain('monitoring.incident.aangemaakt');
  });

  it('maakt bij een afwijking een incident aan en publiceert beide events', async () => {
    const resultaat = await useCase.uitvoeren({ kunstwerkId: 'KW1', sensorType: 'Trilling', waarde: 12 }); // f = 2.4 → Kritiek
    expect(resultaat.incidentId).toBe('M-2');
    const bewaard = await incidenten.zoekAlle();
    expect(bewaard).toHaveLength(1);
    expect(bewaard[0].ernst).toBe('Kritiek');
    expect(bewaard[0].vervolgactie).toBe('Onderhoud');
    expect(publisher.types()).toEqual(
      expect.arrayContaining(['monitoring.meting.geregistreerd', 'monitoring.incident.aangemaakt']),
    );
  });

  it('gebruikt een meegegeven tijdstip en anders de klok', async () => {
    await useCase.uitvoeren({ kunstwerkId: 'KW1', sensorType: 'Temperatuur', waarde: 20, tijdstip: '2026-07-01T06:00:00Z' });
    expect(metingen.metingen[0].tijdstip.toISOString()).toBe('2026-07-01T06:00:00.000Z');
  });

  it('weigert een onbekend sensorType en een kunstwerk zonder lopende sessie', async () => {
    await expect(useCase.uitvoeren({ kunstwerkId: 'KW1', sensorType: 'Geluid', waarde: 1 })).rejects.toThrow(/sensorType/);
    await expect(useCase.uitvoeren({ kunstwerkId: 'KW-zonder-sessie', sensorType: 'Trilling', waarde: 1 })).rejects.toThrow(/geen lopende/);
  });
});
```

`monitoring/test/application/incident-usecases.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { NeemIncidentInBehandeling } from '../../src/application/incident/neem-incident-in-behandeling.js';
import { LosIncidentOp } from '../../src/application/incident/los-incident-op.js';
import { Incident } from '../../src/domain/incident/incident.js';
import { Afwijking } from '../../src/domain/gedeeld/afwijking.js';
import { IncidentId, KunstwerkReferentie } from '../../src/domain/gedeeld/waarden.js';
import { FakeEventPublisher, InMemoryIncidentRepository, VasteKlok } from '../support/fakes.js';

describe('Incident-use-cases', () => {
  let repo: InMemoryIncidentRepository;
  let publisher: FakeEventPublisher;

  beforeEach(async () => {
    repo = new InMemoryIncidentRepository();
    publisher = new FakeEventPublisher();
    const incident = Incident.maakAan({
      id: IncidentId.van('I1'),
      kunstwerkId: KunstwerkReferentie.van('KW1'),
      afwijking: Afwijking.van({ sensorType: 'Trilling', gemetenWaarde: 10, drempelwaarde: 5, ernst: 'Kritiek', tijdstip: new Date() }),
    });
    incident.trekEventsLeeg();
    await repo.bewaar(incident);
  });

  it('neemt een incident in behandeling', async () => {
    await new NeemIncidentInBehandeling(repo, publisher).uitvoeren({ incidentId: 'I1' });
    expect((await repo.zoek(IncidentId.van('I1')))?.status).toBe('InBehandeling');
  });

  it('lost een incident op en publiceert het event', async () => {
    await new LosIncidentOp(repo, publisher, new VasteKlok()).uitvoeren({ incidentId: 'I1' });
    expect((await repo.zoek(IncidentId.van('I1')))?.status).toBe('Opgelost');
    expect(publisher.types()).toContain('monitoring.incident.opgelost');
  });

  it('gooit bij een onbekend incident', async () => {
    await expect(new LosIncidentOp(repo, publisher, new VasteKlok()).uitvoeren({ incidentId: 'I-999' })).rejects.toThrow(/niet gevonden/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- registreer-meting` en `npm test -- incident-usecases`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 3: Implementeer `RegistreerMeting`**

`monitoring/src/application/meting/registreer-meting.ts`:
```ts
import { Incident } from '../../domain/incident/incident.js';
import type { AnalyseService } from '../../domain/analyse/analyse-service.js';
import { isSensorType, SensorData } from '../../domain/gedeeld/sensor.js';
import { IncidentId, KunstwerkReferentie, MetingId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type {
  EventPublisher,
  IdGenerator,
  IncidentRepository,
  Klok,
  MetingRepository,
  MonitoringSessieRepository,
} from '../ports.js';

export interface RegistreerMetingCommand {
  kunstwerkId: string;
  sensorType: string;
  waarde: number;
  tijdstip?: string;
}

export class RegistreerMeting {
  constructor(
    private readonly sessies: MonitoringSessieRepository,
    private readonly metingen: MetingRepository,
    private readonly incidenten: IncidentRepository,
    private readonly analyse: AnalyseService,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
    private readonly klok: Klok,
  ) {}

  async uitvoeren(command: RegistreerMetingCommand): Promise<{ metingId: string; incidentId?: string }> {
    if (!isSensorType(command.sensorType)) throw new DomeinFout(`onbekend sensorType: ${command.sensorType}`);
    const kunstwerkId = KunstwerkReferentie.van(command.kunstwerkId);

    const sessie = await this.sessies.zoekLopendeVoorKunstwerk(kunstwerkId);
    if (!sessie) throw new DomeinFout('geen lopende monitoringsessie voor dit kunstwerk');

    const tijdstip = command.tijdstip ? new Date(command.tijdstip) : this.klok.nu();
    const sensorData = SensorData.van(command.sensorType, command.waarde);
    const meting = sessie.registreerMeting({ id: MetingId.van(this.ids.nieuw()), sensorData, tijdstip });

    const afwijking = this.analyse.analyseer(sensorData, tijdstip);
    const incident = afwijking
      ? Incident.maakAan({ id: IncidentId.van(this.ids.nieuw()), kunstwerkId, afwijking })
      : undefined;

    await this.sessies.bewaar(sessie);
    await this.metingen.bewaar(meting);
    if (incident) await this.incidenten.bewaar(incident);

    await this.publisher.publiceer([
      ...sessie.trekEventsLeeg(),
      ...(incident ? incident.trekEventsLeeg() : []),
    ]);
    return { metingId: meting.id.waarde, incidentId: incident?.id.waarde };
  }
}
```

- [ ] **Step 4: Implementeer de incident-use-cases**

`monitoring/src/application/incident/neem-incident-in-behandeling.ts`:
```ts
import { IncidentId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, IncidentRepository } from '../ports.js';

export class NeemIncidentInBehandeling {
  constructor(
    private readonly incidenten: IncidentRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async uitvoeren(command: { incidentId: string }): Promise<void> {
    const incident = await this.incidenten.zoek(IncidentId.van(command.incidentId));
    if (!incident) throw new DomeinFout('incident niet gevonden');
    incident.neemInBehandeling();
    await this.incidenten.bewaar(incident);
    await this.publisher.publiceer(incident.trekEventsLeeg());
  }
}
```

`monitoring/src/application/incident/los-incident-op.ts`:
```ts
import { IncidentId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, IncidentRepository, Klok } from '../ports.js';

export class LosIncidentOp {
  constructor(
    private readonly incidenten: IncidentRepository,
    private readonly publisher: EventPublisher,
    private readonly klok: Klok,
  ) {}

  async uitvoeren(command: { incidentId: string }): Promise<void> {
    const incident = await this.incidenten.zoek(IncidentId.van(command.incidentId));
    if (!incident) throw new DomeinFout('incident niet gevonden');
    incident.losOp(this.klok.nu());
    await this.incidenten.bewaar(incident);
    await this.publisher.publiceer(incident.trekEventsLeeg());
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- registreer-meting` en `npm test -- incident-usecases`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add monitoring/src/application/meting monitoring/src/application/incident monitoring/test/application/registreer-meting.test.ts monitoring/test/application/incident-usecases.test.ts
git commit -m "feat(monitoring): RegistreerMeting met afwijkingsdetectie en incident-use-cases"
```

---

### Task 11: Application — StelRapportOp + queries

**Files:**
- Create: `monitoring/src/application/rapport/stel-rapport-op.ts`
- Create: `monitoring/src/application/queries.ts`
- Test: `monitoring/test/application/rapport-usecase.test.ts`

**Interfaces:**
- Consumes: ports + fakes (Task 9), `MonitoringRapport` (Task 8).
- Produces: `StelRapportOp` met `uitvoeren(command): Promise<{ rapportId: string }>`.
- Produces: query-functies `zoekSessies(repo)`, `haalSessie(repo, id)`, `zoekMetingen(repo, kunstwerkId, sensorType?)`, `zoekIncidenten(repo, filter?)`, `haalIncident(repo, id)`, `zoekRapporten(repo, kunstwerkId?)`, `haalRapport(repo, id)` — retourneren leesmodellen (plain objects), geen aggregates.

- [ ] **Step 1: Write the failing test**

`monitoring/test/application/rapport-usecase.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { StelRapportOp } from '../../src/application/rapport/stel-rapport-op.js';
import { zoekMetingen } from '../../src/application/queries.js';
import { Incident } from '../../src/domain/incident/incident.js';
import { Afwijking } from '../../src/domain/gedeeld/afwijking.js';
import { SensorData } from '../../src/domain/gedeeld/sensor.js';
import { IncidentId, KunstwerkReferentie, MetingId, RapportId, SessieId } from '../../src/domain/gedeeld/waarden.js';
import {
  FakeEventPublisher,
  InMemoryIncidentRepository,
  InMemoryMetingRepository,
  InMemoryRapportRepository,
  VasteIdGenerator,
  VasteKlok,
} from '../support/fakes.js';

const kunstwerkId = KunstwerkReferentie.van('KW1');

describe('StelRapportOp', () => {
  let metingen: InMemoryMetingRepository;
  let incidenten: InMemoryIncidentRepository;
  let rapporten: InMemoryRapportRepository;
  let publisher: FakeEventPublisher;
  let useCase: StelRapportOp;

  beforeEach(async () => {
    metingen = new InMemoryMetingRepository();
    incidenten = new InMemoryIncidentRepository();
    rapporten = new InMemoryRapportRepository();
    publisher = new FakeEventPublisher();
    useCase = new StelRapportOp(metingen, incidenten, rapporten, publisher, new VasteIdGenerator('R'), new VasteKlok());

    await metingen.bewaar({
      id: MetingId.van('M1'), sessieId: SessieId.van('S1'), kunstwerkId,
      sensorData: SensorData.van('Trilling', 3), tijdstip: new Date('2026-07-10T09:00:00Z'),
    });
    await metingen.bewaar({
      id: MetingId.van('M2'), sessieId: SessieId.van('S1'), kunstwerkId,
      sensorData: SensorData.van('Trilling', 5), tijdstip: new Date('2026-08-10T09:00:00Z'), // buiten periode
    });
    const incident = Incident.maakAan({
      id: IncidentId.van('I1'), kunstwerkId,
      afwijking: Afwijking.van({ sensorType: 'Trilling', gemetenWaarde: 10, drempelwaarde: 5, ernst: 'Hoog', tijdstip: new Date('2026-07-15T09:00:00Z') }),
    });
    incident.trekEventsLeeg();
    await incidenten.bewaar(incident);
  });

  it('stelt een rapport op over de periode, bewaart en publiceert het event', async () => {
    const { rapportId } = await useCase.uitvoeren({ kunstwerkId: 'KW1', periodeStart: '2026-07-01', periodeEind: '2026-07-31' });
    expect(rapportId).toBe('R-1');
    const rapport = await rapporten.zoek(RapportId.van('R-1'));
    expect(rapport?.resultaten.aantalMetingen).toBe(1); // M2 valt buiten de periode
    expect(rapport?.incidentId).toBe('I1');
    expect(publisher.types()).toContain('monitoring.rapport.opgesteld');
  });

  it('zoekMetingen filtert op kunstwerk en sensortype', async () => {
    const lijst = await zoekMetingen(metingen, 'KW1', 'Trilling');
    expect(lijst).toHaveLength(2);
    expect(lijst[0]).toMatchObject({ metingId: 'M1', sensorType: 'Trilling', eenheid: 'mm/s' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rapport-usecase`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `StelRapportOp`**

`monitoring/src/application/rapport/stel-rapport-op.ts`:
```ts
import { MonitoringRapport } from '../../domain/rapport/monitoring-rapport.js';
import { KunstwerkReferentie, RapportId } from '../../domain/gedeeld/waarden.js';
import type { EventPublisher, IdGenerator, IncidentRepository, Klok, MetingRepository, RapportRepository } from '../ports.js';

export interface StelRapportOpCommand {
  kunstwerkId: string;
  periodeStart: string;
  periodeEind: string;
}

export class StelRapportOp {
  constructor(
    private readonly metingen: MetingRepository,
    private readonly incidenten: IncidentRepository,
    private readonly rapporten: RapportRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
    private readonly klok: Klok,
  ) {}

  async uitvoeren(command: StelRapportOpCommand): Promise<{ rapportId: string }> {
    const kunstwerkId = KunstwerkReferentie.van(command.kunstwerkId);
    const start = new Date(command.periodeStart);
    const eind = new Date(command.periodeEind);

    const metingenInPeriode = (await this.metingen.zoekPerKunstwerk(kunstwerkId)).filter(
      (m) => m.tijdstip.getTime() >= start.getTime() && m.tijdstip.getTime() <= eind.getTime(),
    );
    const incidentenInPeriode = (await this.incidenten.zoekAlle({ kunstwerkId: kunstwerkId.waarde })).filter(
      (i) => i.aangemaaktOp.getTime() >= start.getTime() && i.aangemaaktOp.getTime() <= eind.getTime(),
    );

    const rapport = MonitoringRapport.stelOp({
      id: RapportId.van(this.ids.nieuw()),
      kunstwerkId,
      periodeStart: start,
      periodeEind: eind,
      metingen: metingenInPeriode,
      incidenten: incidentenInPeriode,
      opgesteldOp: this.klok.nu(),
    });

    await this.rapporten.bewaar(rapport);
    await this.publisher.publiceer(rapport.trekEventsLeeg());
    return { rapportId: rapport.id.waarde };
  }
}
```

- [ ] **Step 4: Implementeer `queries.ts`**

`monitoring/src/application/queries.ts`:
```ts
import type { IncidentRepository, MetingRepository, MonitoringSessieRepository, RapportRepository } from './ports.js';
import type { MonitoringSessie } from '../domain/sessie/monitoring-sessie.js';
import type { Meting } from '../domain/sessie/meting.js';
import type { Incident, IncidentStatus } from '../domain/incident/incident.js';
import type { MonitoringRapport, RapportResultaten } from '../domain/rapport/monitoring-rapport.js';
import { IncidentId, KunstwerkReferentie, RapportId, SessieId } from '../domain/gedeeld/waarden.js';
import type { SensorType } from '../domain/gedeeld/sensor.js';

export interface SessieWeergave {
  sessieId: string;
  kunstwerkId: string;
  status: string;
  gestartOp: string;
  beeindigdOp: string | null;
  aantalMetingen: number;
}
export interface MetingWeergave {
  metingId: string;
  sessieId: string;
  kunstwerkId: string;
  sensorType: string;
  waarde: number;
  eenheid: string;
  tijdstip: string;
}
export interface IncidentWeergave {
  incidentId: string;
  kunstwerkId: string;
  sensorType: string;
  ernst: string;
  omschrijving: string;
  vervolgactie: string;
  status: string;
  aangemaaktOp: string;
  opgelostOp: string | null;
}
export interface RapportWeergave {
  rapportId: string;
  kunstwerkId: string;
  incidentId: string | null;
  resultaten: RapportResultaten;
  opgesteldOp: string;
}

function naarSessieWeergave(s: MonitoringSessie): SessieWeergave {
  return {
    sessieId: s.id.waarde,
    kunstwerkId: s.kunstwerkId.waarde,
    status: s.status,
    gestartOp: s.gestartOp.toISOString(),
    beeindigdOp: s.beeindigdOp?.toISOString() ?? null,
    aantalMetingen: s.aantalMetingen,
  };
}
function naarMetingWeergave(m: Meting): MetingWeergave {
  return {
    metingId: m.id.waarde,
    sessieId: m.sessieId.waarde,
    kunstwerkId: m.kunstwerkId.waarde,
    sensorType: m.sensorData.sensorType,
    waarde: m.sensorData.waarde,
    eenheid: m.sensorData.eenheid,
    tijdstip: m.tijdstip.toISOString(),
  };
}
function naarIncidentWeergave(i: Incident): IncidentWeergave {
  return {
    incidentId: i.id.waarde,
    kunstwerkId: i.kunstwerkId.waarde,
    sensorType: i.sensorType,
    ernst: i.ernst,
    omschrijving: i.omschrijving,
    vervolgactie: i.vervolgactie,
    status: i.status,
    aangemaaktOp: i.aangemaaktOp.toISOString(),
    opgelostOp: i.opgelostOp?.toISOString() ?? null,
  };
}
function naarRapportWeergave(r: MonitoringRapport): RapportWeergave {
  return {
    rapportId: r.id.waarde,
    kunstwerkId: r.kunstwerkId.waarde,
    incidentId: r.incidentId,
    resultaten: r.resultaten,
    opgesteldOp: r.opgesteldOp.toISOString(),
  };
}

export async function zoekSessies(repo: MonitoringSessieRepository): Promise<SessieWeergave[]> {
  return (await repo.zoekAlle()).map(naarSessieWeergave);
}
export async function haalSessie(repo: MonitoringSessieRepository, id: string): Promise<SessieWeergave | null> {
  const s = await repo.zoek(SessieId.van(id));
  return s ? naarSessieWeergave(s) : null;
}
export async function zoekMetingen(repo: MetingRepository, kunstwerkId: string, sensorType?: SensorType): Promise<MetingWeergave[]> {
  return (await repo.zoekPerKunstwerk(KunstwerkReferentie.van(kunstwerkId), sensorType)).map(naarMetingWeergave);
}
export async function zoekIncidenten(repo: IncidentRepository, filter?: { status?: IncidentStatus; kunstwerkId?: string }): Promise<IncidentWeergave[]> {
  return (await repo.zoekAlle(filter)).map(naarIncidentWeergave);
}
export async function haalIncident(repo: IncidentRepository, id: string): Promise<IncidentWeergave | null> {
  const i = await repo.zoek(IncidentId.van(id));
  return i ? naarIncidentWeergave(i) : null;
}
export async function zoekRapporten(repo: RapportRepository, kunstwerkId?: string): Promise<RapportWeergave[]> {
  return (await repo.zoekAlle(kunstwerkId)).map(naarRapportWeergave);
}
export async function haalRapport(repo: RapportRepository, id: string): Promise<RapportWeergave | null> {
  const r = await repo.zoek(RapportId.van(id));
  return r ? naarRapportWeergave(r) : null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — alle domain- + application-tests groen.

- [ ] **Step 6: Commit**

```bash
git add monitoring/src/application/rapport monitoring/src/application/queries.ts monitoring/test/application/rapport-usecase.test.ts
git commit -m "feat(monitoring): StelRapportOp-use-case en queries"
```

---

### Task 12: Infrastructure — Prisma-domeintabellen + repo-implementaties

**Files:**
- Modify: `monitoring/prisma/schema.prisma`
- Create: `monitoring/src/infrastructure/db/prisma-monitoring-sessie-repository.ts`
- Create: `monitoring/src/infrastructure/db/prisma-meting-repository.ts`
- Create: `monitoring/src/infrastructure/db/prisma-incident-repository.ts`
- Create: `monitoring/src/infrastructure/db/prisma-rapport-repository.ts`

**Interfaces:**
- Consumes: repo-ports (Task 9), domeinobjecten (Task 6/7/8) — alle `herstel`-factories en getters bestaan al.
- Produces: `PrismaMonitoringSessieRepository`, `PrismaMetingRepository`, `PrismaIncidentRepository`, `PrismaRapportRepository` — constructor neemt `PrismaClient`.

- [ ] **Step 1: Schema uitbreiden**

Voeg toe aan `monitoring/prisma/schema.prisma`:
```prisma
model MonitoringSessie {
  sessieId       String    @id
  kunstwerkId    String
  status         String
  gestartOp      DateTime
  beeindigdOp    DateTime?
  aantalMetingen Int       @default(0)

  @@index([kunstwerkId, status])
}

model Meting {
  metingId    String   @id
  sessieId    String
  kunstwerkId String
  sensorType  String
  waarde      Float
  eenheid     String
  tijdstip    DateTime

  @@index([kunstwerkId, tijdstip])
}

model Incident {
  incidentId    String    @id
  kunstwerkId   String
  sensorType    String
  gemetenWaarde Float
  drempelwaarde Float
  ernst         String
  omschrijving  String
  vervolgactie  String
  status        String
  aangemaaktOp  DateTime
  opgelostOp    DateTime?

  @@index([kunstwerkId, status])
}

model MonitoringRapport {
  rapportId    String   @id
  kunstwerkId  String
  incidentId   String?
  periodeStart DateTime
  periodeEind  DateTime
  resultaten   Json
  opgesteldOp  DateTime
}
```

- [ ] **Step 2: Migratie**

Run (in `monitoring/`): `DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db npx prisma migrate dev --name domeintabellen`
Expected: nieuwe migratie; tabellen bestaan; `npx prisma generate` bijgewerkt.

- [ ] **Step 3: `PrismaMonitoringSessieRepository`**

`monitoring/src/infrastructure/db/prisma-monitoring-sessie-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { MonitoringSessieRepository } from '../../application/ports.js';
import { MonitoringSessie, type MonitoringStatus } from '../../domain/sessie/monitoring-sessie.js';
import { KunstwerkReferentie, SessieId } from '../../domain/gedeeld/waarden.js';

type Rij = {
  sessieId: string;
  kunstwerkId: string;
  status: string;
  gestartOp: Date;
  beeindigdOp: Date | null;
  aantalMetingen: number;
};

function naarDomein(rij: Rij): MonitoringSessie {
  return MonitoringSessie.herstel({
    id: SessieId.van(rij.sessieId),
    kunstwerkId: KunstwerkReferentie.van(rij.kunstwerkId),
    status: rij.status as MonitoringStatus,
    gestartOp: rij.gestartOp,
    beeindigdOp: rij.beeindigdOp ?? undefined,
    aantalMetingen: rij.aantalMetingen,
  });
}

export class PrismaMonitoringSessieRepository implements MonitoringSessieRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(s: MonitoringSessie): Promise<void> {
    const data = {
      kunstwerkId: s.kunstwerkId.waarde,
      status: s.status,
      gestartOp: s.gestartOp,
      beeindigdOp: s.beeindigdOp ?? null,
      aantalMetingen: s.aantalMetingen,
    };
    await this.prisma.monitoringSessie.upsert({
      where: { sessieId: s.id.waarde },
      create: { sessieId: s.id.waarde, ...data },
      update: data,
    });
  }

  async zoek(id: SessieId): Promise<MonitoringSessie | null> {
    const rij = await this.prisma.monitoringSessie.findUnique({ where: { sessieId: id.waarde } });
    return rij ? naarDomein(rij) : null;
  }

  async zoekAlle(): Promise<MonitoringSessie[]> {
    return (await this.prisma.monitoringSessie.findMany()).map(naarDomein);
  }

  async zoekLopendeVoorKunstwerk(kunstwerkId: KunstwerkReferentie): Promise<MonitoringSessie | null> {
    const rij = await this.prisma.monitoringSessie.findFirst({
      where: { kunstwerkId: kunstwerkId.waarde, status: { in: ['Actief', 'Gepauzeerd'] } },
    });
    return rij ? naarDomein(rij) : null;
  }
}
```

- [ ] **Step 4: `PrismaMetingRepository`**

`monitoring/src/infrastructure/db/prisma-meting-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { MetingRepository } from '../../application/ports.js';
import type { Meting } from '../../domain/sessie/meting.js';
import { SensorData, type SensorType } from '../../domain/gedeeld/sensor.js';
import { KunstwerkReferentie, MetingId, SessieId } from '../../domain/gedeeld/waarden.js';

export class PrismaMetingRepository implements MetingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(m: Meting): Promise<void> {
    await this.prisma.meting.create({
      data: {
        metingId: m.id.waarde,
        sessieId: m.sessieId.waarde,
        kunstwerkId: m.kunstwerkId.waarde,
        sensorType: m.sensorData.sensorType,
        waarde: m.sensorData.waarde,
        eenheid: m.sensorData.eenheid,
        tijdstip: m.tijdstip,
      },
    });
  }

  async zoekPerKunstwerk(kunstwerkId: KunstwerkReferentie, sensorType?: SensorType): Promise<Meting[]> {
    const rijen = await this.prisma.meting.findMany({
      where: { kunstwerkId: kunstwerkId.waarde, ...(sensorType ? { sensorType } : {}) },
      orderBy: { tijdstip: 'asc' },
    });
    return rijen.map((rij) => ({
      id: MetingId.van(rij.metingId),
      sessieId: SessieId.van(rij.sessieId),
      kunstwerkId: KunstwerkReferentie.van(rij.kunstwerkId),
      sensorData: SensorData.van(rij.sensorType as SensorType, rij.waarde),
      tijdstip: rij.tijdstip,
    }));
  }
}
```

- [ ] **Step 5: `PrismaIncidentRepository`**

`monitoring/src/infrastructure/db/prisma-incident-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { IncidentRepository } from '../../application/ports.js';
import { Incident, type IncidentStatus } from '../../domain/incident/incident.js';
import type { Ernst } from '../../domain/gedeeld/ernst.js';
import type { SensorType } from '../../domain/gedeeld/sensor.js';
import type { Vervolgactie } from '../../domain/gedeeld/vervolgactie.js';
import { IncidentId, KunstwerkReferentie } from '../../domain/gedeeld/waarden.js';

type Rij = {
  incidentId: string;
  kunstwerkId: string;
  sensorType: string;
  gemetenWaarde: number;
  drempelwaarde: number;
  ernst: string;
  omschrijving: string;
  vervolgactie: string;
  status: string;
  aangemaaktOp: Date;
  opgelostOp: Date | null;
};

function naarDomein(rij: Rij): Incident {
  return Incident.herstel({
    id: IncidentId.van(rij.incidentId),
    kunstwerkId: KunstwerkReferentie.van(rij.kunstwerkId),
    sensorType: rij.sensorType as SensorType,
    gemetenWaarde: rij.gemetenWaarde,
    drempelwaarde: rij.drempelwaarde,
    ernst: rij.ernst as Ernst,
    omschrijving: rij.omschrijving,
    vervolgactie: rij.vervolgactie as Vervolgactie,
    status: rij.status as IncidentStatus,
    aangemaaktOp: rij.aangemaaktOp,
    opgelostOp: rij.opgelostOp ?? undefined,
  });
}

export class PrismaIncidentRepository implements IncidentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(i: Incident): Promise<void> {
    const data = {
      kunstwerkId: i.kunstwerkId.waarde,
      sensorType: i.sensorType,
      gemetenWaarde: i.gemetenWaarde,
      drempelwaarde: i.drempelwaarde,
      ernst: i.ernst,
      omschrijving: i.omschrijving,
      vervolgactie: i.vervolgactie,
      status: i.status,
      aangemaaktOp: i.aangemaaktOp,
      opgelostOp: i.opgelostOp ?? null,
    };
    await this.prisma.incident.upsert({
      where: { incidentId: i.id.waarde },
      create: { incidentId: i.id.waarde, ...data },
      update: { status: i.status, opgelostOp: i.opgelostOp ?? null },
    });
  }

  async zoek(id: IncidentId): Promise<Incident | null> {
    const rij = await this.prisma.incident.findUnique({ where: { incidentId: id.waarde } });
    return rij ? naarDomein(rij) : null;
  }

  async zoekAlle(filter?: { status?: IncidentStatus; kunstwerkId?: string }): Promise<Incident[]> {
    const rijen = await this.prisma.incident.findMany({
      where: {
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.kunstwerkId ? { kunstwerkId: filter.kunstwerkId } : {}),
      },
      orderBy: { aangemaaktOp: 'desc' },
    });
    return rijen.map(naarDomein);
  }
}
```

- [ ] **Step 6: `PrismaRapportRepository`**

`monitoring/src/infrastructure/db/prisma-rapport-repository.ts`:
```ts
import type { PrismaClient, Prisma } from '@prisma/client';
import type { RapportRepository } from '../../application/ports.js';
import { MonitoringRapport, type RapportResultaten } from '../../domain/rapport/monitoring-rapport.js';
import { KunstwerkReferentie, RapportId } from '../../domain/gedeeld/waarden.js';

type Rij = {
  rapportId: string;
  kunstwerkId: string;
  incidentId: string | null;
  periodeStart: Date;
  periodeEind: Date;
  resultaten: unknown;
  opgesteldOp: Date;
};

function naarDomein(rij: Rij): MonitoringRapport {
  return MonitoringRapport.herstel({
    id: RapportId.van(rij.rapportId),
    kunstwerkId: KunstwerkReferentie.van(rij.kunstwerkId),
    periodeStart: rij.periodeStart,
    periodeEind: rij.periodeEind,
    incidentId: rij.incidentId,
    resultaten: rij.resultaten as RapportResultaten,
    opgesteldOp: rij.opgesteldOp,
  });
}

export class PrismaRapportRepository implements RapportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(r: MonitoringRapport): Promise<void> {
    await this.prisma.monitoringRapport.create({
      data: {
        rapportId: r.id.waarde,
        kunstwerkId: r.kunstwerkId.waarde,
        incidentId: r.incidentId,
        periodeStart: r.periodeStart,
        periodeEind: r.periodeEind,
        resultaten: r.resultaten as unknown as Prisma.InputJsonValue,
        opgesteldOp: r.opgesteldOp,
      },
    });
  }

  async zoek(id: RapportId): Promise<MonitoringRapport | null> {
    const rij = await this.prisma.monitoringRapport.findUnique({ where: { rapportId: id.waarde } });
    return rij ? naarDomein(rij) : null;
  }

  async zoekAlle(kunstwerkId?: string): Promise<MonitoringRapport[]> {
    const rijen = await this.prisma.monitoringRapport.findMany({
      where: kunstwerkId ? { kunstwerkId } : undefined,
      orderBy: { opgesteldOp: 'desc' },
    });
    return rijen.map(naarDomein);
  }
}
```

- [ ] **Step 7: Build controleren**

Run: `npm run build`
Expected: `tsc` compileert zonder fouten (types kloppen tussen repo's, domeinobjecten en Prisma-client).

- [ ] **Step 8: Commit**

```bash
git add monitoring/prisma monitoring/src/infrastructure/db
git commit -m "feat(monitoring): Prisma-domeintabellen en repository-implementaties"
```

---

### Task 13: Infrastructure — RabbitMQ EventPublisher (envelope)

**Files:**
- Create: `monitoring/src/infrastructure/messaging/rabbitmq-event-publisher.ts`
- Test: `monitoring/test/infrastructure/rabbitmq-event-publisher.test.ts`

**Interfaces:**
- Consumes: `EventPublisher` (Task 9), `MonitoringDomainEvent` (Task 5), `RWS_EXCHANGE` (Task 3).
- Produces: `class RabbitMqEventPublisher implements EventPublisher` — constructor `(kanaal: KanaalPublish, idGenerator?: () => string, klok?: () => Date)`, waarbij `interface KanaalPublish { publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean }`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/infrastructure/rabbitmq-event-publisher.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { RabbitMqEventPublisher, type KanaalPublish } from '../../src/infrastructure/messaging/rabbitmq-event-publisher.js';

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
      { eventType: 'monitoring.incident.aangemaakt', data: { incidentId: 'I1', kunstwerkId: 'KW1', ernst: 'Kritiek', omschrijving: 'x', sensorType: 'Trilling', vervolgactie: 'Onderhoud' } },
    ]);

    expect(gepubliceerd).toHaveLength(1);
    expect(gepubliceerd[0].exchange).toBe('rws.events');
    expect(gepubliceerd[0].routingKey).toBe('monitoring.incident.aangemaakt');
    expect(gepubliceerd[0].body).toEqual({
      eventId: 'vaste-uuid',
      eventType: 'monitoring.incident.aangemaakt',
      occurredAt: '2026-07-01T12:00:00.000Z',
      producer: 'monitoring',
      version: 1,
      data: { incidentId: 'I1', kunstwerkId: 'KW1', ernst: 'Kritiek', omschrijving: 'x', sensorType: 'Trilling', vervolgactie: 'Onderhoud' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rabbitmq-event-publisher`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer de publisher**

`monitoring/src/infrastructure/messaging/rabbitmq-event-publisher.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { EventPublisher } from '../../application/ports.js';
import type { MonitoringDomainEvent } from '../../domain/gedeeld/domain-events.js';
import { RWS_EXCHANGE } from './rabbitmq-connectie.js';

export interface KanaalPublish {
  publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean;
}

export class RabbitMqEventPublisher implements EventPublisher {
  constructor(
    private readonly kanaal: KanaalPublish,
    private readonly nieuwId: () => string = uuid,
    private readonly nu: () => Date = () => new Date(),
  ) {}

  async publiceer(events: MonitoringDomainEvent[]): Promise<void> {
    for (const event of events) {
      const envelope = {
        eventId: this.nieuwId(),
        eventType: event.eventType,
        occurredAt: this.nu().toISOString(),
        producer: 'monitoring',
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
git add monitoring/src/infrastructure/messaging/rabbitmq-event-publisher.ts monitoring/test/infrastructure/rabbitmq-event-publisher.test.ts
git commit -m "feat(monitoring): RabbitMQ EventPublisher met vaste envelope"
```

---

### Task 14: Infrastructure — Beheer-consumer + KunstwerkenReadModel

Anti-corruption aan de rand: het `beheer.kunstwerk.*`-event wordt in `infrastructure` vertaald naar het lokale read-model; de envelope lekt niet naar `domain`.

**Files:**
- Create: `monitoring/src/infrastructure/messaging/beheer-kunstwerk-consumer.ts`
- Create: `monitoring/src/infrastructure/db/prisma-kunstwerken-read-model.ts`
- Test: `monitoring/test/infrastructure/beheer-kunstwerk-consumer.test.ts`

**Interfaces:**
- Consumes: `KunstwerkenReadModel` (Task 9), `RabbitMqConnectie` (Task 3).
- Produces: `class PrismaKunstwerkenReadModel implements KunstwerkenReadModel, KunstwerkStore, EventDedup`.
- Produces: `class BeheerKunstwerkVerwerker` met `async verwerk(envelope: { eventId: string; eventType: string; data: Record<string, unknown> }): Promise<void>` (idempotent) en losstaande `startBeheerConsumer(connectie, verwerker)` voor de bedrading. De verwerker gebruikt twee poorten: `KunstwerkStore` (upsert/markeer) en `EventDedup` (isVerwerkt/markeerVerwerkt).

- [ ] **Step 1: Write the failing test (idempotentie + vertaling)**

`monitoring/test/infrastructure/beheer-kunstwerk-consumer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BeheerKunstwerkVerwerker, type EventDedup, type KunstwerkStore } from '../../src/infrastructure/messaging/beheer-kunstwerk-consumer.js';

class FakeStore implements KunstwerkStore {
  upserts: Array<{ id: string; inGebruik: boolean }> = [];
  async upsert(id: string, _type: string | null, _locatie: string | null): Promise<void> { this.upserts.push({ id, inGebruik: true }); }
  async markeerBuitenGebruik(id: string): Promise<void> { this.upserts.push({ id, inGebruik: false }); }
}
class FakeDedup implements EventDedup {
  private gezien = new Set<string>();
  async isVerwerkt(id: string): Promise<boolean> { return this.gezien.has(id); }
  async markeerVerwerkt(id: string): Promise<void> { this.gezien.add(id); }
}

describe('BeheerKunstwerkVerwerker', () => {
  it('vertaalt geregistreerd naar een upsert', async () => {
    const store = new FakeStore();
    const v = new BeheerKunstwerkVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'beheer.kunstwerk.geregistreerd', data: { kunstwerkId: 'KW1', type: 'brug', locatie: 'A2' } });
    expect(store.upserts).toEqual([{ id: 'KW1', inGebruik: true }]);
  });

  it('is idempotent: hetzelfde eventId wordt maar één keer verwerkt', async () => {
    const store = new FakeStore();
    const dedup = new FakeDedup();
    const v = new BeheerKunstwerkVerwerker(store, dedup);
    const env = { eventId: 'e1', eventType: 'beheer.kunstwerk.buitengebruikgesteld', data: { kunstwerkId: 'KW1' } };
    await v.verwerk(env);
    await v.verwerk(env);
    expect(store.upserts).toEqual([{ id: 'KW1', inGebruik: false }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- beheer-kunstwerk-consumer`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer de verwerker + poorten**

`monitoring/src/infrastructure/messaging/beheer-kunstwerk-consumer.ts`:
```ts
import type { RabbitMqConnectie } from './rabbitmq-connectie.js';
import { RWS_EXCHANGE } from './rabbitmq-connectie.js';

export interface KunstwerkStore {
  upsert(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void>;
  markeerBuitenGebruik(kunstwerkId: string): Promise<void>;
}
export interface EventDedup {
  isVerwerkt(eventId: string): Promise<boolean>;
  markeerVerwerkt(eventId: string): Promise<void>;
}
interface Envelope { eventId: string; eventType: string; data: Record<string, unknown> }

export class BeheerKunstwerkVerwerker {
  constructor(private readonly store: KunstwerkStore, private readonly dedup: EventDedup) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    if (env.eventType === 'beheer.kunstwerk.geregistreerd') {
      await this.store.upsert(kunstwerkId, (env.data.type as string) ?? null, (env.data.locatie as string) ?? null);
    } else if (env.eventType === 'beheer.kunstwerk.buitengebruikgesteld') {
      await this.store.markeerBuitenGebruik(kunstwerkId);
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

const QUEUE = 'monitoring.beheer-kunstwerk';

export async function startBeheerConsumer(connectie: RabbitMqConnectie, verwerker: BeheerKunstwerkVerwerker): Promise<void> {
  const kanaal = connectie.kanaal;
  await kanaal.assertQueue(QUEUE, { durable: true });
  await kanaal.bindQueue(QUEUE, RWS_EXCHANGE, 'beheer.kunstwerk.*');
  await kanaal.consume(QUEUE, async (bericht) => {
    if (!bericht) return;
    try {
      await verwerker.verwerk(JSON.parse(bericht.content.toString()));
      kanaal.ack(bericht);
    } catch {
      kanaal.nack(bericht, false, false);
    }
  });
}
```

- [ ] **Step 4: Implementeer `PrismaKunstwerkenReadModel` (+ dedup + store via Prisma)**

`monitoring/src/infrastructure/db/prisma-kunstwerken-read-model.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { KunstwerkenReadModel } from '../../application/ports.js';
import type { KunstwerkReferentie } from '../../domain/gedeeld/waarden.js';
import type { EventDedup, KunstwerkStore } from '../messaging/beheer-kunstwerk-consumer.js';

export class PrismaKunstwerkenReadModel implements KunstwerkenReadModel, KunstwerkStore, EventDedup {
  constructor(private readonly prisma: PrismaClient) {}

  async isBekendEnInGebruik(id: KunstwerkReferentie): Promise<boolean> {
    const rij = await this.prisma.bekendKunstwerk.findUnique({ where: { kunstwerkId: id.waarde } });
    return rij?.inGebruik ?? false;
  }
  async upsert(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void> {
    await this.prisma.bekendKunstwerk.upsert({
      where: { kunstwerkId },
      create: { kunstwerkId, type: type ?? undefined, locatie: locatie ?? undefined, inGebruik: true },
      update: { type: type ?? undefined, locatie: locatie ?? undefined, inGebruik: true },
    });
  }
  async markeerBuitenGebruik(kunstwerkId: string): Promise<void> {
    await this.prisma.bekendKunstwerk.upsert({
      where: { kunstwerkId },
      create: { kunstwerkId, inGebruik: false },
      update: { inGebruik: false },
    });
  }
  async isVerwerkt(eventId: string): Promise<boolean> {
    return (await this.prisma.verwerktEvent.findUnique({ where: { eventId } })) !== null;
  }
  async markeerVerwerkt(eventId: string): Promise<void> {
    await this.prisma.verwerktEvent.create({ data: { eventId } });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- beheer-kunstwerk-consumer`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add monitoring/src/infrastructure/db/prisma-kunstwerken-read-model.ts monitoring/src/infrastructure/messaging/beheer-kunstwerk-consumer.ts monitoring/test/infrastructure/beheer-kunstwerk-consumer.test.ts
git commit -m "feat(monitoring): Beheer-kunstwerk-consumer met idempotent read-model"
```

---

### Task 15: Interface — REST-routes

Dunne controllers: ontvang → valideer → roep use case → map naar response. `DomeinFout` → 400; onbekende id bij een GET → 404.

**Files:**
- Create: `monitoring/src/interface/http/fout-afhandeling.ts`
- Create: `monitoring/src/interface/http/sessie-routes.ts`
- Create: `monitoring/src/interface/http/meting-routes.ts`
- Create: `monitoring/src/interface/http/incident-routes.ts`
- Create: `monitoring/src/interface/http/rapport-routes.ts`

**Interfaces:**
- Consumes: use cases (Task 9/10/11), queries (Task 11).
- Produces: `naarHttpFout(fout: unknown): { code: number; body: { fout: string } }`.
- Produces: `registreerSessieRoutes(app, deps)`, `registreerMetingRoutes(app, deps)`, `registreerIncidentRoutes(app, deps)`, `registreerRapportRoutes(app, deps)`.

- [ ] **Step 1: Foutvertaling**

`monitoring/src/interface/http/fout-afhandeling.ts`:
```ts
import { DomeinFout } from '../../domain/gedeeld/fouten.js';

export function naarHttpFout(fout: unknown): { code: number; body: { fout: string } } {
  if (fout instanceof DomeinFout) return { code: 400, body: { fout: fout.message } };
  return { code: 500, body: { fout: 'interne fout' } };
}
```

- [ ] **Step 2: Sessie-routes**

`monitoring/src/interface/http/sessie-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { StartMonitoringSessie } from '../../application/sessie/start-monitoring-sessie.js';
import type { PauzeerMonitoringSessie } from '../../application/sessie/pauzeer-monitoring-sessie.js';
import type { HervatMonitoringSessie } from '../../application/sessie/hervat-monitoring-sessie.js';
import type { RondMonitoringSessieAf } from '../../application/sessie/rond-monitoring-sessie-af.js';
import type { MonitoringSessieRepository } from '../../application/ports.js';
import { haalSessie, zoekSessies } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface SessieRouteDeps {
  start: StartMonitoringSessie;
  pauzeer: PauzeerMonitoringSessie;
  hervat: HervatMonitoringSessie;
  rondAf: RondMonitoringSessieAf;
  repo: MonitoringSessieRepository;
}

export function registreerSessieRoutes(app: FastifyInstance, deps: SessieRouteDeps): void {
  app.post('/api/sessies', {
    schema: {
      body: {
        type: 'object',
        required: ['kunstwerkId'],
        properties: { kunstwerkId: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    try {
      const resultaat = await deps.start.uitvoeren(req.body as never);
      reply.code(201).send(resultaat);
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.post('/api/sessies/:id/pauzering', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.pauzeer.uitvoeren({ sessieId: id });
      reply.code(200).send({ status: 'gepauzeerd' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.post('/api/sessies/:id/hervatting', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.hervat.uitvoeren({ sessieId: id });
      reply.code(200).send({ status: 'actief' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.post('/api/sessies/:id/afronding', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.rondAf.uitvoeren({ sessieId: id });
      reply.code(200).send({ status: 'afgerond' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.get('/api/sessies', async (_req, reply) => {
    reply.send(await zoekSessies(deps.repo));
  });

  app.get('/api/sessies/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const weergave = await haalSessie(deps.repo, id);
    if (!weergave) { reply.code(404).send({ fout: 'niet gevonden' }); return; }
    reply.send(weergave);
  });
}
```

- [ ] **Step 3: Meting-routes**

`monitoring/src/interface/http/meting-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { RegistreerMeting } from '../../application/meting/registreer-meting.js';
import type { MetingRepository } from '../../application/ports.js';
import type { SensorType } from '../../domain/gedeeld/sensor.js';
import { zoekMetingen } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface MetingRouteDeps {
  registreer: RegistreerMeting;
  repo: MetingRepository;
}

export function registreerMetingRoutes(app: FastifyInstance, deps: MetingRouteDeps): void {
  app.post('/api/metingen', {
    schema: {
      body: {
        type: 'object',
        required: ['kunstwerkId', 'sensorType', 'waarde'],
        properties: {
          kunstwerkId: { type: 'string' },
          sensorType: { type: 'string' },
          waarde: { type: 'number' },
          tijdstip: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const resultaat = await deps.registreer.uitvoeren(req.body as never);
      reply.code(201).send(resultaat);
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.get('/api/metingen', async (req, reply) => {
    const { kunstwerkId, sensorType } = req.query as { kunstwerkId?: string; sensorType?: SensorType };
    if (!kunstwerkId) { reply.code(400).send({ fout: 'kunstwerkId is verplicht' }); return; }
    reply.send(await zoekMetingen(deps.repo, kunstwerkId, sensorType));
  });
}
```

- [ ] **Step 4: Incident-routes**

`monitoring/src/interface/http/incident-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { NeemIncidentInBehandeling } from '../../application/incident/neem-incident-in-behandeling.js';
import type { LosIncidentOp } from '../../application/incident/los-incident-op.js';
import type { IncidentRepository } from '../../application/ports.js';
import type { IncidentStatus } from '../../domain/incident/incident.js';
import { haalIncident, zoekIncidenten } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface IncidentRouteDeps {
  neemInBehandeling: NeemIncidentInBehandeling;
  losOp: LosIncidentOp;
  repo: IncidentRepository;
}

export function registreerIncidentRoutes(app: FastifyInstance, deps: IncidentRouteDeps): void {
  app.post('/api/incidenten/:id/inbehandelingname', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.neemInBehandeling.uitvoeren({ incidentId: id });
      reply.code(200).send({ status: 'in behandeling' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.post('/api/incidenten/:id/oplossing', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.losOp.uitvoeren({ incidentId: id });
      reply.code(200).send({ status: 'opgelost' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.get('/api/incidenten', async (req, reply) => {
    const { status, kunstwerkId } = req.query as { status?: IncidentStatus; kunstwerkId?: string };
    reply.send(await zoekIncidenten(deps.repo, { status, kunstwerkId }));
  });

  app.get('/api/incidenten/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const weergave = await haalIncident(deps.repo, id);
    if (!weergave) { reply.code(404).send({ fout: 'niet gevonden' }); return; }
    reply.send(weergave);
  });
}
```

- [ ] **Step 5: Rapport-routes**

`monitoring/src/interface/http/rapport-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { StelRapportOp } from '../../application/rapport/stel-rapport-op.js';
import type { RapportRepository } from '../../application/ports.js';
import { haalRapport, zoekRapporten } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface RapportRouteDeps {
  stelOp: StelRapportOp;
  repo: RapportRepository;
}

export function registreerRapportRoutes(app: FastifyInstance, deps: RapportRouteDeps): void {
  app.post('/api/rapporten', {
    schema: {
      body: {
        type: 'object',
        required: ['kunstwerkId', 'periodeStart', 'periodeEind'],
        properties: {
          kunstwerkId: { type: 'string' },
          periodeStart: { type: 'string' },
          periodeEind: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const resultaat = await deps.stelOp.uitvoeren(req.body as never);
      reply.code(201).send(resultaat);
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.get('/api/rapporten', async (req, reply) => {
    const { kunstwerkId } = req.query as { kunstwerkId?: string };
    reply.send(await zoekRapporten(deps.repo, kunstwerkId));
  });

  app.get('/api/rapporten/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const weergave = await haalRapport(deps.repo, id);
    if (!weergave) { reply.code(404).send({ fout: 'niet gevonden' }); return; }
    reply.send(weergave);
  });
}
```

- [ ] **Step 6: Build controleren**

Run: `npm run build`
Expected: compileert zonder fouten.

- [ ] **Step 7: Commit**

```bash
git add monitoring/src/interface/http
git commit -m "feat(monitoring): REST-routes voor sessies, metingen, incidenten en rapporten"
```

---

### Task 16: Interface — OpenAPI + composition root

Bedraad alles in `main.ts` en registreer OpenAPI. Breid `bouwApp` uit met de echte routes.

**Files:**
- Modify: `monitoring/src/interface/http/app.ts`
- Modify: `monitoring/src/main.ts`
- Create: `monitoring/src/infrastructure/id-generator.ts`
- Create: `monitoring/src/infrastructure/klok.ts`

**Interfaces:**
- Consumes: alle voorgaande taken.
- Produces: `class UuidIdGenerator implements IdGenerator`; `class SysteemKlok implements Klok`.
- Produces: uitgebreide `AppDeps` met `sessie?`, `meting?`, `incident?`, `rapport?`.

- [ ] **Step 1: UUID-id-generator en systeemklok**

`monitoring/src/infrastructure/id-generator.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { IdGenerator } from '../application/ports.js';

export class UuidIdGenerator implements IdGenerator {
  nieuw(): string { return uuid(); }
}
```

`monitoring/src/infrastructure/klok.ts`:
```ts
import type { Klok } from '../application/ports.js';

export class SysteemKlok implements Klok {
  nu(): Date { return new Date(); }
}
```

- [ ] **Step 2: `app.ts` uitbreiden met routes + OpenAPI**

`monitoring/src/interface/http/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registreerHealthRoute, type HealthChecks } from './health-route.js';
import { registreerSessieRoutes, type SessieRouteDeps } from './sessie-routes.js';
import { registreerMetingRoutes, type MetingRouteDeps } from './meting-routes.js';
import { registreerIncidentRoutes, type IncidentRouteDeps } from './incident-routes.js';
import { registreerRapportRoutes, type RapportRouteDeps } from './rapport-routes.js';

export interface AppDeps {
  health?: HealthChecks;
  sessie?: SessieRouteDeps;
  meting?: MetingRouteDeps;
  incident?: IncidentRouteDeps;
  rapport?: RapportRouteDeps;
}

export async function bouwApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(swagger, {
    openapi: { info: { title: 'Monitoring-service', version: '0.1.0' } },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  registreerHealthRoute(app, deps.health);
  if (deps.sessie) registreerSessieRoutes(app, deps.sessie);
  if (deps.meting) registreerMetingRoutes(app, deps.meting);
  if (deps.incident) registreerIncidentRoutes(app, deps.incident);
  if (deps.rapport) registreerRapportRoutes(app, deps.rapport);
  return app;
}
```

> **Let op:** `bouwApp` is nu `async`. Pas de aanroep in `main.ts` dienovereenkomstig aan (`await bouwApp(...)`).

- [ ] **Step 3: Composition root in `main.ts`**

`monitoring/src/main.ts`:
```ts
import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';
import { maakPrismaClient } from './infrastructure/db/prisma-client.js';
import { RabbitMqConnectie } from './infrastructure/messaging/rabbitmq-connectie.js';
import { RabbitMqEventPublisher } from './infrastructure/messaging/rabbitmq-event-publisher.js';
import { PrismaMonitoringSessieRepository } from './infrastructure/db/prisma-monitoring-sessie-repository.js';
import { PrismaMetingRepository } from './infrastructure/db/prisma-meting-repository.js';
import { PrismaIncidentRepository } from './infrastructure/db/prisma-incident-repository.js';
import { PrismaRapportRepository } from './infrastructure/db/prisma-rapport-repository.js';
import { PrismaKunstwerkenReadModel } from './infrastructure/db/prisma-kunstwerken-read-model.js';
import { UuidIdGenerator } from './infrastructure/id-generator.js';
import { SysteemKlok } from './infrastructure/klok.js';
import { BeheerKunstwerkVerwerker, startBeheerConsumer } from './infrastructure/messaging/beheer-kunstwerk-consumer.js';
import { AnalyseService } from './domain/analyse/analyse-service.js';
import { StartMonitoringSessie } from './application/sessie/start-monitoring-sessie.js';
import { PauzeerMonitoringSessie } from './application/sessie/pauzeer-monitoring-sessie.js';
import { HervatMonitoringSessie } from './application/sessie/hervat-monitoring-sessie.js';
import { RondMonitoringSessieAf } from './application/sessie/rond-monitoring-sessie-af.js';
import { RegistreerMeting } from './application/meting/registreer-meting.js';
import { NeemIncidentInBehandeling } from './application/incident/neem-incident-in-behandeling.js';
import { LosIncidentOp } from './application/incident/los-incident-op.js';
import { StelRapportOp } from './application/rapport/stel-rapport-op.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const prisma = maakPrismaClient(config.databaseUrl);
  const rabbit = await RabbitMqConnectie.verbind(config.rabbitmqUrl);

  const ids = new UuidIdGenerator();
  const klok = new SysteemKlok();
  const publisher = new RabbitMqEventPublisher(rabbit.kanaal);
  const analyse = new AnalyseService();
  const sessieRepo = new PrismaMonitoringSessieRepository(prisma);
  const metingRepo = new PrismaMetingRepository(prisma);
  const incidentRepo = new PrismaIncidentRepository(prisma);
  const rapportRepo = new PrismaRapportRepository(prisma);
  const kunstwerken = new PrismaKunstwerkenReadModel(prisma);

  const app = await bouwApp({
    health: {
      db: async () => { await prisma.$queryRaw`SELECT 1`; return true; },
      broker: async () => rabbit.isVerbonden(),
    },
    sessie: {
      start: new StartMonitoringSessie(sessieRepo, kunstwerken, publisher, ids, klok, config.kunstwerkValidatie),
      pauzeer: new PauzeerMonitoringSessie(sessieRepo, publisher),
      hervat: new HervatMonitoringSessie(sessieRepo, publisher),
      rondAf: new RondMonitoringSessieAf(sessieRepo, publisher, klok),
      repo: sessieRepo,
    },
    meting: {
      registreer: new RegistreerMeting(sessieRepo, metingRepo, incidentRepo, analyse, publisher, ids, klok),
      repo: metingRepo,
    },
    incident: {
      neemInBehandeling: new NeemIncidentInBehandeling(incidentRepo, publisher),
      losOp: new LosIncidentOp(incidentRepo, publisher, klok),
      repo: incidentRepo,
    },
    rapport: {
      stelOp: new StelRapportOp(metingRepo, incidentRepo, rapportRepo, publisher, ids, klok),
      repo: rapportRepo,
    },
  });

  await startBeheerConsumer(rabbit, new BeheerKunstwerkVerwerker(kunstwerken, kunstwerken));
  await app.listen({ host: '0.0.0.0', port: config.poort });
}

start().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
```

- [ ] **Step 4: Volledige build + tests**

Run: `npm run build && npm test`
Expected: build zonder fouten; alle tests groen.

- [ ] **Step 5: Manuele smoke-test (hele flow)**

Run: repo-root `docker compose up -d postgres rabbitmq`; `monitoring/` `npx prisma migrate deploy` (met lokale `DATABASE_URL`); `npx tsx src/main.ts`.
Verifieer:
```bash
curl -s localhost:8002/health
curl -s -X POST localhost:8002/api/sessies -H 'content-type: application/json' \
  -d '{"kunstwerkId":"KW1"}'
# normale meting — geen incident
curl -s -X POST localhost:8002/api/metingen -H 'content-type: application/json' \
  -d '{"kunstwerkId":"KW1","sensorType":"Trilling","waarde":3}'
# afwijkende meting — Trilling 12 = factor 2.4 → Kritiek incident
curl -s -X POST localhost:8002/api/metingen -H 'content-type: application/json' \
  -d '{"kunstwerkId":"KW1","sensorType":"Trilling","waarde":12}'
curl -s localhost:8002/api/incidenten
# neem de incidentId over uit het antwoord (hierna <IID>)
curl -s -X POST localhost:8002/api/incidenten/<IID>/oplossing
curl -s -X POST localhost:8002/api/rapporten -H 'content-type: application/json' \
  -d '{"kunstwerkId":"KW1","periodeStart":"2026-07-01","periodeEind":"2026-07-31"}'
curl -s 'localhost:8002/api/metingen?kunstwerkId=KW1'
```
Expected: health 200; POST's 201/200; het incident heeft `ernst:"Kritiek"` en `vervolgactie:"Onderhoud"`; het rapport bevat de samenvatting. Controleer in de RabbitMQ-UI (`http://localhost:15672`) dat er events op `rws.events` verschenen (bind een tijdelijke queue op `monitoring.#`): `meting.geregistreerd` (2×), `incident.aangemaakt`, `incident.opgelost`, `rapport.opgesteld`. Open `http://localhost:8002/api/docs` voor de OpenAPI-UI.

- [ ] **Step 6: Commit**

```bash
git add monitoring/src/interface/http/app.ts monitoring/src/main.ts monitoring/src/infrastructure/id-generator.ts monitoring/src/infrastructure/klok.ts
git commit -m "feat(monitoring): OpenAPI en composition root — service volledig bedraad"
```

---

### Task 17: Docker + docker-compose + eind-verificatie

**Files:**
- Modify: `monitoring/Dockerfile`
- Modify: `docker-compose.yml` (repo-root)
- Create: `monitoring/.dockerignore`

**Interfaces:** geen code-interfaces; leveren een draaiende container.

- [ ] **Step 1: Dockerfile (multi-stage Node)**

Vervang de inhoud van `monitoring/Dockerfile`:
```dockerfile
# Monitoring-service — Node.js (TypeScript) multi-stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 8002
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

- [ ] **Step 2: `.dockerignore`**

`monitoring/.dockerignore`:
```
node_modules
dist
.env
test
```

- [ ] **Step 3: Compose-blok activeren**

In `docker-compose.yml` (repo-root): verwijder de `#`-comments van het `monitoring`-blok, zodat het actief wordt. Laat de andere service-blokken ongemoeid.

- [ ] **Step 4: `.env` aanmaken**

Run (in `monitoring/`): `cp .env.example .env` (laat de hostnamen op `postgres`/`rabbitmq` staan — binnen compose kloppen die).

- [ ] **Step 5: Eind-verificatie via compose**

Run (repo-root): `docker compose up --build monitoring postgres rabbitmq`
Verifieer in een tweede shell:
```bash
curl -s localhost:8002/health         # {"status":"ok","db":true,"broker":true}
```
Herhaal daarna de smoke-flow uit Task 16 tegen `localhost:8002`. Expected: 200/201-antwoorden, incident + rapport zichtbaar, events op `rws.events`.

- [ ] **Step 6: Commit**

```bash
git add monitoring/Dockerfile monitoring/.dockerignore docker-compose.yml
git commit -m "feat(monitoring): Docker-image en compose-integratie"
```

---

## Self-Review (uitgevoerd)

**Spec-dekking:** alle 4 events (Tasks 5/6/7/8 definiëren + registreren ze; 13 publiceert ze), beide aggregates (6/7), AnalyseService met drempelmodel + grensgevallen (7), MonitoringRapport (8/11), read-model + soepele validatie (9/14), REST + OpenAPI incl. de verplichte `GET /api/metingen?kunstwerkId=…` en `GET /api/incidenten` (15/16), health + DB + broker (1–3, 16), TDD op domain/application (4–11), Docker (17). ✔
**Fase-grens:** echte sensor-ACL-adapters, DynamoDB, strenge validatie, reactie op buitengebruikstelling (sessies auto-afronden), outbox/event-handler-splitsing van `RegistreerMeting`, Testcontainers en Dokploy zitten bewust **niet** in dit plan (Fase 2). ✔
**Type-consistentie:** anders dan bij het contract-plan zijn alle getters en `herstel`-factories al in de domein-taken (6/7/8) opgenomen; Task 12 hoeft geen aggregates meer aan te passen. `bouwApp` wordt pas in Task 16 `async`. ✔
**Contract-consistentie:** routing keys, envelope-velden en de `data`-kernvelden komen exact uit `docs/events.md`; extra velden (`metingId`, `sessieId`, `sensorType`, `vervolgactie`) zijn achterwaarts-compatibele toevoegingen. Het nullable `incidentId` in `rapport.opgesteld` staat als openstaand punt in de design-spec (§12). ✔

## Aandachtspunten bij uitvoering

- `bouwApp` wordt in Task 16 `async`; werk de aanroep in `main.ts` bij (de skelet-aanroep uit Task 1 is dan al vervangen).
- Prisma-migraties draaien lokaal met `DATABASE_URL` op host `localhost`; in de container gebruikt compose host `postgres`.
- De `VasteIdGenerator` deelt in `RegistreerMeting` één teller over metingen én incidenten (`M-1`, `M-2`, …) — de test in Task 10 rekent daarop (`incidentId === 'M-2'`).
- `console.warn` in `StartMonitoringSessie` (soepele validatie) is bewust simpel gehouden; een logger-port is YAGNI voor Fase 1.
- Werk op branch `monitoring-service` en commit na elke taak; de commit-stappen staan per taak uitgeschreven.

