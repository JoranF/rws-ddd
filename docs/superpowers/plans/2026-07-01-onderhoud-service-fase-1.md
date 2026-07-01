# Onderhoud-service Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouw de Onderhoud bounded context (Fase 1) als zelfstandig draaiende service: drie aggregates (Storing, Onderhoud, OnderhoudsSchema), twee instappunten (MeldStoring + StelDiagnose), alle 4 gepubliceerde events, idempotente consumers voor Monitoring/Contract/Beheer, een Anti-Corruption Layer voor externe aannemersfacturen, REST + OpenAPI, en Docker.

**Architecture:** Vier lagen met de afhankelijkheidsregel naar binnen (`interface → application → domain`, `infrastructure → domain/application`). `domain` is puur TypeScript; Prisma/Fastify/amqplib leven alleen in `infrastructure`/`interface`. Bouwvolgorde: walking skeleton (server/DB/broker/health) → domein met TDD → applicatie-use-cases met in-memory fakes → infrastructure-implementaties (repos, publisher, consumers, ACL) → interface + composition root → Docker. Zelfde stack en patronen als de Contract-service, zodat de repo consistent blijft.

**Tech Stack:** Node.js 22, TypeScript (ESM), Fastify 5, Prisma 6 (+ PostgreSQL `onderhoud_db`), amqplib (RabbitMQ topic-exchange `rws.events`), Vitest 2, uuid.

## Global Constraints

- Poort **8003** via `SERVICE_PORT`; DB via `DATABASE_URL` (`postgres://rws:rws@postgres:5432/onderhoud_db`); broker via `RABBITMQ_URL` (`amqp://rws:rws@rabbitmq:5672`).
- `GET /health` geeft `200` zodra DB- en broker-connectie er zijn.
- Alle REST onder basispad **`/api`**.
- Events publiceren op durable topic-exchange **`rws.events`**, routing key `onderhoud.<aggregate>.<event>`, met de vaste envelope: `{ eventId (uuid), eventType, occurredAt (ISO-8601 UTC), producer:"onderhoud", version:1, data }`.
- Gepubliceerde events (exact deze 4, payloads uit `docs/events.md`): `onderhoud.storing.gemeld`, `onderhoud.onderhoud.gestart`, `onderhoud.onderhoud.afgerond`, `onderhoud.contractaanvraag.ingediend`.
- Geconsumeerde events: `monitoring.incident.aangemaakt`, `contract.onderhoudscontract.gegund` (+ `.afgerond`), `beheer.kunstwerk.*`, `beheer.onderhoudseisen.vastgesteld`. Consumers zijn **idempotent** (dedupe op `eventId` in tabel `VerwerktEvent`).
- Ubiquitous language uit `onderhoud/README.md`: Storing (StoringId) · Diagnose · Onderhoud (OnderhoudId) · OnderhoudsSchema (SchemaId) · Inspectie · Factuur (FactuurId) · AannemerId · Status. `kunstwerkId`/`contractId`/`incidentId` zijn referenties naar andere contexts — nooit hun model kopiëren.
- `ernst` volgt de enum uit het verslag: **Laag / Middel / Hoog / Kritiek**.
- Vertaal inkomende events en externe aannemersformaten aan de rand (`infrastructure`); envelope en externe modellen lekken nooit in `domain`.
- `domain` importeert **niets** uit `infrastructure`/`interface`/frameworks.
- `VALIDATIE` = `soepel` (default, Fase 1: onbekend kunstwerk/contract → waarschuwing) of `streng` (Fase 2: weigeren).
- Bedragen als gehele **centen** (integer); valuta `EUR`.
- Werk op branch `onderhoud-service`. Commit na elke taak.

---

### Task 1: Projectscaffold + config + `/health` (static)

Walking-skeleton-start: een Fastify-server die op 8003 draait met een statisch `/health`.

**Files:**
- Create: `onderhoud/package.json`
- Create: `onderhoud/tsconfig.json`
- Create: `onderhoud/vitest.config.ts`
- Create: `onderhoud/.gitignore`
- Create: `onderhoud/src/infrastructure/config.ts`
- Create: `onderhoud/src/interface/http/health-route.ts`
- Create: `onderhoud/src/interface/http/app.ts`
- Create: `onderhoud/src/main.ts`
- Test: `onderhoud/test/infrastructure/config.test.ts`

**Interfaces:**
- Produces: `laadConfig(env: NodeJS.ProcessEnv): Config` waarbij `Config = { poort: number; databaseUrl: string; rabbitmqUrl: string; validatie: 'soepel' | 'streng' }`.
- Produces: `bouwApp(deps?: AppDeps): FastifyInstance` (in Task 1 zonder deps; uitgebreid in Task 17, wordt daar `async`).

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

`onderhoud/tsconfig.json`:
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

`onderhoud/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

`onderhoud/.gitignore`:
```
node_modules/
dist/
.env
```

- [ ] **Step 4: Write the failing test voor config**

`onderhoud/test/infrastructure/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { laadConfig } from '../../src/infrastructure/config.js';

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

- [ ] **Step 6: Implementeer `config.ts`**

`onderhoud/src/infrastructure/config.ts`:
```ts
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

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS (2 tests).

- [ ] **Step 8: Health-route + app + main (static skeleton)**

`onderhoud/src/interface/http/health-route.ts`:
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

`onderhoud/src/interface/http/app.ts`:
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

`onderhoud/src/main.ts`:
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

Run: `SERVICE_PORT=8003 DATABASE_URL=x RABBITMQ_URL=x npx tsx src/main.ts` en in een tweede shell `curl -s localhost:8003/health`.
Expected: `{"status":"ok","db":true,"broker":true}` en HTTP 200. Stop de server.

- [ ] **Step 10: Commit**

```bash
git add onderhoud/package.json onderhoud/tsconfig.json onderhoud/vitest.config.ts onderhoud/.gitignore onderhoud/src onderhoud/test
git commit -m "feat(onderhoud): scaffold Fastify-skeleton met config en /health"
```

---

### Task 2: Prisma-bootstrap + DB-health

Verbind met `onderhoud_db` en laat `/health` de DB checken. Schema bevat nu alleen de read-model-/idempotentietabellen; domeintabellen volgen in Task 11.

**Files:**
- Create: `onderhoud/prisma/schema.prisma`
- Create: `onderhoud/src/infrastructure/db/prisma-client.ts`
- Modify: `onderhoud/src/main.ts`
- Modify: `onderhoud/.env.example` (var `VALIDATIE` toevoegen)

**Interfaces:**
- Consumes: `laadConfig` (Task 1), `registreerHealthRoute`/`AppDeps` (Task 1).
- Produces: `maakPrismaClient(databaseUrl: string): PrismaClient`.

- [ ] **Step 1: Prisma-schema (read-models + idempotentie)**

`onderhoud/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Read-model: kunstwerken uit Beheer (alleen ID + minimale info, geen kopie van hun model)
model BekendKunstwerk {
  kunstwerkId  String   @id
  type         String?
  locatie      String?
  inGebruik    Boolean  @default(true)
  bijgewerktOp DateTime @updatedAt
}

// Read-model: gegunde onderhoudscontracten uit Contract (welke aannemer mag aan welk kunstwerk werken)
model GeldendContract {
  contractId    String    @id
  kunstwerkId   String
  opdrachtnemer String
  looptijdStart DateTime?
  looptijdEind  DateTime?
  actief        Boolean   @default(true)
  bijgewerktOp  DateTime  @updatedAt

  @@index([kunstwerkId])
}

// Read-model: onderhoudseisen uit Beheer (partnership)
model Onderhoudseis {
  kunstwerkId  String   @id
  eisen        Json
  bijgewerktOp DateTime @updatedAt
}

// Idempotentie: verwerkte eventId's van alle consumers
model VerwerktEvent {
  eventId    String   @id
  verwerktOp DateTime @default(now())
}
```

- [ ] **Step 2: `.env.example` bijwerken**

`onderhoud/.env.example`:
```
# Onderhoud service — kopieer naar .env
SERVICE_PORT=8003
DATABASE_URL=postgres://rws:rws@postgres:5432/onderhoud_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
VALIDATIE=soepel
```

- [ ] **Step 3: Migratie aanmaken**

Start de gedeelde infra vanuit de repo-root: `docker compose up -d postgres`.
Run (in `onderhoud/`): `DATABASE_URL=postgres://rws:rws@localhost:5432/onderhoud_db npx prisma migrate dev --name init-readmodel`
Expected: migratie `prisma/migrations/*/migration.sql` aangemaakt; tabellen `BekendKunstwerk`, `GeldendContract`, `Onderhoudseis`, `VerwerktEvent` bestaan.

- [ ] **Step 4: Prisma-clientfabriek**

`onderhoud/src/infrastructure/db/prisma-client.ts`:
```ts
import { PrismaClient } from '@prisma/client';

export function maakPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
```

- [ ] **Step 5: DB-health koppelen in `main.ts`**

Vervang de body van `start()` in `onderhoud/src/main.ts`:
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

Run: `cp .env.example .env` (pas `DATABASE_URL`-host aan naar `localhost` voor lokaal draaien), `npx prisma generate`, `npx tsx src/main.ts`, dan `curl -s localhost:8003/health`.
Expected: `{"status":"ok","db":true,...}`; zet postgres stil → `db:false` en HTTP 503.

- [ ] **Step 7: Commit**

```bash
git add onderhoud/prisma onderhoud/src/infrastructure/db onderhoud/src/main.ts onderhoud/.env.example
git commit -m "feat(onderhoud): Prisma-bootstrap met read-modeltabellen en DB-health"
```

---

### Task 3: RabbitMQ-connectie + broker-health

Bewijs broker-connectiviteit. Nog geen event-mapping (publisher volgt in Task 12, consumers in Task 13).

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/rabbitmq-connectie.ts`
- Modify: `onderhoud/src/main.ts`

**Interfaces:**
- Produces: `class RabbitMqConnectie { static async verbind(url: string): Promise<RabbitMqConnectie>; get kanaal(): Channel; isVerbonden(): boolean; async sluit(): Promise<void> }` en constante `RWS_EXCHANGE = 'rws.events'`.

- [ ] **Step 1: Connectiemodule**

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

Run: repo-root `docker compose up -d rabbitmq postgres`; dan in `onderhoud/` `npx tsx src/main.ts`; `curl -s localhost:8003/health`.
Expected: `{"status":"ok","db":true,"broker":true}`. Open `http://localhost:15672` (rws/rws) → exchange `rws.events` bestaat (type topic, durable).

- [ ] **Step 4: Commit**

```bash
git add onderhoud/src/infrastructure/messaging onderhoud/src/main.ts
git commit -m "feat(onderhoud): RabbitMQ-connectie en broker-health"
```

---

### Task 4: Domein — value objects

Pure value objects met invarianten. Volledig TDD; geen framework-imports.

**Files:**
- Create: `onderhoud/src/domain/gedeeld/fouten.ts`
- Create: `onderhoud/src/domain/gedeeld/waarden.ts`
- Test: `onderhoud/test/domain/waarden.test.ts`

**Interfaces:**
- Produces: `class DomeinFout extends Error`.
- Produces: identiteiten `StoringId`, `OnderhoudId`, `SchemaId`, `FactuurId`, `InspectieId`, `KunstwerkId`, `ContractId`, `IncidentId`, `AannemerId` (elk: `static van(waarde: string)`, `readonly waarde: string`, `gelijkAan(a): boolean`).
- Produces: `type Ernst = 'Laag' | 'Middel' | 'Hoog' | 'Kritiek'` + `ernstVan(waarde: string): Ernst`.
- Produces: `class Bedrag { static vanEuro(euro: number, valuta?: string): Bedrag; static vanCenten(centen: number, valuta?: string): Bedrag; readonly centen: number; readonly valuta: string; get euro(): number }`.
- Produces: `class Periode { static van(start: Date, eind: Date): Periode; readonly start: Date; readonly eind: Date; bevat(datum: Date): boolean }`.

- [ ] **Step 1: Write the failing tests**

`onderhoud/test/domain/waarden.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  Bedrag,
  ernstVan,
  KunstwerkId,
  Periode,
  StoringId,
} from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

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
git add onderhoud/src/domain/gedeeld onderhoud/test/domain/waarden.test.ts
git commit -m "feat(onderhoud): domein-value-objects met invarianten"
```

---

### Task 5: Domein — AggregateRoot + event-definities

Basisklasse voor event-registratie en de discriminated union van alle 4 gepubliceerde domain events (payloads = `data`-velden uit `docs/events.md`).

**Files:**
- Create: `onderhoud/src/domain/gedeeld/aggregate-root.ts`
- Create: `onderhoud/src/domain/gedeeld/domain-events.ts`
- Test: `onderhoud/test/domain/aggregate-root.test.ts`

**Interfaces:**
- Produces: `interface DomainEvent { eventType: string; data: Record<string, unknown> }`.
- Produces: `type OnderhoudDomainEvent` — union met `eventType`-waarden: `onderhoud.storing.gemeld`, `onderhoud.onderhoud.gestart`, `onderhoud.onderhoud.afgerond`, `onderhoud.contractaanvraag.ingediend`.
- Produces: `abstract class AggregateRoot { protected registreerEvent(e: OnderhoudDomainEvent): void; trekEventsLeeg(): OnderhoudDomainEvent[] }`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/domain/aggregate-root.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AggregateRoot } from '../../src/domain/gedeeld/aggregate-root.js';
import type { OnderhoudDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

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
import type { OnderhoudDomainEvent } from './domain-events.js';

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
git add onderhoud/src/domain/gedeeld/aggregate-root.ts onderhoud/src/domain/gedeeld/domain-events.ts onderhoud/test/domain/aggregate-root.test.ts
git commit -m "feat(onderhoud): AggregateRoot en domain-event-definities"
```

---

### Task 6: Domein — Storing-aggregate + diagnose-regel

Instappunt 1: een gemelde storing. Plus de domeinregel die bepaalt wanneer een storing/diagnose een onderhoudstraject vereist (Hoog/Kritiek).

**Files:**
- Create: `onderhoud/src/domain/storing/storing.ts`
- Create: `onderhoud/src/domain/diagnose/diagnose.ts`
- Test: `onderhoud/test/domain/storing.test.ts`

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

`onderhoud/test/domain/storing.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Storing } from '../../src/domain/storing/storing.js';
import { vereistOnderhoud } from '../../src/domain/diagnose/diagnose.js';
import { KunstwerkId, OnderhoudId, StoringId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

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
import type { Ernst, IncidentId } from '../gedeeld/waarden.js';

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
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import type { Ernst, KunstwerkId, OnderhoudId, StoringId } from '../gedeeld/waarden.js';

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
git add onderhoud/src/domain/storing onderhoud/src/domain/diagnose onderhoud/test/domain/storing.test.ts
git commit -m "feat(onderhoud): Storing-aggregate en diagnose-regel"
```

---

### Task 7: Domein — Onderhoud-aggregate (traject met Inspectie + Factuur)

Het hart van de context: een onderhoudstraject met aanleiding (Storing óf Diagnose), start, inspecties, afronding en factuurafhandeling. Invariant: afronden vereist een goedgekeurde inspectie; een factuur goedkeuren vereist een afgerond traject.

**Files:**
- Create: `onderhoud/src/domain/onderhoud/onderhoud.ts`
- Test: `onderhoud/test/domain/onderhoud.test.ts`

**Interfaces:**
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5), `Diagnose` (Task 6).
- Produces: `type OnderhoudStatus = 'Gepland' | 'Gestart' | 'Afgerond'`.
- Produces: `type Aanleiding = { soort: 'Storing'; storingId: StoringId } | { soort: 'Diagnose'; diagnose: Diagnose }`.
- Produces: `type InspectieOordeel = 'Goedgekeurd' | 'Afgekeurd'`; `interface Inspectie { id: InspectieId; datum: Date; oordeel: InspectieOordeel; opmerkingen?: string }`.
- Produces: `type FactuurStatus = 'Ontvangen' | 'Goedgekeurd' | 'Afgekeurd'`; `interface Factuur { id: FactuurId; bedrag: Bedrag; status: FactuurStatus; ontvangenOp: Date }`.
- Produces: `class Onderhoud extends AggregateRoot` met:
  - `static plan(p: { id: OnderhoudId; kunstwerkId: KunstwerkId; aanleiding: Aanleiding }): Onderhoud` (status `Gepland`, geen event — `gestart` is het gepubliceerde moment)
  - `start(p: { datum: Date; contractId?: ContractId; aannemerId?: AannemerId }): void` → event `onderhoud.onderhoud.gestart`
  - `registreerInspectie(p: { id: InspectieId; datum: Date; oordeel: InspectieOordeel; opmerkingen?: string }): void`
  - `rondAf(p: { resultaat: string; datum: Date }): void` → event `onderhoud.onderhoud.afgerond`
  - `ontvangFactuur(p: { id: FactuurId; bedrag: Bedrag; ontvangenOp: Date }): void`
  - `keurFactuurGoed(factuurId: FactuurId): void`
  - getters: `id`, `kunstwerkId`, `status`, `aanleiding`, `contractId: ContractId | undefined`, `aannemerId: AannemerId | undefined`, `gestartOp: Date | undefined`, `afgerondOp: Date | undefined`, `resultaat: string | undefined`, `inspecties: readonly Inspectie[]`, `facturen: readonly Factuur[]`.
  - `static herstel(p): Onderhoud`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/domain/onderhoud.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Onderhoud } from '../../src/domain/onderhoud/onderhoud.js';
import { Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

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

Run: `npm test -- onderhoud.test`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer `onderhoud.ts`**

`onderhoud/src/domain/onderhoud/onderhoud.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import type { AannemerId, Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../gedeeld/waarden.js';
import type { Diagnose } from '../diagnose/diagnose.js';

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

Run: `npm test -- onderhoud.test`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add onderhoud/src/domain/onderhoud onderhoud/test/domain/onderhoud.test.ts
git commit -m "feat(onderhoud): Onderhoud-aggregate met inspectie- en factuurinvarianten"
```

---

### Task 8: Domein — OnderhoudsSchema-aggregate + repository-interfaces

Het schema met de gegunde aannemer, plus de repository-interfaces van alle drie de aggregates (contracten horen in `domain`, implementaties in `infrastructure`).

**Files:**
- Create: `onderhoud/src/domain/schema/onderhouds-schema.ts`
- Create: `onderhoud/src/domain/repositories.ts`
- Test: `onderhoud/test/domain/onderhouds-schema.test.ts`

**Interfaces:**
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5), `Storing` (Task 6), `Onderhoud` (Task 7).
- Produces: `interface GeplandMoment { datum: Date; omschrijving: string }`.
- Produces: `class OnderhoudsSchema extends AggregateRoot` met:
  - `static maak(p: { id: SchemaId; kunstwerkId: KunstwerkId; contractId: ContractId; aannemer: string; periode: Periode; momenten: GeplandMoment[] }): OnderhoudsSchema`
  - `voegMomentToe(m: GeplandMoment): void`
  - getters: `id`, `kunstwerkId`, `contractId`, `aannemer`, `periode`, `momenten: readonly GeplandMoment[]`.
  - `static herstel(p): OnderhoudsSchema`.
- Produces (repository-interfaces):
  - `interface StoringRepository { bewaar(s: Storing): Promise<void>; zoek(id: StoringId): Promise<Storing | null>; zoekAlle(): Promise<Storing[]> }`
  - `interface OnderhoudRepository { bewaar(o: Onderhoud): Promise<void>; zoek(id: OnderhoudId): Promise<Onderhoud | null>; zoekAlle(): Promise<Onderhoud[]>; zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> }`
  - `interface SchemaRepository { bewaar(s: OnderhoudsSchema): Promise<void>; zoek(id: SchemaId): Promise<OnderhoudsSchema | null>; zoekAlle(): Promise<OnderhoudsSchema[]> }`

- [ ] **Step 1: Write the failing test**

`onderhoud/test/domain/onderhouds-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema.js';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

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
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import type { ContractId, KunstwerkId, Periode, SchemaId } from '../gedeeld/waarden.js';

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
import type { Storing } from './storing/storing.js';
import type { Onderhoud } from './onderhoud/onderhoud.js';
import type { OnderhoudsSchema } from './schema/onderhouds-schema.js';
import type { KunstwerkId, OnderhoudId, SchemaId, StoringId } from './gedeeld/waarden.js';

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
git add onderhoud/src/domain/schema onderhoud/src/domain/repositories.ts onderhoud/test/domain/onderhouds-schema.test.ts
git commit -m "feat(onderhoud): OnderhoudsSchema-aggregate en repository-interfaces"
```

---

### Task 9: Application — ports, fakes & instap-use-cases (MeldStoring + StelDiagnose)

De twee instappunten uit de README. `MeldStoring` plant bij ernst Hoog/Kritiek automatisch een onderhoudstraject en koppelt de storing; `StelDiagnose` doet hetzelfde op basis van monitoringdata (incident).

**Files:**
- Create: `onderhoud/src/application/ports.ts`
- Create: `onderhoud/src/application/storing/meld-storing.ts`
- Create: `onderhoud/src/application/diagnose/stel-diagnose.ts`
- Create: `onderhoud/test/support/fakes.ts`
- Test: `onderhoud/test/application/instap-usecases.test.ts`

**Interfaces:**
- Consumes: repository-interfaces (Task 8), aggregates (Tasks 6-8), `vereistOnderhoud` (Task 6).
- Produces (ports, aanvullend op de domain-repos):
  - `interface EventPublisher { publiceer(events: OnderhoudDomainEvent[]): Promise<void> }`
  - `interface KunstwerkenReadModel { isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> }`
  - `interface ContractenReadModel { geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null> }`
  - `interface IdGenerator { nieuw(): string }`
- Produces (use cases):
  - `class MeldStoring { constructor(storingen: StoringRepository, onderhouden: OnderhoudRepository, publisher: EventPublisher, kunstwerken: KunstwerkenReadModel, ids: IdGenerator, validatie: 'soepel' | 'streng'); uitvoeren(cmd: { kunstwerkId: string; omschrijving: string; ernst: string }): Promise<{ storingId: string; onderhoudId?: string }> }`
  - `class StelDiagnose { constructor(onderhouden: OnderhoudRepository, ids: IdGenerator); uitvoeren(cmd: { kunstwerkId: string; incidentId?: string; bevinding: string; ernst: string }): Promise<{ onderhoudId: string | null }> }`
- Produces (test-fakes): `InMemoryStoringRepository`, `InMemoryOnderhoudRepository`, `InMemorySchemaRepository`, `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `FakeContractenReadModel`, `VasteIdGenerator`.

- [ ] **Step 1: Ports definiëren**

`onderhoud/src/application/ports.ts`:
```ts
import type { KunstwerkId } from '../domain/gedeeld/waarden.js';
import type { OnderhoudDomainEvent } from '../domain/gedeeld/domain-events.js';

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
import type { OnderhoudRepository, SchemaRepository, StoringRepository } from '../../src/domain/repositories.js';
import type { ContractenReadModel, EventPublisher, IdGenerator, KunstwerkenReadModel } from '../../src/application/ports.js';
import type { Storing } from '../../src/domain/storing/storing.js';
import type { Onderhoud } from '../../src/domain/onderhoud/onderhoud.js';
import type { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema.js';
import type { KunstwerkId, OnderhoudId, SchemaId, StoringId } from '../../src/domain/gedeeld/waarden.js';
import type { OnderhoudDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

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

`onderhoud/test/application/instap-usecases.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { MeldStoring } from '../../src/application/storing/meld-storing.js';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose.js';
import {
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes.js';

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
import { Storing } from '../../domain/storing/storing.js';
import { Onderhoud } from '../../domain/onderhoud/onderhoud.js';
import { vereistOnderhoud } from '../../domain/diagnose/diagnose.js';
import { ernstVan, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { OnderhoudRepository, StoringRepository } from '../../domain/repositories.js';
import type { EventPublisher, IdGenerator, KunstwerkenReadModel } from '../ports.js';

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
import { Onderhoud } from '../../domain/onderhoud/onderhoud.js';
import { vereistOnderhoud } from '../../domain/diagnose/diagnose.js';
import { ernstVan, IncidentId, KunstwerkId, OnderhoudId } from '../../domain/gedeeld/waarden.js';
import type { OnderhoudRepository } from '../../domain/repositories.js';
import type { IdGenerator } from '../ports.js';

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
git add onderhoud/src/application onderhoud/test/support/fakes.ts onderhoud/test/application/instap-usecases.test.ts
git commit -m "feat(onderhoud): application-ports, fakes en instap-use-cases"
```

---

### Task 10: Application — traject-use-cases, schema & contractaanvraag

De rest van de use cases: traject sturen (`StartOnderhoud`/`RegistreerInspectie`/`RondOnderhoudAf`), factuurafhandeling, `MaakSchema` en `DienContractaanvraagIn`. Queries lopen in Fase 1 rechtstreeks via de repositories (net als bij Contract).

**Files:**
- Create: `onderhoud/src/application/onderhoud/start-onderhoud.ts`
- Create: `onderhoud/src/application/onderhoud/registreer-inspectie.ts`
- Create: `onderhoud/src/application/onderhoud/rond-onderhoud-af.ts`
- Create: `onderhoud/src/application/onderhoud/ontvang-factuur.ts`
- Create: `onderhoud/src/application/onderhoud/keur-factuur-goed.ts`
- Create: `onderhoud/src/application/schema/maak-schema.ts`
- Create: `onderhoud/src/application/contractaanvraag/dien-contractaanvraag-in.ts`
- Test: `onderhoud/test/application/traject-usecases.test.ts`

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

`onderhoud/test/application/traject-usecases.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose.js';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud.js';
import { RegistreerInspectie } from '../../src/application/onderhoud/registreer-inspectie.js';
import { RondOnderhoudAf } from '../../src/application/onderhoud/rond-onderhoud-af.js';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur.js';
import { KeurFactuurGoed } from '../../src/application/onderhoud/keur-factuur-goed.js';
import { MaakSchema } from '../../src/application/schema/maak-schema.js';
import { DienContractaanvraagIn } from '../../src/application/contractaanvraag/dien-contractaanvraag-in.js';
import { MeldStoring } from '../../src/application/storing/meld-storing.js';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemorySchemaRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes.js';

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
import { ContractId, OnderhoudId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { OnderhoudRepository } from '../../domain/repositories.js';
import type { ContractenReadModel, EventPublisher } from '../ports.js';

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
import { InspectieId, OnderhoudId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { InspectieOordeel } from '../../domain/onderhoud/onderhoud.js';
import type { OnderhoudRepository } from '../../domain/repositories.js';
import type { IdGenerator } from '../ports.js';

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
import { OnderhoudId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { OnderhoudRepository, StoringRepository } from '../../domain/repositories.js';
import type { EventPublisher } from '../ports.js';

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
import { Bedrag, FactuurId, OnderhoudId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { OnderhoudRepository } from '../../domain/repositories.js';
import type { IdGenerator } from '../ports.js';

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
import { FactuurId, OnderhoudId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { OnderhoudRepository } from '../../domain/repositories.js';

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
import { OnderhoudsSchema } from '../../domain/schema/onderhouds-schema.js';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { SchemaRepository } from '../../domain/repositories.js';
import type { ContractenReadModel, IdGenerator } from '../ports.js';

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
import { KunstwerkId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher } from '../ports.js';

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
git add onderhoud/src/application onderhoud/test/application/traject-usecases.test.ts
git commit -m "feat(onderhoud): traject-, schema- en contractaanvraag-use-cases"
```

---

### Task 11: Infrastructure — Prisma-domeintabellen + repo-implementaties

Persistente opslag voor de drie aggregates. Repos vertalen tussen Prisma-rijen en domeinobjecten via de `herstel`-fabrieken; domeinobjecten blijven Prisma-vrij.

**Files:**
- Modify: `onderhoud/prisma/schema.prisma` (domeintabellen toevoegen)
- Create: `onderhoud/src/infrastructure/db/prisma-storing-repository.ts`
- Create: `onderhoud/src/infrastructure/db/prisma-onderhoud-repository.ts`
- Create: `onderhoud/src/infrastructure/db/prisma-schema-repository.ts`
- Test: `onderhoud/test/infrastructure/prisma-mapping.test.ts`

**Interfaces:**
- Consumes: repository-interfaces (Task 8), aggregates (Tasks 6-8), `maakPrismaClient` (Task 2).
- Produces: `PrismaStoringRepository`, `PrismaOnderhoudRepository`, `PrismaSchemaRepository` (implementeren de domain-interfaces) plus pure mappers `storingNaarRij`/`rijNaarStoring`, `onderhoudNaarRij`/`rijNaarOnderhoud`, `schemaNaarRij`/`rijNaarSchema` (los getest, zonder DB).

- [ ] **Step 1: Domeintabellen toevoegen aan `schema.prisma`**

Voeg toe onder de bestaande modellen in `onderhoud/prisma/schema.prisma`:
```prisma
model Storing {
  storingId    String  @id
  kunstwerkId  String
  omschrijving String
  ernst        String
  status       String
  onderhoudId  String?

  @@index([kunstwerkId])
}

model Onderhoud {
  onderhoudId    String      @id
  kunstwerkId    String
  status         String
  aanleidingSoort String
  storingId      String?
  incidentId     String?
  bevinding      String?
  ernst          String?
  contractId     String?
  aannemerId     String?
  gestartOp      DateTime?
  afgerondOp     DateTime?
  resultaat      String?
  inspecties     Inspectie[]
  facturen       Factuur[]

  @@index([kunstwerkId])
}

model Inspectie {
  inspectieId String    @id
  onderhoudId String
  datum       DateTime
  oordeel     String
  opmerkingen String?
  onderhoud   Onderhoud @relation(fields: [onderhoudId], references: [onderhoudId])
}

model Factuur {
  factuurId    String    @id
  onderhoudId  String
  bedragCenten Int
  valuta       String    @default("EUR")
  status       String
  ontvangenOp  DateTime
  onderhoud    Onderhoud @relation(fields: [onderhoudId], references: [onderhoudId])
}

model OnderhoudsSchema {
  schemaId      String   @id
  kunstwerkId   String
  contractId    String
  aannemer      String
  periodeStart  DateTime
  periodeEind   DateTime
  momenten      Json

  @@index([kunstwerkId])
}
```

Run (in `onderhoud/`): `DATABASE_URL=postgres://rws:rws@localhost:5432/onderhoud_db npx prisma migrate dev --name domeintabellen`
Expected: migratie aangemaakt; `npx prisma generate` draait mee.

- [ ] **Step 2: Write the failing test (pure mappers)**

`onderhoud/test/infrastructure/prisma-mapping.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rijNaarStoring, storingNaarRij } from '../../src/infrastructure/db/prisma-storing-repository.js';
import { onderhoudNaarRij, rijNaarOnderhoud } from '../../src/infrastructure/db/prisma-onderhoud-repository.js';
import { rijNaarSchema, schemaNaarRij } from '../../src/infrastructure/db/prisma-schema-repository.js';
import { Storing } from '../../src/domain/storing/storing.js';
import { Onderhoud } from '../../src/domain/onderhoud/onderhoud.js';
import { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema.js';
import { Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, Periode, SchemaId, StoringId } from '../../src/domain/gedeeld/waarden.js';

describe('prisma-mapping', () => {
  it('mapt een Storing heen en terug', () => {
    const storing = Storing.meld({ id: StoringId.van('S1'), kunstwerkId: KunstwerkId.van('KW1'), omschrijving: 'scheur', ernst: 'Hoog' });
    storing.koppelAanOnderhoud(OnderhoudId.van('O1'));
    const terug = rijNaarStoring(storingNaarRij(storing));
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
    const terug = rijNaarOnderhoud(onderhoudNaarRij(traject));
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
    const terug = rijNaarSchema(schemaNaarRij(schema));
    expect(terug.aannemer).toBe('BAM');
    expect(terug.momenten[0].omschrijving).toBe('smeren');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- prisma-mapping`
Expected: FAIL — modules ontbreken.

- [ ] **Step 4: Implementeer `prisma-storing-repository.ts`**

`onderhoud/src/infrastructure/db/prisma-storing-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import { Storing, type StoringStatus } from '../../domain/storing/storing.js';
import { ernstVan, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden.js';
import type { StoringRepository } from '../../domain/repositories.js';

export interface StoringRij {
  storingId: string;
  kunstwerkId: string;
  omschrijving: string;
  ernst: string;
  status: string;
  onderhoudId: string | null;
}

export function storingNaarRij(s: Storing): StoringRij {
  return {
    storingId: s.id.waarde,
    kunstwerkId: s.kunstwerkId.waarde,
    omschrijving: s.omschrijving,
    ernst: s.ernst,
    status: s.status,
    onderhoudId: s.onderhoudId?.waarde ?? null,
  };
}

export function rijNaarStoring(rij: StoringRij): Storing {
  return Storing.herstel({
    id: StoringId.van(rij.storingId),
    kunstwerkId: KunstwerkId.van(rij.kunstwerkId),
    omschrijving: rij.omschrijving,
    ernst: ernstVan(rij.ernst),
    status: rij.status as StoringStatus,
    onderhoudId: rij.onderhoudId ? OnderhoudId.van(rij.onderhoudId) : undefined,
  });
}

export class PrismaStoringRepository implements StoringRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(s: Storing): Promise<void> {
    const rij = storingNaarRij(s);
    await this.prisma.storing.upsert({ where: { storingId: rij.storingId }, create: rij, update: rij });
  }

  async zoek(id: StoringId): Promise<Storing | null> {
    const rij = await this.prisma.storing.findUnique({ where: { storingId: id.waarde } });
    return rij ? rijNaarStoring(rij) : null;
  }

  async zoekAlle(): Promise<Storing[]> {
    return (await this.prisma.storing.findMany()).map(rijNaarStoring);
  }
}
```

- [ ] **Step 5: Implementeer `prisma-onderhoud-repository.ts`**

`onderhoud/src/infrastructure/db/prisma-onderhoud-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import { Onderhoud, type Aanleiding, type FactuurStatus, type InspectieOordeel, type OnderhoudStatus } from '../../domain/onderhoud/onderhoud.js';
import { Bedrag, ContractId, ernstVan, FactuurId, IncidentId, InspectieId, KunstwerkId, OnderhoudId, StoringId, type AannemerId } from '../../domain/gedeeld/waarden.js';
import { AannemerId as AannemerIdKlasse } from '../../domain/gedeeld/waarden.js';
import type { OnderhoudRepository } from '../../domain/repositories.js';

export interface OnderhoudRij {
  onderhoudId: string;
  kunstwerkId: string;
  status: string;
  aanleidingSoort: string;
  storingId: string | null;
  incidentId: string | null;
  bevinding: string | null;
  ernst: string | null;
  contractId: string | null;
  aannemerId: string | null;
  gestartOp: Date | null;
  afgerondOp: Date | null;
  resultaat: string | null;
  inspecties: Array<{ inspectieId: string; datum: Date; oordeel: string; opmerkingen: string | null }>;
  facturen: Array<{ factuurId: string; bedragCenten: number; valuta: string; status: string; ontvangenOp: Date }>;
}

export function onderhoudNaarRij(o: Onderhoud): OnderhoudRij {
  const aanleiding = o.aanleiding;
  return {
    onderhoudId: o.id.waarde,
    kunstwerkId: o.kunstwerkId.waarde,
    status: o.status,
    aanleidingSoort: aanleiding.soort,
    storingId: aanleiding.soort === 'Storing' ? aanleiding.storingId.waarde : null,
    incidentId: aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.incidentId?.waarde ?? null : null,
    bevinding: aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.bevinding : null,
    ernst: aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.ernst : null,
    contractId: o.contractId?.waarde ?? null,
    aannemerId: o.aannemerId?.waarde ?? null,
    gestartOp: o.gestartOp ?? null,
    afgerondOp: o.afgerondOp ?? null,
    resultaat: o.resultaat ?? null,
    inspecties: o.inspecties.map((i) => ({ inspectieId: i.id.waarde, datum: i.datum, oordeel: i.oordeel, opmerkingen: i.opmerkingen ?? null })),
    facturen: o.facturen.map((f) => ({ factuurId: f.id.waarde, bedragCenten: f.bedrag.centen, valuta: f.bedrag.valuta, status: f.status, ontvangenOp: f.ontvangenOp })),
  };
}

export function rijNaarOnderhoud(rij: OnderhoudRij): Onderhoud {
  const aanleiding: Aanleiding =
    rij.aanleidingSoort === 'Storing'
      ? { soort: 'Storing', storingId: StoringId.van(rij.storingId ?? '') }
      : {
          soort: 'Diagnose',
          diagnose: {
            incidentId: rij.incidentId ? IncidentId.van(rij.incidentId) : undefined,
            bevinding: rij.bevinding ?? '',
            ernst: ernstVan(rij.ernst ?? 'Laag'),
          },
        };
  return Onderhoud.herstel({
    id: OnderhoudId.van(rij.onderhoudId),
    kunstwerkId: KunstwerkId.van(rij.kunstwerkId),
    aanleiding,
    status: rij.status as OnderhoudStatus,
    contractId: rij.contractId ? ContractId.van(rij.contractId) : undefined,
    aannemerId: rij.aannemerId ? (AannemerIdKlasse.van(rij.aannemerId) as AannemerId) : undefined,
    gestartOp: rij.gestartOp ?? undefined,
    afgerondOp: rij.afgerondOp ?? undefined,
    resultaat: rij.resultaat ?? undefined,
    inspecties: rij.inspecties.map((i) => ({ id: InspectieId.van(i.inspectieId), datum: i.datum, oordeel: i.oordeel as InspectieOordeel, opmerkingen: i.opmerkingen ?? undefined })),
    facturen: rij.facturen.map((f) => ({ id: FactuurId.van(f.factuurId), bedrag: Bedrag.vanCenten(f.bedragCenten, f.valuta), status: f.status as FactuurStatus, ontvangenOp: f.ontvangenOp })),
  });
}

export class PrismaOnderhoudRepository implements OnderhoudRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(o: Onderhoud): Promise<void> {
    const rij = onderhoudNaarRij(o);
    const { inspecties, facturen, ...kop } = rij;
    await this.prisma.$transaction([
      this.prisma.onderhoud.upsert({ where: { onderhoudId: kop.onderhoudId }, create: kop, update: kop }),
      ...inspecties.map((i) =>
        this.prisma.inspectie.upsert({
          where: { inspectieId: i.inspectieId },
          create: { ...i, onderhoudId: kop.onderhoudId },
          update: { ...i, onderhoudId: kop.onderhoudId },
        }),
      ),
      ...facturen.map((f) =>
        this.prisma.factuur.upsert({
          where: { factuurId: f.factuurId },
          create: { ...f, onderhoudId: kop.onderhoudId },
          update: { ...f, onderhoudId: kop.onderhoudId },
        }),
      ),
    ]);
  }

  async zoek(id: OnderhoudId): Promise<Onderhoud | null> {
    const rij = await this.prisma.onderhoud.findUnique({
      where: { onderhoudId: id.waarde },
      include: { inspecties: true, facturen: true },
    });
    return rij ? rijNaarOnderhoud(rij) : null;
  }

  async zoekAlle(): Promise<Onderhoud[]> {
    const rijen = await this.prisma.onderhoud.findMany({ include: { inspecties: true, facturen: true } });
    return rijen.map(rijNaarOnderhoud);
  }

  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> {
    const rijen = await this.prisma.onderhoud.findMany({
      where: { kunstwerkId: kunstwerkId.waarde },
      include: { inspecties: true, facturen: true },
    });
    return rijen.map(rijNaarOnderhoud);
  }
}
```

- [ ] **Step 6: Implementeer `prisma-schema-repository.ts`**

`onderhoud/src/infrastructure/db/prisma-schema-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import { OnderhoudsSchema } from '../../domain/schema/onderhouds-schema.js';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../domain/gedeeld/waarden.js';
import type { SchemaRepository } from '../../domain/repositories.js';

export interface SchemaRij {
  schemaId: string;
  kunstwerkId: string;
  contractId: string;
  aannemer: string;
  periodeStart: Date;
  periodeEind: Date;
  momenten: Array<{ datum: string; omschrijving: string }>;
}

export function schemaNaarRij(s: OnderhoudsSchema): SchemaRij {
  return {
    schemaId: s.id.waarde,
    kunstwerkId: s.kunstwerkId.waarde,
    contractId: s.contractId.waarde,
    aannemer: s.aannemer,
    periodeStart: s.periode.start,
    periodeEind: s.periode.eind,
    momenten: s.momenten.map((m) => ({ datum: m.datum.toISOString(), omschrijving: m.omschrijving })),
  };
}

export function rijNaarSchema(rij: SchemaRij): OnderhoudsSchema {
  return OnderhoudsSchema.herstel({
    id: SchemaId.van(rij.schemaId),
    kunstwerkId: KunstwerkId.van(rij.kunstwerkId),
    contractId: ContractId.van(rij.contractId),
    aannemer: rij.aannemer,
    periode: Periode.van(rij.periodeStart, rij.periodeEind),
    momenten: rij.momenten.map((m) => ({ datum: new Date(m.datum), omschrijving: m.omschrijving })),
  });
}

export class PrismaSchemaRepository implements SchemaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(s: OnderhoudsSchema): Promise<void> {
    const rij = schemaNaarRij(s);
    const data = { ...rij, momenten: rij.momenten as unknown as object };
    await this.prisma.onderhoudsSchema.upsert({ where: { schemaId: rij.schemaId }, create: data, update: data });
  }

  async zoek(id: SchemaId): Promise<OnderhoudsSchema | null> {
    const rij = await this.prisma.onderhoudsSchema.findUnique({ where: { schemaId: id.waarde } });
    return rij ? rijNaarSchema({ ...rij, momenten: rij.momenten as SchemaRij['momenten'] }) : null;
  }

  async zoekAlle(): Promise<OnderhoudsSchema[]> {
    const rijen = await this.prisma.onderhoudsSchema.findMany();
    return rijen.map((rij) => rijNaarSchema({ ...rij, momenten: rij.momenten as SchemaRij['momenten'] }));
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- prisma-mapping`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add onderhoud/prisma onderhoud/src/infrastructure/db onderhoud/test/infrastructure/prisma-mapping.test.ts
git commit -m "feat(onderhoud): Prisma-domeintabellen en repo-implementaties"
```

---

### Task 12: Infrastructure — RabbitMQ EventPublisher (envelope)

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/rabbitmq-event-publisher.ts`
- Test: `onderhoud/test/infrastructure/rabbitmq-event-publisher.test.ts`

**Interfaces:**
- Consumes: `EventPublisher` (Task 9), `OnderhoudDomainEvent` (Task 5), `RWS_EXCHANGE` (Task 3).
- Produces: `class RabbitMqEventPublisher implements EventPublisher` — constructor `(kanaal: KanaalPublish, idGenerator?: () => string, klok?: () => Date)`, waarbij `interface KanaalPublish { publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean }`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/infrastructure/rabbitmq-event-publisher.test.ts`:
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
import type { EventPublisher } from '../../application/ports.js';
import type { OnderhoudDomainEvent } from '../../domain/gedeeld/domain-events.js';
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
git add onderhoud/src/infrastructure/messaging/rabbitmq-event-publisher.ts onderhoud/test/infrastructure/rabbitmq-event-publisher.test.ts
git commit -m "feat(onderhoud): RabbitMQ EventPublisher met vaste envelope"
```

---

### Task 13: Infrastructure — idempotente consumers (Monitoring, Contract, Beheer) + read-models

Drie consumers, elk met eigen durable queue op `rws.events`. Vertaling van envelope naar use-case/read-model gebeurt hier — de envelope komt niet voorbij deze laag. Dedupe op `eventId` via één gedeelde `PrismaEventDedup`.

**Files:**
- Create: `onderhoud/src/infrastructure/messaging/consumer-helpers.ts`
- Create: `onderhoud/src/infrastructure/messaging/monitoring-incident-consumer.ts`
- Create: `onderhoud/src/infrastructure/messaging/contract-consumer.ts`
- Create: `onderhoud/src/infrastructure/messaging/beheer-consumer.ts`
- Create: `onderhoud/src/infrastructure/db/prisma-read-models.ts`
- Test: `onderhoud/test/infrastructure/consumers.test.ts`

**Interfaces:**
- Consumes: `StelDiagnose` (Task 9), `KunstwerkenReadModel`/`ContractenReadModel` (Task 9), `RabbitMqConnectie`/`RWS_EXCHANGE` (Task 3).
- Produces (helpers): `interface Envelope { eventId: string; eventType: string; data: Record<string, unknown> }`, `interface EventDedup { isVerwerkt(eventId: string): Promise<boolean>; markeerVerwerkt(eventId: string): Promise<void> }`, `startConsumer(connectie: RabbitMqConnectie, queue: string, bindings: string[], verwerk: (env: Envelope) => Promise<void>): Promise<void>`.
- Produces (verwerkers, elk idempotent via `EventDedup`):
  - `class MonitoringIncidentVerwerker { constructor(stelDiagnose: StelDiagnose, dedup: EventDedup); verwerk(env: Envelope): Promise<void> }` — vertaalt `monitoring.incident.aangemaakt` (`incidentId`, `kunstwerkId`, `ernst`, `omschrijving`) naar `StelDiagnoseCommand`.
  - `class ContractVerwerker { constructor(store: ContractStore, dedup: EventDedup); verwerk(env: Envelope): Promise<void> }` met `interface ContractStore { upsertGegund(p: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijdStart: string | null; looptijdEind: string | null }): Promise<void>; markeerAfgerond(contractId: string): Promise<void> }`.
  - `class BeheerVerwerker { constructor(store: BeheerStore, dedup: EventDedup); verwerk(env: Envelope): Promise<void> }` met `interface BeheerStore { upsertKunstwerk(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void>; markeerBuitenGebruik(kunstwerkId: string): Promise<void>; bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void> }`.
- Produces (Prisma): `class PrismaEventDedup implements EventDedup`, `class PrismaKunstwerkenReadModel implements KunstwerkenReadModel, BeheerStore`, `class PrismaContractenReadModel implements ContractenReadModel, ContractStore`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/infrastructure/consumers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MonitoringIncidentVerwerker } from '../../src/infrastructure/messaging/monitoring-incident-consumer.js';
import { ContractVerwerker, type ContractStore } from '../../src/infrastructure/messaging/contract-consumer.js';
import { BeheerVerwerker, type BeheerStore } from '../../src/infrastructure/messaging/beheer-consumer.js';
import type { EventDedup } from '../../src/infrastructure/messaging/consumer-helpers.js';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose.js';
import { InMemoryOnderhoudRepository, VasteIdGenerator } from '../support/fakes.js';

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
import type { RabbitMqConnectie } from './rabbitmq-connectie.js';
import { RWS_EXCHANGE } from './rabbitmq-connectie.js';

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
import type { StelDiagnose } from '../../application/diagnose/stel-diagnose.js';
import type { Envelope, EventDedup } from './consumer-helpers.js';

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
import type { Envelope, EventDedup } from './consumer-helpers.js';

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
import type { Envelope, EventDedup } from './consumer-helpers.js';

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

- [ ] **Step 5: Implementeer de Prisma-read-models + dedup**

`onderhoud/src/infrastructure/db/prisma-read-models.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { ContractenReadModel, KunstwerkenReadModel } from '../../application/ports.js';
import type { KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { EventDedup } from '../messaging/consumer-helpers.js';
import type { BeheerStore } from '../messaging/beheer-consumer.js';
import type { ContractStore } from '../messaging/contract-consumer.js';

export class PrismaEventDedup implements EventDedup {
  constructor(private readonly prisma: PrismaClient) {}
  async isVerwerkt(eventId: string): Promise<boolean> {
    return (await this.prisma.verwerktEvent.findUnique({ where: { eventId } })) !== null;
  }
  async markeerVerwerkt(eventId: string): Promise<void> {
    await this.prisma.verwerktEvent.create({ data: { eventId } });
  }
}

export class PrismaKunstwerkenReadModel implements KunstwerkenReadModel, BeheerStore {
  constructor(private readonly prisma: PrismaClient) {}

  async isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> {
    const rij = await this.prisma.bekendKunstwerk.findUnique({ where: { kunstwerkId: id.waarde } });
    return rij?.inGebruik ?? false;
  }
  async upsertKunstwerk(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void> {
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
  async bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void> {
    await this.prisma.onderhoudseis.upsert({
      where: { kunstwerkId },
      create: { kunstwerkId, eisen: eisen as object },
      update: { eisen: eisen as object },
    });
  }
}

export class PrismaContractenReadModel implements ContractenReadModel, ContractStore {
  constructor(private readonly prisma: PrismaClient) {}

  async geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null> {
    const rij = await this.prisma.geldendContract.findFirst({
      where: { kunstwerkId: id.waarde, actief: true },
      orderBy: { bijgewerktOp: 'desc' },
    });
    return rij ? { contractId: rij.contractId, opdrachtnemer: rij.opdrachtnemer } : null;
  }
  async upsertGegund(p: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijdStart: string | null; looptijdEind: string | null }): Promise<void> {
    const data = {
      kunstwerkId: p.kunstwerkId,
      opdrachtnemer: p.opdrachtnemer,
      looptijdStart: p.looptijdStart ? new Date(p.looptijdStart) : null,
      looptijdEind: p.looptijdEind ? new Date(p.looptijdEind) : null,
      actief: true,
    };
    await this.prisma.geldendContract.upsert({
      where: { contractId: p.contractId },
      create: { contractId: p.contractId, ...data },
      update: data,
    });
  }
  async markeerAfgerond(contractId: string): Promise<void> {
    await this.prisma.geldendContract.updateMany({ where: { contractId }, data: { actief: false } });
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- consumers`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add onderhoud/src/infrastructure/messaging onderhoud/src/infrastructure/db/prisma-read-models.ts onderhoud/test/infrastructure/consumers.test.ts
git commit -m "feat(onderhoud): idempotente consumers voor Monitoring, Contract en Beheer"
```

---

### Task 14: Infrastructure — Anti-Corruption Layer voor externe aannemersfacturen

Externe aannemers sturen facturen in hun eigen formaat. De ACL vertaalt dat formaat naar het interne `OntvangFactuurCommand`; het externe model komt nooit voorbij deze module.

**Files:**
- Create: `onderhoud/src/infrastructure/acl/aannemer-factuur-vertaler.ts`
- Test: `onderhoud/test/infrastructure/aannemer-factuur-vertaler.test.ts`

**Interfaces:**
- Consumes: `OntvangFactuurCommand` (Task 10).
- Produces: `interface ExterneFactuur { invoiceNumber: string; workOrderRef: string; totalExVatCents: number; vatCents: number; currency: string; issuedAt: string }` en `vertaalExterneFactuur(extern: ExterneFactuur): OntvangFactuurCommand` (gooit `AclFout` bij een niet-EUR-valuta of ontbrekende `workOrderRef`).
- Produces: `class AclFout extends Error`.

- [ ] **Step 1: Write the failing test**

`onderhoud/test/infrastructure/aannemer-factuur-vertaler.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AclFout, vertaalExterneFactuur } from '../../src/infrastructure/acl/aannemer-factuur-vertaler.js';

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
import type { OntvangFactuurCommand } from '../../application/onderhoud/ontvang-factuur.js';

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
git add onderhoud/src/infrastructure/acl onderhoud/test/infrastructure/aannemer-factuur-vertaler.test.ts
git commit -m "feat(onderhoud): ACL voor externe aannemersfacturen"
```

---

### Task 15: Interface — storing-, diagnose- en onderhoud-routes

REST-routes voor de instappunten en het traject. DTO-validatie en foutafhandeling horen hier; bedrijfsregels blijven in `domain`. `DomeinFout` → 400, niet gevonden → 404.

**Files:**
- Create: `onderhoud/src/interface/http/fout-afhandeling.ts`
- Create: `onderhoud/src/interface/http/storing-routes.ts`
- Create: `onderhoud/src/interface/http/onderhoud-routes.ts`
- Test: `onderhoud/test/interface/storing-onderhoud-routes.test.ts`

**Interfaces:**
- Consumes: use cases (Tasks 9-10), repos (Task 8), fakes (Task 9), `bouwApp` (Task 1; routes worden in Task 17 aan `bouwApp` gekoppeld — de test bedraadt de routes hier rechtstreeks op een kale Fastify-instantie).
- Produces: `vertaalFout(fout: unknown, reply: FastifyReply): void`.
- Produces: `registreerStoringRoutes(app: FastifyInstance, deps: StoringRouteDeps)` met `interface StoringRouteDeps { meldStoring: MeldStoring; storingen: StoringRepository }` → `POST /api/storingen` (201), `GET /api/storingen` (200).
- Produces: `registreerOnderhoudRoutes(app: FastifyInstance, deps: OnderhoudRouteDeps)` met `interface OnderhoudRouteDeps { stelDiagnose: StelDiagnose; start: StartOnderhoud; inspecteer: RegistreerInspectie; rondAf: RondOnderhoudAf; ontvangFactuur: OntvangFactuur; keurFactuurGoed: KeurFactuurGoed; onderhouden: OnderhoudRepository }` → `POST /api/diagnoses` (201/200), `GET /api/onderhoud`, `GET /api/onderhoud/:id`, `POST /api/onderhoud/:id/start` (200), `POST /api/onderhoud/:id/inspecties` (201), `POST /api/onderhoud/:id/afronden` (200), `POST /api/onderhoud/:id/facturen` (201), `POST /api/onderhoud/:id/facturen/:factuurId/goedkeuring` (200).

- [ ] **Step 1: Write the failing test**

`onderhoud/test/interface/storing-onderhoud-routes.test.ts`:
```ts
import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { registreerStoringRoutes } from '../../src/interface/http/storing-routes.js';
import { registreerOnderhoudRoutes } from '../../src/interface/http/onderhoud-routes.js';
import { MeldStoring } from '../../src/application/storing/meld-storing.js';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose.js';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud.js';
import { RegistreerInspectie } from '../../src/application/onderhoud/registreer-inspectie.js';
import { RondOnderhoudAf } from '../../src/application/onderhoud/rond-onderhoud-af.js';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur.js';
import { KeurFactuurGoed } from '../../src/application/onderhoud/keur-factuur-goed.js';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes.js';

function bouwTestApp() {
  const storingen = new InMemoryStoringRepository();
  const onderhouden = new InMemoryOnderhoudRepository();
  const publisher = new FakeEventPublisher();
  const ids = new VasteIdGenerator('X');
  const app = Fastify();
  registreerStoringRoutes(app, {
    meldStoring: new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(true), ids, 'soepel'),
    storingen,
  });
  registreerOnderhoudRoutes(app, {
    stelDiagnose: new StelDiagnose(onderhouden, ids),
    start: new StartOnderhoud(onderhouden, new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), publisher, 'soepel'),
    inspecteer: new RegistreerInspectie(onderhouden, ids),
    rondAf: new RondOnderhoudAf(onderhouden, storingen, publisher),
    ontvangFactuur: new OntvangFactuur(onderhouden, ids),
    keurFactuurGoed: new KeurFactuurGoed(onderhouden),
    onderhouden,
  });
  return { app, publisher };
}

describe('storing- en onderhoud-routes', () => {
  let app: ReturnType<typeof bouwTestApp>['app'];
  let publisher: FakeEventPublisher;

  beforeEach(() => {
    ({ app, publisher } = bouwTestApp());
  });

  it('meldt een storing via POST /api/storingen', async () => {
    const antwoord = await app.inject({ method: 'POST', url: '/api/storingen', payload: { kunstwerkId: 'KW1', omschrijving: 'scheur in pijler', ernst: 'Hoog' } });
    expect(antwoord.statusCode).toBe(201);
    const body = antwoord.json();
    expect(body.storingId).toBe('X-1');
    expect(body.onderhoudId).toBe('X-2');
    expect((await app.inject({ method: 'GET', url: '/api/storingen' })).json()).toHaveLength(1);
  });

  it('geeft 400 bij een ongeldige ernst', async () => {
    const antwoord = await app.inject({ method: 'POST', url: '/api/storingen', payload: { kunstwerkId: 'KW1', omschrijving: 'x', ernst: 'Enorm' } });
    expect(antwoord.statusCode).toBe(400);
  });

  it('doorloopt de hele trajectflow via de routes', async () => {
    const diagnose = await app.inject({ method: 'POST', url: '/api/diagnoses', payload: { kunstwerkId: 'KW1', incidentId: 'INC1', bevinding: 'trilling', ernst: 'Kritiek' } });
    expect(diagnose.statusCode).toBe(201);
    const { onderhoudId } = diagnose.json();

    expect((await app.inject({ method: 'POST', url: `/api/onderhoud/${onderhoudId}/start`, payload: { datum: '2026-07-01' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/onderhoud/${onderhoudId}/inspecties`, payload: { datum: '2026-07-05', oordeel: 'Goedgekeurd' } })).statusCode).toBe(201);
    const factuur = await app.inject({ method: 'POST', url: `/api/onderhoud/${onderhoudId}/facturen`, payload: { bedragEuro: 2500, ontvangenOp: '2026-07-06' } });
    expect(factuur.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/api/onderhoud/${onderhoudId}/afronden`, payload: { resultaat: 'hersteld', datum: '2026-07-10' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/onderhoud/${onderhoudId}/facturen/${factuur.json().factuurId}/goedkeuring` })).statusCode).toBe(200);

    const detail = await app.inject({ method: 'GET', url: `/api/onderhoud/${onderhoudId}` });
    expect(detail.json().status).toBe('Afgerond');
    expect(publisher.types()).toEqual(expect.arrayContaining(['onderhoud.onderhoud.gestart', 'onderhoud.onderhoud.afgerond']));
  });

  it('geeft 200 zonder traject bij een diagnose onder de drempel', async () => {
    const antwoord = await app.inject({ method: 'POST', url: '/api/diagnoses', payload: { kunstwerkId: 'KW1', bevinding: 'lichte afwijking', ernst: 'Laag' } });
    expect(antwoord.statusCode).toBe(200);
    expect(antwoord.json().onderhoudId).toBeNull();
  });

  it('geeft 404 bij een onbekend traject', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/onderhoud/BESTAAT-NIET' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/onderhoud/BESTAAT-NIET/start', payload: { datum: '2026-07-01' } })).statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- storing-onderhoud-routes`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `fout-afhandeling.ts`**

`onderhoud/src/interface/http/fout-afhandeling.ts`:
```ts
import type { FastifyReply } from 'fastify';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';

export function vertaalFout(fout: unknown, reply: FastifyReply): void {
  if (fout instanceof DomeinFout) {
    const code = fout.message.includes('niet gevonden') ? 404 : 400;
    reply.code(code).send({ fout: fout.message });
    return;
  }
  reply.code(500).send({ fout: 'interne fout' });
}
```

- [ ] **Step 4: Implementeer `storing-routes.ts`**

`onderhoud/src/interface/http/storing-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { MeldStoring } from '../../application/storing/meld-storing.js';
import type { StoringRepository } from '../../domain/repositories.js';
import { vertaalFout } from './fout-afhandeling.js';

export interface StoringRouteDeps {
  meldStoring: MeldStoring;
  storingen: StoringRepository;
}

interface MeldStoringBody {
  kunstwerkId: string;
  omschrijving: string;
  ernst: string;
}

export function registreerStoringRoutes(app: FastifyInstance, deps: StoringRouteDeps): void {
  app.post<{ Body: MeldStoringBody }>('/api/storingen', async (req, reply) => {
    try {
      const uitkomst = await deps.meldStoring.uitvoeren(req.body);
      reply.code(201).send(uitkomst);
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });

  app.get('/api/storingen', async (_req, reply) => {
    const storingen = await deps.storingen.zoekAlle();
    reply.send(storingen.map((s) => ({
      storingId: s.id.waarde,
      kunstwerkId: s.kunstwerkId.waarde,
      omschrijving: s.omschrijving,
      ernst: s.ernst,
      status: s.status,
      onderhoudId: s.onderhoudId?.waarde ?? null,
    })));
  });
}
```

- [ ] **Step 5: Implementeer `onderhoud-routes.ts`**

`onderhoud/src/interface/http/onderhoud-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { StelDiagnose } from '../../application/diagnose/stel-diagnose.js';
import type { StartOnderhoud } from '../../application/onderhoud/start-onderhoud.js';
import type { RegistreerInspectie } from '../../application/onderhoud/registreer-inspectie.js';
import type { RondOnderhoudAf } from '../../application/onderhoud/rond-onderhoud-af.js';
import type { OntvangFactuur } from '../../application/onderhoud/ontvang-factuur.js';
import type { KeurFactuurGoed } from '../../application/onderhoud/keur-factuur-goed.js';
import type { OnderhoudRepository } from '../../domain/repositories.js';
import type { Onderhoud } from '../../domain/onderhoud/onderhoud.js';
import { OnderhoudId } from '../../domain/gedeeld/waarden.js';
import { vertaalFout } from './fout-afhandeling.js';

export interface OnderhoudRouteDeps {
  stelDiagnose: StelDiagnose;
  start: StartOnderhoud;
  inspecteer: RegistreerInspectie;
  rondAf: RondOnderhoudAf;
  ontvangFactuur: OntvangFactuur;
  keurFactuurGoed: KeurFactuurGoed;
  onderhouden: OnderhoudRepository;
}

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

export function registreerOnderhoudRoutes(app: FastifyInstance, deps: OnderhoudRouteDeps): void {
  app.post<{ Body: { kunstwerkId: string; incidentId?: string; bevinding: string; ernst: string } }>('/api/diagnoses', async (req, reply) => {
    try {
      const { onderhoudId } = await deps.stelDiagnose.uitvoeren(req.body);
      reply.code(onderhoudId ? 201 : 200).send({ onderhoudId });
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });

  app.get('/api/onderhoud', async (_req, reply) => {
    const trajecten = await deps.onderhouden.zoekAlle();
    reply.send(trajecten.map(naarDto));
  });

  app.get<{ Params: { id: string } }>('/api/onderhoud/:id', async (req, reply) => {
    const traject = await deps.onderhouden.zoek(OnderhoudId.van(req.params.id));
    if (!traject) {
      reply.code(404).send({ fout: 'onderhoudstraject niet gevonden' });
      return;
    }
    reply.send(naarDto(traject));
  });

  app.post<{ Params: { id: string }; Body: { datum: string } }>('/api/onderhoud/:id/start', async (req, reply) => {
    try {
      await deps.start.uitvoeren({ onderhoudId: req.params.id, datum: req.body.datum });
      reply.code(200).send({ status: 'Gestart' });
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });

  app.post<{ Params: { id: string }; Body: { datum: string; oordeel: 'Goedgekeurd' | 'Afgekeurd'; opmerkingen?: string } }>('/api/onderhoud/:id/inspecties', async (req, reply) => {
    try {
      await deps.inspecteer.uitvoeren({ onderhoudId: req.params.id, ...req.body });
      reply.code(201).send({ status: 'Geregistreerd' });
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });

  app.post<{ Params: { id: string }; Body: { resultaat: string; datum: string } }>('/api/onderhoud/:id/afronden', async (req, reply) => {
    try {
      await deps.rondAf.uitvoeren({ onderhoudId: req.params.id, ...req.body });
      reply.code(200).send({ status: 'Afgerond' });
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });

  app.post<{ Params: { id: string }; Body: { bedragEuro: number; ontvangenOp: string } }>('/api/onderhoud/:id/facturen', async (req, reply) => {
    try {
      const uitkomst = await deps.ontvangFactuur.uitvoeren({ onderhoudId: req.params.id, ...req.body });
      reply.code(201).send(uitkomst);
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });

  app.post<{ Params: { id: string; factuurId: string } }>('/api/onderhoud/:id/facturen/:factuurId/goedkeuring', async (req, reply) => {
    try {
      await deps.keurFactuurGoed.uitvoeren({ onderhoudId: req.params.id, factuurId: req.params.factuurId });
      reply.code(200).send({ status: 'Goedgekeurd' });
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- storing-onderhoud-routes`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add onderhoud/src/interface/http onderhoud/test/interface/storing-onderhoud-routes.test.ts
git commit -m "feat(onderhoud): storing-, diagnose- en onderhoud-routes"
```

---

### Task 16: Interface — schema-, externe-factuur- en contractaanvraag-routes

**Files:**
- Create: `onderhoud/src/interface/http/schema-routes.ts`
- Create: `onderhoud/src/interface/http/extern-routes.ts`
- Test: `onderhoud/test/interface/schema-extern-routes.test.ts`

**Interfaces:**
- Consumes: `MaakSchema`/`DienContractaanvraagIn` (Task 10), `OntvangFactuur` (Task 10), ACL-vertaler (Task 14), repos (Task 8).
- Produces: `registreerSchemaRoutes(app, deps)` met `interface SchemaRouteDeps { maakSchema: MaakSchema; schemas: SchemaRepository }` → `POST /api/schemas` (201), `GET /api/schemas` (200).
- Produces: `registreerExternRoutes(app, deps)` met `interface ExternRouteDeps { ontvangFactuur: OntvangFactuur; dienContractaanvraagIn: DienContractaanvraagIn }` → `POST /api/extern/facturen` (201, extern formaat via ACL; `AclFout` → 422) en `POST /api/contractaanvragen` (202).

- [ ] **Step 1: Write the failing test**

`onderhoud/test/interface/schema-extern-routes.test.ts`:
```ts
import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { registreerSchemaRoutes } from '../../src/interface/http/schema-routes.js';
import { registreerExternRoutes } from '../../src/interface/http/extern-routes.js';
import { MaakSchema } from '../../src/application/schema/maak-schema.js';
import { DienContractaanvraagIn } from '../../src/application/contractaanvraag/dien-contractaanvraag-in.js';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur.js';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose.js';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud.js';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  InMemoryOnderhoudRepository,
  InMemorySchemaRepository,
  VasteIdGenerator,
} from '../support/fakes.js';

describe('schema- en extern-routes', () => {
  let app: ReturnType<typeof Fastify>;
  let publisher: FakeEventPublisher;
  let onderhouden: InMemoryOnderhoudRepository;
  let ids: VasteIdGenerator;

  beforeEach(() => {
    publisher = new FakeEventPublisher();
    onderhouden = new InMemoryOnderhoudRepository();
    ids = new VasteIdGenerator('X');
    app = Fastify();
    registreerSchemaRoutes(app, {
      maakSchema: new MaakSchema(new InMemorySchemaRepository(), new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), ids, 'soepel'),
      schemas: new InMemorySchemaRepository(),
    });
    registreerExternRoutes(app, {
      ontvangFactuur: new OntvangFactuur(onderhouden, ids),
      dienContractaanvraagIn: new DienContractaanvraagIn(publisher),
    });
  });

  it('maakt een schema via POST /api/schemas', async () => {
    const antwoord = await app.inject({
      method: 'POST',
      url: '/api/schemas',
      payload: { kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [{ datum: '2026-03-01', omschrijving: 'smeren' }] },
    });
    expect(antwoord.statusCode).toBe(201);
    expect(antwoord.json().schemaId).toBe('X-1');
  });

  it('geeft 400 bij een schema zonder momenten', async () => {
    const antwoord = await app.inject({
      method: 'POST',
      url: '/api/schemas',
      payload: { kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [] },
    });
    expect(antwoord.statusCode).toBe(400);
  });

  it('ontvangt een externe factuur via de ACL', async () => {
    const { onderhoudId } = await new StelDiagnose(onderhouden, ids).uitvoeren({ kunstwerkId: 'KW1', bevinding: 'trilling', ernst: 'Kritiek' });
    await new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel').uitvoeren({ onderhoudId: onderhoudId!, datum: '2026-07-01' });
    const antwoord = await app.inject({
      method: 'POST',
      url: '/api/extern/facturen',
      payload: { invoiceNumber: 'INV-1', workOrderRef: onderhoudId, totalExVatCents: 200000, vatCents: 42000, currency: 'EUR', issuedAt: '2026-07-06' },
    });
    expect(antwoord.statusCode).toBe(201);
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.facturen[0].bedrag.euro).toBe(2420);
  });

  it('geeft 422 bij een niet-EUR-factuur', async () => {
    const antwoord = await app.inject({
      method: 'POST',
      url: '/api/extern/facturen',
      payload: { invoiceNumber: 'INV-1', workOrderRef: 'O-1', totalExVatCents: 1, vatCents: 0, currency: 'USD', issuedAt: '2026-07-06' },
    });
    expect(antwoord.statusCode).toBe(422);
  });

  it('dient een contractaanvraag in en publiceert het event', async () => {
    const antwoord = await app.inject({
      method: 'POST',
      url: '/api/contractaanvragen',
      payload: { kunstwerkId: 'KW1', aanleiding: 'nieuw onderhoudsregime' },
    });
    expect(antwoord.statusCode).toBe(202);
    expect(publisher.types()).toContain('onderhoud.contractaanvraag.ingediend');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema-extern-routes`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `schema-routes.ts`**

`onderhoud/src/interface/http/schema-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { MaakSchema, MaakSchemaCommand } from '../../application/schema/maak-schema.js';
import type { SchemaRepository } from '../../domain/repositories.js';
import { vertaalFout } from './fout-afhandeling.js';

export interface SchemaRouteDeps {
  maakSchema: MaakSchema;
  schemas: SchemaRepository;
}

export function registreerSchemaRoutes(app: FastifyInstance, deps: SchemaRouteDeps): void {
  app.post<{ Body: MaakSchemaCommand }>('/api/schemas', async (req, reply) => {
    try {
      const uitkomst = await deps.maakSchema.uitvoeren(req.body);
      reply.code(201).send(uitkomst);
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });

  app.get('/api/schemas', async (_req, reply) => {
    const schemas = await deps.schemas.zoekAlle();
    reply.send(schemas.map((s) => ({
      schemaId: s.id.waarde,
      kunstwerkId: s.kunstwerkId.waarde,
      contractId: s.contractId.waarde,
      aannemer: s.aannemer,
      periodeStart: s.periode.start.toISOString(),
      periodeEind: s.periode.eind.toISOString(),
      momenten: s.momenten.map((m) => ({ datum: m.datum.toISOString(), omschrijving: m.omschrijving })),
    })));
  });
}
```

- [ ] **Step 4: Implementeer `extern-routes.ts`**

`onderhoud/src/interface/http/extern-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { OntvangFactuur } from '../../application/onderhoud/ontvang-factuur.js';
import type { DienContractaanvraagIn, DienContractaanvraagInCommand } from '../../application/contractaanvraag/dien-contractaanvraag-in.js';
import { AclFout, vertaalExterneFactuur, type ExterneFactuur } from '../../infrastructure/acl/aannemer-factuur-vertaler.js';
import { vertaalFout } from './fout-afhandeling.js';

export interface ExternRouteDeps {
  ontvangFactuur: OntvangFactuur;
  dienContractaanvraagIn: DienContractaanvraagIn;
}

export function registreerExternRoutes(app: FastifyInstance, deps: ExternRouteDeps): void {
  app.post<{ Body: ExterneFactuur }>('/api/extern/facturen', async (req, reply) => {
    try {
      const command = vertaalExterneFactuur(req.body);
      const uitkomst = await deps.ontvangFactuur.uitvoeren(command);
      reply.code(201).send(uitkomst);
    } catch (fout) {
      if (fout instanceof AclFout) {
        reply.code(422).send({ fout: fout.message });
        return;
      }
      vertaalFout(fout, reply);
    }
  });

  app.post<{ Body: DienContractaanvraagInCommand }>('/api/contractaanvragen', async (req, reply) => {
    try {
      await deps.dienContractaanvraagIn.uitvoeren(req.body);
      reply.code(202).send({ status: 'Ingediend' });
    } catch (fout) {
      vertaalFout(fout, reply);
    }
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- schema-extern-routes`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/interface/http onderhoud/test/interface/schema-extern-routes.test.ts
git commit -m "feat(onderhoud): schema-, externe-factuur- en contractaanvraag-routes"
```

---

### Task 17: Interface — OpenAPI + composition root

Bedraad alles in `main.ts` en registreer OpenAPI. Breid `bouwApp` uit met de echte routes (`bouwApp` wordt hier `async`).

**Files:**
- Modify: `onderhoud/src/interface/http/app.ts`
- Modify: `onderhoud/src/main.ts`
- Create: `onderhoud/src/infrastructure/id-generator.ts`

**Interfaces:**
- Consumes: alle voorgaande taken.
- Produces: `class UuidIdGenerator implements IdGenerator`.
- Produces: uitgebreide `AppDeps` met `storing?: StoringRouteDeps`, `onderhoud?: OnderhoudRouteDeps`, `schema?: SchemaRouteDeps`, `extern?: ExternRouteDeps`.

- [ ] **Step 1: UUID-id-generator**

`onderhoud/src/infrastructure/id-generator.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { IdGenerator } from '../application/ports.js';

export class UuidIdGenerator implements IdGenerator {
  nieuw(): string { return uuid(); }
}
```

- [ ] **Step 2: `app.ts` uitbreiden met routes + OpenAPI**

`onderhoud/src/interface/http/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registreerHealthRoute, type HealthChecks } from './health-route.js';
import { registreerStoringRoutes, type StoringRouteDeps } from './storing-routes.js';
import { registreerOnderhoudRoutes, type OnderhoudRouteDeps } from './onderhoud-routes.js';
import { registreerSchemaRoutes, type SchemaRouteDeps } from './schema-routes.js';
import { registreerExternRoutes, type ExternRouteDeps } from './extern-routes.js';

export interface AppDeps {
  health?: HealthChecks;
  storing?: StoringRouteDeps;
  onderhoud?: OnderhoudRouteDeps;
  schema?: SchemaRouteDeps;
  extern?: ExternRouteDeps;
}

export async function bouwApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(swagger, {
    openapi: { info: { title: 'Onderhoud-service', version: '0.1.0' } },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  registreerHealthRoute(app, deps.health);
  if (deps.storing) registreerStoringRoutes(app, deps.storing);
  if (deps.onderhoud) registreerOnderhoudRoutes(app, deps.onderhoud);
  if (deps.schema) registreerSchemaRoutes(app, deps.schema);
  if (deps.extern) registreerExternRoutes(app, deps.extern);
  return app;
}
```

> **Let op:** `bouwApp` is nu `async`; de aanroep in `main.ts` wordt `await bouwApp(...)`.

- [ ] **Step 3: Composition root in `main.ts`**

`onderhoud/src/main.ts`:
```ts
import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';
import { maakPrismaClient } from './infrastructure/db/prisma-client.js';
import { RabbitMqConnectie } from './infrastructure/messaging/rabbitmq-connectie.js';
import { RabbitMqEventPublisher } from './infrastructure/messaging/rabbitmq-event-publisher.js';
import { PrismaStoringRepository } from './infrastructure/db/prisma-storing-repository.js';
import { PrismaOnderhoudRepository } from './infrastructure/db/prisma-onderhoud-repository.js';
import { PrismaSchemaRepository } from './infrastructure/db/prisma-schema-repository.js';
import { PrismaContractenReadModel, PrismaEventDedup, PrismaKunstwerkenReadModel } from './infrastructure/db/prisma-read-models.js';
import { UuidIdGenerator } from './infrastructure/id-generator.js';
import { startConsumer } from './infrastructure/messaging/consumer-helpers.js';
import { MONITORING_BINDINGS, MONITORING_QUEUE, MonitoringIncidentVerwerker } from './infrastructure/messaging/monitoring-incident-consumer.js';
import { CONTRACT_BINDINGS, CONTRACT_QUEUE, ContractVerwerker } from './infrastructure/messaging/contract-consumer.js';
import { BEHEER_BINDINGS, BEHEER_QUEUE, BeheerVerwerker } from './infrastructure/messaging/beheer-consumer.js';
import { MeldStoring } from './application/storing/meld-storing.js';
import { StelDiagnose } from './application/diagnose/stel-diagnose.js';
import { StartOnderhoud } from './application/onderhoud/start-onderhoud.js';
import { RegistreerInspectie } from './application/onderhoud/registreer-inspectie.js';
import { RondOnderhoudAf } from './application/onderhoud/rond-onderhoud-af.js';
import { OntvangFactuur } from './application/onderhoud/ontvang-factuur.js';
import { KeurFactuurGoed } from './application/onderhoud/keur-factuur-goed.js';
import { MaakSchema } from './application/schema/maak-schema.js';
import { DienContractaanvraagIn } from './application/contractaanvraag/dien-contractaanvraag-in.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const prisma = maakPrismaClient(config.databaseUrl);
  const rabbit = await RabbitMqConnectie.verbind(config.rabbitmqUrl);

  const ids = new UuidIdGenerator();
  const publisher = new RabbitMqEventPublisher(rabbit.kanaal);
  const storingRepo = new PrismaStoringRepository(prisma);
  const onderhoudRepo = new PrismaOnderhoudRepository(prisma);
  const schemaRepo = new PrismaSchemaRepository(prisma);
  const kunstwerken = new PrismaKunstwerkenReadModel(prisma);
  const contracten = new PrismaContractenReadModel(prisma);
  const dedup = new PrismaEventDedup(prisma);

  const stelDiagnose = new StelDiagnose(onderhoudRepo, ids);

  const app = await bouwApp({
    health: {
      db: async () => { await prisma.$queryRaw`SELECT 1`; return true; },
      broker: async () => rabbit.isVerbonden(),
    },
    storing: {
      meldStoring: new MeldStoring(storingRepo, onderhoudRepo, publisher, kunstwerken, ids, config.validatie),
      storingen: storingRepo,
    },
    onderhoud: {
      stelDiagnose,
      start: new StartOnderhoud(onderhoudRepo, contracten, publisher, config.validatie),
      inspecteer: new RegistreerInspectie(onderhoudRepo, ids),
      rondAf: new RondOnderhoudAf(onderhoudRepo, storingRepo, publisher),
      ontvangFactuur: new OntvangFactuur(onderhoudRepo, ids),
      keurFactuurGoed: new KeurFactuurGoed(onderhoudRepo),
      onderhouden: onderhoudRepo,
    },
    schema: {
      maakSchema: new MaakSchema(schemaRepo, contracten, ids, config.validatie),
      schemas: schemaRepo,
    },
    extern: {
      ontvangFactuur: new OntvangFactuur(onderhoudRepo, ids),
      dienContractaanvraagIn: new DienContractaanvraagIn(publisher),
    },
  });

  const monitoringVerwerker = new MonitoringIncidentVerwerker(stelDiagnose, dedup);
  const contractVerwerker = new ContractVerwerker(contracten, dedup);
  const beheerVerwerker = new BeheerVerwerker(kunstwerken, dedup);
  await startConsumer(rabbit, MONITORING_QUEUE, MONITORING_BINDINGS, (env) => monitoringVerwerker.verwerk(env));
  await startConsumer(rabbit, CONTRACT_QUEUE, CONTRACT_BINDINGS, (env) => contractVerwerker.verwerk(env));
  await startConsumer(rabbit, BEHEER_QUEUE, BEHEER_BINDINGS, (env) => beheerVerwerker.verwerk(env));

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

- [ ] **Step 5: Manuele smoke-test**

Run: repo-root `docker compose up -d postgres rabbitmq`; `onderhoud/` `npx prisma migrate deploy` (met lokale `DATABASE_URL`); `npx tsx src/main.ts`.
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
Expected: health 200; POST's 200/201; `GET /api/onderhoud` toont het afgeronde traject. Controleer in de RabbitMQ-UI (`http://localhost:15672`) dat er events op `rws.events` verschenen (bind een tijdelijke queue op `onderhoud.#`) en dat de queues `onderhoud.monitoring-incident`, `onderhoud.contract` en `onderhoud.beheer` bestaan. Open `http://localhost:8003/api/docs` voor de OpenAPI-UI.

- [ ] **Step 6: Commit**

```bash
git add onderhoud/src/interface/http/app.ts onderhoud/src/main.ts onderhoud/src/infrastructure/id-generator.ts
git commit -m "feat(onderhoud): OpenAPI en composition root — service volledig bedraad"
```

---

### Task 18: Docker + docker-compose + eind-verificatie

**Files:**
- Modify: `onderhoud/Dockerfile`
- Modify: `docker-compose.yml` (repo-root)
- Create: `onderhoud/.dockerignore`

**Interfaces:** geen code-interfaces; leveren een draaiende container.

- [ ] **Step 1: Dockerfile (multi-stage Node)**

Vervang de inhoud van `onderhoud/Dockerfile`:
```dockerfile
# Onderhoud-service — Node.js (TypeScript) multi-stage
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
EXPOSE 8003
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

- [ ] **Step 2: `.dockerignore`**

`onderhoud/.dockerignore`:
```
node_modules
dist
.env
test
```

- [ ] **Step 3: Compose-blok activeren**

In `docker-compose.yml` (repo-root): verwijder de `#`-comments van het `onderhoud`-blok, zodat het actief wordt. Laat de andere service-blokken ongemoeid.

- [ ] **Step 4: `.env` aanmaken**

Run (in `onderhoud/`): `cp .env.example .env` (laat de hostnamen op `postgres`/`rabbitmq` staan — binnen compose kloppen die).

- [ ] **Step 5: Eind-verificatie via compose**

Run (repo-root): `docker compose up --build onderhoud postgres rabbitmq`
Verifieer in een tweede shell:
```bash
curl -s localhost:8003/health         # {"status":"ok","db":true,"broker":true}
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

**Spec-dekking:** alle 4 gepubliceerde events (Tasks 6/7/10/12), beide instappunten MeldStoring + StelDiagnose (9), traject met StartOnderhoud/AfrondenOnderhoud (7/10), OnderhoudsSchema met gegunde aannemer (8/10), Inspectie + Factuur (7/10), contractaanvraag naar Contract (10/16), ACL externe aannemers (14/16), idempotente consumers voor `monitoring.incident.aangemaakt` / `contract.onderhoudscontract.gegund` / `beheer.onderhoudseisen.vastgesteld` / `beheer.kunstwerk.*` (13), REST `GET /api/onderhoud` + `POST /api/storingen` uit de README plus traject-/schema-routes (15/16), OpenAPI + health + Docker (17/18). ✔
**Fase-grens:** strenge validatie als default, reageren op `beheer.kunstwerk.buitengebruikgesteld` richting lopende trajecten, AannemerId-registratie met eigen aggregate, herplannen van schema-momenten, Testcontainers en Dokploy zitten bewust **niet** in dit plan (Fase 2). ✔
**Type-consistentie:** `trekEventsLeeg`, `OnderhoudDomainEvent`, `Bedrag.centen/euro`, `ernstVan`, `vereistOnderhoud`, repo-interfaces in `domain/repositories.ts` en de ports in `application/ports.ts` worden vóór gebruik gedefinieerd; route-deps (Task 15/16) matchen de use-case-constructors uit Tasks 9/10. ✔

## Aandachtspunten bij uitvoering

- `bouwApp` wordt in Task 17 `async`; werk de aanroep in `main.ts` bij.
- Prisma-migraties draaien lokaal met `DATABASE_URL` op host `localhost`; in de container gebruikt compose host `postgres`.
- De drie consumers delen één `PrismaEventDedup` (tabel `VerwerktEvent`) — dedupe is dus service-breed op `eventId`.
- `MeldStoring` gebruikt de `IdGenerator` twee keer bij Hoog/Kritiek (storing + traject); de tests rekenen daarop (`X-1`/`X-2`).

