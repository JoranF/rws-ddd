# Contract-service Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouw de Contract bounded context (Fase 1) als zelfstandig draaiende service: twee aggregates (Aanbesteding + Onderhoudscontract), EMVI-gunning, alle 7 gepubliceerde events, REST + OpenAPI, een idempotente Beheer-`kunstwerk.*`-consumer, en Docker.

**Architecture:** Vier lagen met de afhankelijkheidsregel naar binnen (`interface → application → domain`, `infrastructure → domain/application`). `domain` is puur TypeScript; Prisma/Fastify/amqplib leven alleen in `infrastructure`/`interface`. Bouwvolgorde: walking skeleton (server/DB/broker/health) → domein met TDD → applicatie-use-cases met in-memory fakes → infrastructure-implementaties → interface + composition root → Docker.

**Tech Stack:** Node.js 22, TypeScript (ESM), Fastify 5, Prisma 6 (+ PostgreSQL `contract_db`), amqplib (RabbitMQ topic-exchange `rws.events`), Vitest 2, uuid.

## Global Constraints

- Poort **8001** via `SERVICE_PORT`; DB via `DATABASE_URL` (`postgres://rws:rws@postgres:5432/contract_db`); broker via `RABBITMQ_URL` (`amqp://rws:rws@rabbitmq:5672`).
- `GET /health` geeft `200` zodra DB- en broker-connectie er zijn.
- Alle REST onder basispad **`/api`**.
- Events publiceren op durable topic-exchange **`rws.events`**, routing key `contract.<aggregate>.<event>`, met de vaste envelope: `{ eventId (uuid), eventType, occurredAt (ISO-8601 UTC), producer:"contract", version:1, data }`.
- Consumers zijn **idempotent** (dedupe op `eventId`).
- Verwijs naar een kunstwerk via **`kunstwerkId`**; kopieer geen beheer-model. Vertaal inkomende events aan de rand (`infrastructure`) naar domeintaal.
- `domain` importeert **niets** uit `infrastructure`/`interface`/frameworks.
- `KUNSTWERK_VALIDATIE` = `soepel` (default, Fase 1) of `streng` (Fase 2).
- Bedragen als gehele **centen** (integer) om float-fouten te vermijden; valuta `EUR`.
- Werk op branch `contract-service`. Commit na elke taak.

---

### Task 1: Projectscaffold + config + `/health` (static)

Walking-skeleton-start: een Fastify-server die op 8001 draait met een statisch `/health`.

**Files:**
- Create: `contract/package.json`
- Create: `contract/tsconfig.json`
- Create: `contract/vitest.config.ts`
- Create: `contract/.gitignore`
- Create: `contract/src/infrastructure/config.ts`
- Create: `contract/src/interface/http/health-route.ts`
- Create: `contract/src/interface/http/app.ts`
- Create: `contract/src/main.ts`
- Test: `contract/test/infrastructure/config.test.ts`

**Interfaces:**
- Produces: `laadConfig(env: NodeJS.ProcessEnv): Config` waarbij `Config = { poort: number; databaseUrl: string; rabbitmqUrl: string; kunstwerkValidatie: 'soepel' | 'streng' }`.
- Produces: `bouwApp(deps?: AppDeps): FastifyInstance` (in Task 1 zonder deps; uitgebreid in Task 15).

- [ ] **Step 1: Scaffold `package.json`**

```json
{
  "name": "contract-service",
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

`contract/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

`contract/.gitignore`:
```
node_modules/
dist/
.env
```

- [ ] **Step 4: Write the failing test voor config**

`contract/test/infrastructure/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { laadConfig } from '../../src/infrastructure/config.js';

describe('laadConfig', () => {
  const basis = {
    SERVICE_PORT: '8001',
    DATABASE_URL: 'postgres://rws:rws@postgres:5432/contract_db',
    RABBITMQ_URL: 'amqp://rws:rws@rabbitmq:5672',
  };

  it('leest de poort als getal en gebruikt soepele validatie als default', () => {
    const config = laadConfig(basis);
    expect(config.poort).toBe(8001);
    expect(config.kunstwerkValidatie).toBe('soepel');
  });

  it('gooit als een verplichte variabele ontbreekt', () => {
    expect(() => laadConfig({ ...basis, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd contract && npm install && npm test -- config`
Expected: FAIL — `laadConfig` bestaat nog niet.

- [ ] **Step 6: Implementeer `config.ts`**

`contract/src/infrastructure/config.ts`:
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
    poort: Number(env.SERVICE_PORT ?? '8001'),
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

`contract/src/interface/http/health-route.ts`:
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

`contract/src/interface/http/app.ts`:
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

`contract/src/main.ts`:
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

Run: `SERVICE_PORT=8001 DATABASE_URL=x RABBITMQ_URL=x npx tsx src/main.ts` en in een tweede shell `curl -s localhost:8001/health`.
Expected: `{"status":"ok","db":true,"broker":true}` en HTTP 200. Stop de server.

- [ ] **Step 10: Commit**

```bash
git add contract/package.json contract/tsconfig.json contract/vitest.config.ts contract/.gitignore contract/src contract/test
git commit -m "feat(contract): scaffold Fastify-skeleton met config en /health"
```

---

### Task 2: Prisma-bootstrap + DB-health

Verbind met `contract_db` en laat `/health` de DB checken. Schema bevat nu alleen de read-model-tabellen; domeintabellen volgen in Task 10.

**Files:**
- Create: `contract/prisma/schema.prisma`
- Create: `contract/src/infrastructure/db/prisma-client.ts`
- Modify: `contract/src/main.ts`
- Create: `contract/.env.example` (overschrijf bestaande met extra var)

**Interfaces:**
- Consumes: `laadConfig` (Task 1), `registreerHealthRoute`/`AppDeps` (Task 1).
- Produces: `maakPrismaClient(databaseUrl: string): PrismaClient`.

- [ ] **Step 1: Prisma-schema (read-model + idempotentie)**

`contract/prisma/schema.prisma`:
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

`contract/.env.example`:
```
# Contract service — kopieer naar .env
SERVICE_PORT=8001
DATABASE_URL=postgres://rws:rws@postgres:5432/contract_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
KUNSTWERK_VALIDATIE=soepel
```

- [ ] **Step 3: Migratie aanmaken**

Start de gedeelde infra vanuit de repo-root: `docker compose up -d postgres`.
Run (in `contract/`): `DATABASE_URL=postgres://rws:rws@localhost:5432/contract_db npx prisma migrate dev --name init-readmodel`
Expected: migratie `prisma/migrations/*/migration.sql` aangemaakt; tabellen `BekendKunstwerk` + `VerwerktEvent` bestaan.

- [ ] **Step 4: Prisma-clientfabriek**

`contract/src/infrastructure/db/prisma-client.ts`:
```ts
import { PrismaClient } from '@prisma/client';

export function maakPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
```

- [ ] **Step 5: DB-health koppelen in `main.ts`**

Vervang de body van `start()` in `contract/src/main.ts`:
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

Run: `cp .env.example .env` (pas `DATABASE_URL`-host aan naar `localhost` voor lokaal draaien), `npx prisma generate`, `npx tsx src/main.ts`, dan `curl -s localhost:8001/health`.
Expected: `{"status":"ok","db":true,...}`; zet postgres stil → `db:false` en HTTP 503.

- [ ] **Step 7: Commit**

```bash
git add contract/prisma contract/src/infrastructure/db contract/src/main.ts contract/.env.example
git commit -m "feat(contract): Prisma-bootstrap met read-modeltabellen en DB-health"
```

---

### Task 3: RabbitMQ-connectie + broker-health

Bewijs broker-connectiviteit. Nog geen event-mapping (die volgt in Task 11 na de domain-events).

**Files:**
- Create: `contract/src/infrastructure/messaging/rabbitmq-connectie.ts`
- Modify: `contract/src/main.ts`

**Interfaces:**
- Produces: `class RabbitMqConnectie { static async verbind(url: string): Promise<RabbitMqConnectie>; get kanaal(): Channel; isVerbonden(): boolean; async sluit(): Promise<void> }`.

- [ ] **Step 1: Connectiemodule**

`contract/src/infrastructure/messaging/rabbitmq-connectie.ts`:
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

Run: repo-root `docker compose up -d rabbitmq postgres`; dan in `contract/` `npx tsx src/main.ts`; `curl -s localhost:8001/health`.
Expected: `{"status":"ok","db":true,"broker":true}`. Open `http://localhost:15672` (rws/rws) → exchange `rws.events` bestaat (type topic, durable).

- [ ] **Step 4: Commit**

```bash
git add contract/src/infrastructure/messaging contract/src/main.ts
git commit -m "feat(contract): RabbitMQ-connectie en broker-health"
```

---

### Task 4: Domein — value objects

Pure value objects met invarianten. Volledig TDD; geen framework-imports.

**Files:**
- Create: `contract/src/domain/gedeeld/fouten.ts`
- Create: `contract/src/domain/gedeeld/waarden.ts`
- Test: `contract/test/domain/waarden.test.ts`

**Interfaces:**
- Produces: `class DomeinFout extends Error`.
- Produces: `KunstwerkId`, `AanbestedingId`, `ContractId` (elk: `static van(waarde: string)`, `readonly waarde: string`, `gelijkAan(a): boolean`).
- Produces: `class Bedrag { static vanEuro(euro: number, valuta?: string): Bedrag; static vanCenten(centen: number, valuta?: string): Bedrag; readonly centen: number; readonly valuta: string; get euro(): number; plus(b: Bedrag): Bedrag; min(b: Bedrag): Bedrag; isNegatief(): boolean }`.
- Produces: `class Contractperiode { static van(start: Date, eind: Date): Contractperiode; readonly start: Date; readonly eind: Date; bevat(datum: Date): boolean; omvat(andere: Contractperiode): boolean }`.
- Produces: `class Gunningscriteria { static van(prijsgewicht: number, kwaliteitsgewicht: number): Gunningscriteria; readonly prijsgewicht: number; readonly kwaliteitsgewicht: number }`.
- Produces: `class Aannemer { static van(naam: string, identificatie?: string): Aannemer; readonly naam: string; readonly identificatie?: string }`.

- [ ] **Step 1: Write the failing tests**

`contract/test/domain/waarden.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  Aannemer,
  Bedrag,
  Contractperiode,
  Gunningscriteria,
  KunstwerkId,
} from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

describe('KunstwerkId', () => {
  it('weigert een lege waarde', () => {
    expect(() => KunstwerkId.van('')).toThrow(DomeinFout);
  });
  it('is gelijk bij dezelfde waarde', () => {
    expect(KunstwerkId.van('KW-1').gelijkAan(KunstwerkId.van('KW-1'))).toBe(true);
  });
});

describe('Bedrag', () => {
  it('rekent euro naar centen', () => {
    expect(Bedrag.vanEuro(12.5).centen).toBe(1250);
  });
  it('weigert een negatief bedrag', () => {
    expect(() => Bedrag.vanEuro(-1)).toThrow(DomeinFout);
  });
  it('telt op en trekt af', () => {
    expect(Bedrag.vanEuro(10).plus(Bedrag.vanEuro(5)).euro).toBe(15);
    expect(Bedrag.vanEuro(10).min(Bedrag.vanEuro(4)).euro).toBe(6);
  });
  it('weigert aftrekken onder nul', () => {
    expect(() => Bedrag.vanEuro(3).min(Bedrag.vanEuro(4))).toThrow(DomeinFout);
  });
});

describe('Contractperiode', () => {
  it('weigert een eind vóór het begin', () => {
    expect(() => Contractperiode.van(new Date('2026-06-01'), new Date('2026-01-01'))).toThrow(DomeinFout);
  });
  it('bevat een datum binnen de periode en omvat een subperiode', () => {
    const p = Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31'));
    expect(p.bevat(new Date('2026-06-01'))).toBe(true);
    expect(p.omvat(Contractperiode.van(new Date('2026-02-01'), new Date('2026-03-01')))).toBe(true);
    expect(p.omvat(Contractperiode.van(new Date('2025-12-01'), new Date('2026-03-01')))).toBe(false);
  });
});

describe('Gunningscriteria', () => {
  it('eist dat de gewichten samen 100 zijn', () => {
    expect(() => Gunningscriteria.van(60, 30)).toThrow(DomeinFout);
    expect(Gunningscriteria.van(60, 40).prijsgewicht).toBe(60);
  });
});

describe('Aannemer', () => {
  it('weigert een lege naam', () => {
    expect(() => Aannemer.van('')).toThrow(DomeinFout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- waarden`
Expected: FAIL — modules bestaan nog niet.

- [ ] **Step 3: Implementeer `fouten.ts`**

`contract/src/domain/gedeeld/fouten.ts`:
```ts
export class DomeinFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = 'DomeinFout';
  }
}
```

- [ ] **Step 4: Implementeer `waarden.ts`**

`contract/src/domain/gedeeld/waarden.ts`:
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

export class KunstwerkId extends Identiteit {
  static van(waarde: string): KunstwerkId {
    return new KunstwerkId(eisNietLeeg(waarde, 'kunstwerkId'));
  }
}
export class AanbestedingId extends Identiteit {
  static van(waarde: string): AanbestedingId {
    return new AanbestedingId(eisNietLeeg(waarde, 'aanbestedingId'));
  }
}
export class ContractId extends Identiteit {
  static van(waarde: string): ContractId {
    return new ContractId(eisNietLeeg(waarde, 'contractId'));
  }
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
  private zelfdeValuta(b: Bedrag): void {
    if (b.valuta !== this.valuta) throw new DomeinFout('valuta komt niet overeen');
  }
  plus(b: Bedrag): Bedrag {
    this.zelfdeValuta(b);
    return Bedrag.vanCenten(this.centen + b.centen, this.valuta);
  }
  min(b: Bedrag): Bedrag {
    this.zelfdeValuta(b);
    return Bedrag.vanCenten(this.centen - b.centen, this.valuta);
  }
  isNegatief(): boolean {
    return this.centen < 0;
  }
}

export class Contractperiode {
  private constructor(readonly start: Date, readonly eind: Date) {}
  static van(start: Date, eind: Date): Contractperiode {
    if (eind.getTime() <= start.getTime()) throw new DomeinFout('eind moet na start liggen');
    return new Contractperiode(start, eind);
  }
  bevat(datum: Date): boolean {
    return datum.getTime() >= this.start.getTime() && datum.getTime() <= this.eind.getTime();
  }
  omvat(andere: Contractperiode): boolean {
    return this.bevat(andere.start) && this.bevat(andere.eind);
  }
}

export class Gunningscriteria {
  private constructor(readonly prijsgewicht: number, readonly kwaliteitsgewicht: number) {}
  static van(prijsgewicht: number, kwaliteitsgewicht: number): Gunningscriteria {
    if (prijsgewicht < 0 || kwaliteitsgewicht < 0) throw new DomeinFout('gewichten mogen niet negatief zijn');
    if (prijsgewicht + kwaliteitsgewicht !== 100) throw new DomeinFout('gewichten moeten samen 100 zijn');
    return new Gunningscriteria(prijsgewicht, kwaliteitsgewicht);
  }
}

export class Aannemer {
  private constructor(readonly naam: string, readonly identificatie?: string) {}
  static van(naam: string, identificatie?: string): Aannemer {
    return new Aannemer(eisNietLeeg(naam, 'aannemernaam'), identificatie);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- waarden`
Expected: PASS (alle assertions).

- [ ] **Step 6: Commit**

```bash
git add contract/src/domain/gedeeld contract/test/domain/waarden.test.ts
git commit -m "feat(contract): domein-value-objects met invarianten"
```

---

### Task 5: Domein — AggregateRoot + event-definities

Basisklasse voor event-registratie en de discriminated union van alle 7 domain events (payloads = `data`-velden uit `docs/events.md`).

**Files:**
- Create: `contract/src/domain/gedeeld/aggregate-root.ts`
- Create: `contract/src/domain/gedeeld/domain-events.ts`
- Test: `contract/test/domain/aggregate-root.test.ts`

**Interfaces:**
- Produces: `interface DomainEvent { eventType: string; data: Record<string, unknown> }`.
- Produces: `type ContractDomainEvent` — union met `eventType`-waarden: `contract.aanbesteding.gepubliceerd`, `contract.inschrijving.ontvangen`, `contract.aanbesteding.gegund`, `contract.onderhoudscontract.gegund`, `contract.wijziging.goedgekeurd`, `contract.prestatieverklaring.opgesteld`, `contract.onderhoudscontract.afgerond`.
- Produces: `abstract class AggregateRoot { protected registreerEvent(e: ContractDomainEvent): void; trekEventsLeeg(): ContractDomainEvent[] }`.

- [ ] **Step 1: Write the failing test**

`contract/test/domain/aggregate-root.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AggregateRoot } from '../../src/domain/gedeeld/aggregate-root.js';
import type { ContractDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

class Test extends AggregateRoot {
  doe(): void {
    this.registreerEvent({
      eventType: 'contract.aanbesteding.gepubliceerd',
      data: { aanbestedingId: 'A1', kunstwerkId: 'KW1', sluitingsdatum: '2026-09-01', gunningscriteria: { prijsgewicht: 60, kwaliteitsgewicht: 40 } },
    });
  }
}

describe('AggregateRoot', () => {
  it('verzamelt events en trekt ze daarna leeg', () => {
    const t = new Test();
    t.doe();
    const events: ContractDomainEvent[] = t.trekEventsLeeg();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('contract.aanbesteding.gepubliceerd');
    expect(t.trekEventsLeeg()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aggregate-root`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `domain-events.ts`**

`contract/src/domain/gedeeld/domain-events.ts`:
```ts
export interface DomainEvent {
  eventType: string;
  data: Record<string, unknown>;
}

export interface AanbestedingGepubliceerd extends DomainEvent {
  eventType: 'contract.aanbesteding.gepubliceerd';
  data: { aanbestedingId: string; kunstwerkId: string; sluitingsdatum: string; gunningscriteria: { prijsgewicht: number; kwaliteitsgewicht: number } };
}
export interface InschrijvingOntvangen extends DomainEvent {
  eventType: 'contract.inschrijving.ontvangen';
  data: { aanbestedingId: string; aannemer: string; prijs: number; kwaliteitsscore: number };
}
export interface AanbestedingGegund extends DomainEvent {
  eventType: 'contract.aanbesteding.gegund';
  data: { aanbestedingId: string; winnendeAannemer: string; emviScore: number };
}
export interface OnderhoudscontractGegund extends DomainEvent {
  eventType: 'contract.onderhoudscontract.gegund';
  data: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijd: { start: string; eind: string } };
}
export interface WijzigingGoedgekeurd extends DomainEvent {
  eventType: 'contract.wijziging.goedgekeurd';
  data: { contractId: string; bedrag: number; reden: string; datum: string };
}
export interface PrestatieverklaringOpgesteld extends DomainEvent {
  eventType: 'contract.prestatieverklaring.opgesteld';
  data: { contractId: string; periode: { start: string; eind: string }; score: number; bedrag: number };
}
export interface OnderhoudscontractAfgerond extends DomainEvent {
  eventType: 'contract.onderhoudscontract.afgerond';
  data: { contractId: string; kunstwerkId: string; datum: string };
}

export type ContractDomainEvent =
  | AanbestedingGepubliceerd
  | InschrijvingOntvangen
  | AanbestedingGegund
  | OnderhoudscontractGegund
  | WijzigingGoedgekeurd
  | PrestatieverklaringOpgesteld
  | OnderhoudscontractAfgerond;
```

- [ ] **Step 4: Implementeer `aggregate-root.ts`**

`contract/src/domain/gedeeld/aggregate-root.ts`:
```ts
import type { ContractDomainEvent } from './domain-events.js';

export abstract class AggregateRoot {
  private events: ContractDomainEvent[] = [];

  protected registreerEvent(event: ContractDomainEvent): void {
    this.events.push(event);
  }

  trekEventsLeeg(): ContractDomainEvent[] {
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
git add contract/src/domain/gedeeld/aggregate-root.ts contract/src/domain/gedeeld/domain-events.ts contract/test/domain/aggregate-root.test.ts
git commit -m "feat(contract): AggregateRoot en domain-event-definities"
```

---

### Task 6: Domein — Aanbesteding-aggregate + EMVI

**Files:**
- Create: `contract/src/domain/aanbesteding/inschrijving.ts`
- Create: `contract/src/domain/aanbesteding/aanbesteding.ts`
- Test: `contract/test/domain/aanbesteding.test.ts`

**Interfaces:**
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5).
- Produces: `interface Inschrijving { id: string; aannemer: Aannemer; prijs: Bedrag; kwaliteitsscore: number }`.
- Produces: `class Aanbesteding extends AggregateRoot` met:
  - `static publiceer(p: { id: AanbestedingId; kunstwerkId: KunstwerkId; sluitingsdatum: Date; criteria: Gunningscriteria }): Aanbesteding`
  - `ontvangInschrijving(i: Inschrijving): void`
  - `gun(): { winnaar: Aannemer; emviScore: number; winnendePrijs: Bedrag }`
  - getters: `id`, `kunstwerkId`, `status: 'Gepubliceerd' | 'Gegund'`, `inschrijvingen: readonly Inschrijving[]`.
  - `static herstel(p): Aanbesteding` (voor de repo; zonder events).

- [ ] **Step 1: Write the failing test**

`contract/test/domain/aanbesteding.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Aanbesteding } from '../../src/domain/aanbesteding/aanbesteding.js';
import { Aannemer, AanbestedingId, Bedrag, Gunningscriteria, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

function nieuweAanbesteding(): Aanbesteding {
  return Aanbesteding.publiceer({
    id: AanbestedingId.van('A1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    sluitingsdatum: new Date('2026-09-01'),
    criteria: Gunningscriteria.van(60, 40),
  });
}

describe('Aanbesteding', () => {
  it('registreert een gepubliceerd-event bij publiceren', () => {
    const a = nieuweAanbesteding();
    const events = a.trekEventsLeeg();
    expect(events.map((e) => e.eventType)).toContain('contract.aanbesteding.gepubliceerd');
    expect(a.status).toBe('Gepubliceerd');
  });

  it('ontvangt inschrijvingen en registreert een event', () => {
    const a = nieuweAanbesteding();
    a.trekEventsLeeg();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('BAM'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 80 });
    expect(a.inschrijvingen).toHaveLength(1);
    expect(a.trekEventsLeeg()[0].eventType).toBe('contract.inschrijving.ontvangen');
  });

  it('weigert gunnen zonder inschrijvingen', () => {
    const a = nieuweAanbesteding();
    expect(() => a.gun()).toThrow(DomeinFout);
  });

  it('kiest bij gunnen de hoogste EMVI-score (laagste prijs + hoogste kwaliteit)', () => {
    const a = nieuweAanbesteding();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('Duur maar goed'), prijs: Bedrag.vanEuro(2000), kwaliteitsscore: 100 });
    a.ontvangInschrijving({ id: 'I2', aannemer: Aannemer.van('Goedkoop'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 60 });
    // I1: prijsscore=1000/2000=0.5 -> 50*0.6=30 ; kwaliteit 100*0.4=40 -> 70
    // I2: prijsscore=1000/1000=1.0 -> 100*0.6=60 ; kwaliteit 60*0.4=24 -> 84
    const uitslag = a.gun();
    expect(uitslag.winnaar.naam).toBe('Goedkoop');
    expect(uitslag.emviScore).toBeCloseTo(84);
    expect(a.status).toBe('Gegund');
  });

  it('weigert dubbel gunnen', () => {
    const a = nieuweAanbesteding();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('BAM'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 80 });
    a.gun();
    expect(() => a.gun()).toThrow(DomeinFout);
  });

  it('weigert inschrijven na gunnen', () => {
    const a = nieuweAanbesteding();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('BAM'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 80 });
    a.gun();
    expect(() => a.ontvangInschrijving({ id: 'I2', aannemer: Aannemer.van('X'), prijs: Bedrag.vanEuro(900), kwaliteitsscore: 70 })).toThrow(DomeinFout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- aanbesteding`
Expected: FAIL — `Aanbesteding` ontbreekt.

- [ ] **Step 3: Implementeer `inschrijving.ts`**

`contract/src/domain/aanbesteding/inschrijving.ts`:
```ts
import type { Aannemer, Bedrag } from '../gedeeld/waarden.js';

export interface Inschrijving {
  id: string;
  aannemer: Aannemer;
  prijs: Bedrag;
  kwaliteitsscore: number;
}
```

- [ ] **Step 4: Implementeer `aanbesteding.ts`**

`contract/src/domain/aanbesteding/aanbesteding.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import { AanbestedingId, Aannemer, Bedrag, Gunningscriteria, KunstwerkId } from '../gedeeld/waarden.js';
import type { Inschrijving } from './inschrijving.js';

export type AanbestedingStatus = 'Gepubliceerd' | 'Gegund';

interface HerstelData {
  id: AanbestedingId;
  kunstwerkId: KunstwerkId;
  sluitingsdatum: Date;
  criteria: Gunningscriteria;
  status: AanbestedingStatus;
  inschrijvingen: Inschrijving[];
}

export class Aanbesteding extends AggregateRoot {
  private constructor(
    private readonly _id: AanbestedingId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly sluitingsdatum: Date,
    private readonly criteria: Gunningscriteria,
    private _status: AanbestedingStatus,
    private readonly _inschrijvingen: Inschrijving[],
  ) {
    super();
  }

  static publiceer(p: {
    id: AanbestedingId;
    kunstwerkId: KunstwerkId;
    sluitingsdatum: Date;
    criteria: Gunningscriteria;
  }): Aanbesteding {
    const a = new Aanbesteding(p.id, p.kunstwerkId, p.sluitingsdatum, p.criteria, 'Gepubliceerd', []);
    a.registreerEvent({
      eventType: 'contract.aanbesteding.gepubliceerd',
      data: {
        aanbestedingId: p.id.waarde,
        kunstwerkId: p.kunstwerkId.waarde,
        sluitingsdatum: p.sluitingsdatum.toISOString(),
        gunningscriteria: { prijsgewicht: p.criteria.prijsgewicht, kwaliteitsgewicht: p.criteria.kwaliteitsgewicht },
      },
    });
    return a;
  }

  static herstel(d: HerstelData): Aanbesteding {
    return new Aanbesteding(d.id, d.kunstwerkId, d.sluitingsdatum, d.criteria, d.status, d.inschrijvingen);
  }

  get id(): AanbestedingId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get status(): AanbestedingStatus { return this._status; }
  get inschrijvingen(): readonly Inschrijving[] { return this._inschrijvingen; }

  ontvangInschrijving(inschrijving: Inschrijving): void {
    if (this._status !== 'Gepubliceerd') throw new DomeinFout('inschrijven kan alleen bij een gepubliceerde aanbesteding');
    this._inschrijvingen.push(inschrijving);
    this.registreerEvent({
      eventType: 'contract.inschrijving.ontvangen',
      data: {
        aanbestedingId: this._id.waarde,
        aannemer: inschrijving.aannemer.naam,
        prijs: inschrijving.prijs.euro,
        kwaliteitsscore: inschrijving.kwaliteitsscore,
      },
    });
  }

  gun(): { winnaar: Aannemer; emviScore: number; winnendePrijs: Bedrag } {
    if (this._status !== 'Gepubliceerd') throw new DomeinFout('aanbesteding is al gegund');
    if (this._inschrijvingen.length === 0) throw new DomeinFout('gunnen vereist minstens één inschrijving');

    const laagstePrijs = Math.min(...this._inschrijvingen.map((i) => i.prijs.centen));
    const gescoord = this._inschrijvingen.map((i) => ({
      inschrijving: i,
      emvi: this.emviScore(i, laagstePrijs),
    }));
    gescoord.sort((a, b) => b.emvi - a.emvi);
    const winnaar = gescoord[0];

    this._status = 'Gegund';
    this.registreerEvent({
      eventType: 'contract.aanbesteding.gegund',
      data: {
        aanbestedingId: this._id.waarde,
        winnendeAannemer: winnaar.inschrijving.aannemer.naam,
        emviScore: winnaar.emvi,
      },
    });
    return { winnaar: winnaar.inschrijving.aannemer, emviScore: winnaar.emvi, winnendePrijs: winnaar.inschrijving.prijs };
  }

  private emviScore(i: Inschrijving, laagstePrijs: number): number {
    const prijsScore = (laagstePrijs / i.prijs.centen) * 100;
    return (prijsScore * this.criteria.prijsgewicht + i.kwaliteitsscore * this.criteria.kwaliteitsgewicht) / 100;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- aanbesteding`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contract/src/domain/aanbesteding contract/test/domain/aanbesteding.test.ts
git commit -m "feat(contract): Aanbesteding-aggregate met EMVI-gunning"
```

---

### Task 7: Domein — Onderhoudscontract-aggregate

**Files:**
- Create: `contract/src/domain/onderhoudscontract/wijziging.ts`
- Create: `contract/src/domain/onderhoudscontract/prestatieverklaring.ts`
- Create: `contract/src/domain/onderhoudscontract/onderhoudscontract.ts`
- Test: `contract/test/domain/onderhoudscontract.test.ts`

**Interfaces:**
- Consumes: value objects (Task 4), `AggregateRoot` (Task 5).
- Produces: `type WijzigingSoort = 'Verhoging' | 'Verlaging'`; `interface Wijziging { id: string; mutatie: Bedrag; soort: WijzigingSoort; reden: string; datum: Date }`.
- Produces: `interface Prestatieverklaring { id: string; periode: Contractperiode; score: number; bedrag: Bedrag }`.
- Produces: `class Onderhoudscontract extends AggregateRoot` met:
  - `static gun(p: { id: ContractId; kunstwerkId: KunstwerkId; opdrachtnemer: Aannemer; looptijd: Contractperiode; waarde: Bedrag; aanbestedingId?: AanbestedingId }): Onderhoudscontract`
  - `keurWijzigingGoed(p: { id: string; mutatie: Bedrag; soort: WijzigingSoort; reden: string; datum: Date }): void`
  - `stelPrestatieverklaringOp(p: { id: string; periode: Contractperiode; score: number; bedrag: Bedrag }): void`
  - `rondAf(datum: Date): void`
  - getters: `id`, `kunstwerkId`, `status: 'Actief' | 'Afgerond'`, `waarde: Bedrag`.
  - `static herstel(p): Onderhoudscontract`.

- [ ] **Step 1: Write the failing test**

`contract/test/domain/onderhoudscontract.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import { Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

function nieuwContract(): Onderhoudscontract {
  return Onderhoudscontract.gun({
    id: ContractId.van('C1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    opdrachtnemer: Aannemer.van('BAM'),
    looptijd: Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31')),
    waarde: Bedrag.vanEuro(1000),
  });
}

describe('Onderhoudscontract', () => {
  it('registreert gegund-event en staat op Actief', () => {
    const c = nieuwContract();
    expect(c.status).toBe('Actief');
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.onderhoudscontract.gegund');
  });

  it('verhoogt en verlaagt de waarde bij een goedgekeurde wijziging', () => {
    const c = nieuwContract();
    c.trekEventsLeeg();
    c.keurWijzigingGoed({ id: 'W1', mutatie: Bedrag.vanEuro(200), soort: 'Verhoging', reden: 'meerwerk', datum: new Date('2026-03-01') });
    expect(c.waarde.euro).toBe(1200);
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.wijziging.goedgekeurd');
    c.keurWijzigingGoed({ id: 'W2', mutatie: Bedrag.vanEuro(300), soort: 'Verlaging', reden: 'minderwerk', datum: new Date('2026-04-01') });
    expect(c.waarde.euro).toBe(900);
  });

  it('weigert een verlaging onder nul', () => {
    const c = nieuwContract();
    expect(() => c.keurWijzigingGoed({ id: 'W1', mutatie: Bedrag.vanEuro(5000), soort: 'Verlaging', reden: 'x', datum: new Date('2026-03-01') })).toThrow(DomeinFout);
  });

  it('stelt een prestatieverklaring op binnen de looptijd', () => {
    const c = nieuwContract();
    c.trekEventsLeeg();
    c.stelPrestatieverklaringOp({ id: 'P1', periode: Contractperiode.van(new Date('2026-01-01'), new Date('2026-06-30')), score: 85, bedrag: Bedrag.vanEuro(500) });
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.prestatieverklaring.opgesteld');
  });

  it('weigert een prestatieverklaring buiten de looptijd', () => {
    const c = nieuwContract();
    expect(() => c.stelPrestatieverklaringOp({ id: 'P1', periode: Contractperiode.van(new Date('2025-01-01'), new Date('2025-06-30')), score: 85, bedrag: Bedrag.vanEuro(500) })).toThrow(DomeinFout);
  });

  it('rondt af en blokkeert daarna mutaties', () => {
    const c = nieuwContract();
    c.trekEventsLeeg();
    c.rondAf(new Date('2026-12-31'));
    expect(c.status).toBe('Afgerond');
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.onderhoudscontract.afgerond');
    expect(() => c.keurWijzigingGoed({ id: 'W1', mutatie: Bedrag.vanEuro(1), soort: 'Verhoging', reden: 'x', datum: new Date('2026-12-31') })).toThrow(DomeinFout);
    expect(() => c.rondAf(new Date('2026-12-31'))).toThrow(DomeinFout);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onderhoudscontract`
Expected: FAIL — modules ontbreken.

- [ ] **Step 3: Implementeer `wijziging.ts` en `prestatieverklaring.ts`**

`contract/src/domain/onderhoudscontract/wijziging.ts`:
```ts
import type { Bedrag } from '../gedeeld/waarden.js';

export type WijzigingSoort = 'Verhoging' | 'Verlaging';

export interface Wijziging {
  id: string;
  mutatie: Bedrag;
  soort: WijzigingSoort;
  reden: string;
  datum: Date;
}
```

`contract/src/domain/onderhoudscontract/prestatieverklaring.ts`:
```ts
import type { Bedrag, Contractperiode } from '../gedeeld/waarden.js';

export interface Prestatieverklaring {
  id: string;
  periode: Contractperiode;
  score: number;
  bedrag: Bedrag;
}
```

- [ ] **Step 4: Implementeer `onderhoudscontract.ts`**

`contract/src/domain/onderhoudscontract/onderhoudscontract.ts`:
```ts
import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import { AanbestedingId, Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../gedeeld/waarden.js';
import type { Wijziging, WijzigingSoort } from './wijziging.js';
import type { Prestatieverklaring } from './prestatieverklaring.js';

export type ContractStatus = 'Actief' | 'Afgerond';

interface HerstelData {
  id: ContractId;
  kunstwerkId: KunstwerkId;
  opdrachtnemer: Aannemer;
  looptijd: Contractperiode;
  waarde: Bedrag;
  aanbestedingId?: AanbestedingId;
  status: ContractStatus;
  wijzigingen: Wijziging[];
  prestatieverklaringen: Prestatieverklaring[];
}

export class Onderhoudscontract extends AggregateRoot {
  private constructor(
    private readonly _id: ContractId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly opdrachtnemer: Aannemer,
    private readonly looptijd: Contractperiode,
    private _waarde: Bedrag,
    private readonly aanbestedingId: AanbestedingId | undefined,
    private _status: ContractStatus,
    private readonly wijzigingen: Wijziging[],
    private readonly prestatieverklaringen: Prestatieverklaring[],
  ) {
    super();
  }

  static gun(p: {
    id: ContractId;
    kunstwerkId: KunstwerkId;
    opdrachtnemer: Aannemer;
    looptijd: Contractperiode;
    waarde: Bedrag;
    aanbestedingId?: AanbestedingId;
  }): Onderhoudscontract {
    const c = new Onderhoudscontract(p.id, p.kunstwerkId, p.opdrachtnemer, p.looptijd, p.waarde, p.aanbestedingId, 'Actief', [], []);
    c.registreerEvent({
      eventType: 'contract.onderhoudscontract.gegund',
      data: {
        contractId: p.id.waarde,
        kunstwerkId: p.kunstwerkId.waarde,
        opdrachtnemer: p.opdrachtnemer.naam,
        looptijd: { start: p.looptijd.start.toISOString(), eind: p.looptijd.eind.toISOString() },
      },
    });
    return c;
  }

  static herstel(d: HerstelData): Onderhoudscontract {
    return new Onderhoudscontract(d.id, d.kunstwerkId, d.opdrachtnemer, d.looptijd, d.waarde, d.aanbestedingId, d.status, d.wijzigingen, d.prestatieverklaringen);
  }

  get id(): ContractId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get status(): ContractStatus { return this._status; }
  get waarde(): Bedrag { return this._waarde; }

  private eisActief(): void {
    if (this._status !== 'Actief') throw new DomeinFout('actie kan alleen op een actief contract');
  }

  keurWijzigingGoed(p: { id: string; mutatie: Bedrag; soort: WijzigingSoort; reden: string; datum: Date }): void {
    this.eisActief();
    const nieuweWaarde = p.soort === 'Verhoging' ? this._waarde.plus(p.mutatie) : this._waarde.min(p.mutatie);
    this._waarde = nieuweWaarde;
    this.wijzigingen.push({ id: p.id, mutatie: p.mutatie, soort: p.soort, reden: p.reden, datum: p.datum });
    const gesigneerd = p.soort === 'Verhoging' ? p.mutatie.euro : -p.mutatie.euro;
    this.registreerEvent({
      eventType: 'contract.wijziging.goedgekeurd',
      data: { contractId: this._id.waarde, bedrag: gesigneerd, reden: p.reden, datum: p.datum.toISOString() },
    });
  }

  stelPrestatieverklaringOp(p: { id: string; periode: Contractperiode; score: number; bedrag: Bedrag }): void {
    this.eisActief();
    if (!this.looptijd.omvat(p.periode)) throw new DomeinFout('prestatieperiode valt buiten de looptijd');
    if (p.score < 0 || p.score > 100) throw new DomeinFout('score moet tussen 0 en 100 liggen');
    this.prestatieverklaringen.push({ id: p.id, periode: p.periode, score: p.score, bedrag: p.bedrag });
    this.registreerEvent({
      eventType: 'contract.prestatieverklaring.opgesteld',
      data: {
        contractId: this._id.waarde,
        periode: { start: p.periode.start.toISOString(), eind: p.periode.eind.toISOString() },
        score: p.score,
        bedrag: p.bedrag.euro,
      },
    });
  }

  rondAf(datum: Date): void {
    this.eisActief();
    this._status = 'Afgerond';
    this.registreerEvent({
      eventType: 'contract.onderhoudscontract.afgerond',
      data: { contractId: this._id.waarde, kunstwerkId: this._kunstwerkId.waarde, datum: datum.toISOString() },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- onderhoudscontract`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contract/src/domain/onderhoudscontract contract/test/domain/onderhoudscontract.test.ts
git commit -m "feat(contract): Onderhoudscontract-aggregate met wijziging/prestatie/afronden"
```

---

### Task 8: Application — ports, fakes & Aanbesteding-use-cases

**Files:**
- Create: `contract/src/application/ports.ts`
- Create: `contract/src/application/aanbesteding/publiceer-aanbesteding.ts`
- Create: `contract/src/application/aanbesteding/ontvang-inschrijving.ts`
- Create: `contract/src/application/aanbesteding/gun-aanbesteding.ts`
- Create: `contract/test/support/fakes.ts`
- Test: `contract/test/application/aanbesteding-usecases.test.ts`

**Interfaces:**
- Produces (ports):
  - `interface AanbestedingRepository { bewaar(a: Aanbesteding): Promise<void>; zoek(id: AanbestedingId): Promise<Aanbesteding | null>; zoekAlle(): Promise<Aanbesteding[]> }`
  - `interface OnderhoudscontractRepository { bewaar(c: Onderhoudscontract): Promise<void>; zoek(id: ContractId): Promise<Onderhoudscontract | null>; zoekAlle(): Promise<Onderhoudscontract[]>; zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoudscontract[]> }`
  - `interface EventPublisher { publiceer(events: ContractDomainEvent[]): Promise<void> }`
  - `interface KunstwerkenReadModel { isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> }`
  - `interface IdGenerator { nieuw(): string }`
- Produces (use cases): `PubliceerAanbesteding`, `OntvangInschrijving`, `GunAanbesteding` — elk een klasse met `uitvoeren(command)`.
- Produces (test-fakes): `InMemoryAanbestedingRepository`, `InMemoryOnderhoudscontractRepository`, `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `VasteIdGenerator`.

- [ ] **Step 1: Ports definiëren**

`contract/src/application/ports.ts`:
```ts
import type { Aanbesteding } from '../domain/aanbesteding/aanbesteding.js';
import type { Onderhoudscontract } from '../domain/onderhoudscontract/onderhoudscontract.js';
import type { AanbestedingId, ContractId, KunstwerkId } from '../domain/gedeeld/waarden.js';
import type { ContractDomainEvent } from '../domain/gedeeld/domain-events.js';

export interface AanbestedingRepository {
  bewaar(a: Aanbesteding): Promise<void>;
  zoek(id: AanbestedingId): Promise<Aanbesteding | null>;
  zoekAlle(): Promise<Aanbesteding[]>;
}

export interface OnderhoudscontractRepository {
  bewaar(c: Onderhoudscontract): Promise<void>;
  zoek(id: ContractId): Promise<Onderhoudscontract | null>;
  zoekAlle(): Promise<Onderhoudscontract[]>;
  zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoudscontract[]>;
}

export interface EventPublisher {
  publiceer(events: ContractDomainEvent[]): Promise<void>;
}

export interface KunstwerkenReadModel {
  isBekendEnInGebruik(id: KunstwerkId): Promise<boolean>;
}

export interface IdGenerator {
  nieuw(): string;
}
```

- [ ] **Step 2: Test-fakes**

`contract/test/support/fakes.ts`:
```ts
import type {
  AanbestedingRepository,
  EventPublisher,
  IdGenerator,
  KunstwerkenReadModel,
  OnderhoudscontractRepository,
} from '../../src/application/ports.js';
import type { Aanbesteding } from '../../src/domain/aanbesteding/aanbesteding.js';
import type { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import type { AanbestedingId, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import type { ContractDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

export class InMemoryAanbestedingRepository implements AanbestedingRepository {
  private opslag = new Map<string, Aanbesteding>();
  async bewaar(a: Aanbesteding): Promise<void> { this.opslag.set(a.id.waarde, a); }
  async zoek(id: AanbestedingId): Promise<Aanbesteding | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Aanbesteding[]> { return [...this.opslag.values()]; }
}

export class InMemoryOnderhoudscontractRepository implements OnderhoudscontractRepository {
  private opslag = new Map<string, Onderhoudscontract>();
  async bewaar(c: Onderhoudscontract): Promise<void> { this.opslag.set(c.id.waarde, c); }
  async zoek(id: ContractId): Promise<Onderhoudscontract | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Onderhoudscontract[]> { return [...this.opslag.values()]; }
  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoudscontract[]> {
    return [...this.opslag.values()].filter((c) => c.kunstwerkId.gelijkAan(kunstwerkId));
  }
}

export class FakeEventPublisher implements EventPublisher {
  gepubliceerd: ContractDomainEvent[] = [];
  async publiceer(events: ContractDomainEvent[]): Promise<void> { this.gepubliceerd.push(...events); }
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
```

- [ ] **Step 3: Write the failing test**

`contract/test/application/aanbesteding-usecases.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { PubliceerAanbesteding } from '../../src/application/aanbesteding/publiceer-aanbesteding.js';
import { OntvangInschrijving } from '../../src/application/aanbesteding/ontvang-inschrijving.js';
import { GunAanbesteding } from '../../src/application/aanbesteding/gun-aanbesteding.js';
import {
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryAanbestedingRepository,
  InMemoryOnderhoudscontractRepository,
  VasteIdGenerator,
} from '../support/fakes.js';

describe('Aanbesteding-use-cases', () => {
  let aanbestedingen: InMemoryAanbestedingRepository;
  let contracten: InMemoryOnderhoudscontractRepository;
  let publisher: FakeEventPublisher;
  let ids: VasteIdGenerator;

  beforeEach(() => {
    aanbestedingen = new InMemoryAanbestedingRepository();
    contracten = new InMemoryOnderhoudscontractRepository();
    publisher = new FakeEventPublisher();
    ids = new VasteIdGenerator('A');
  });

  async function publiceer(): Promise<string> {
    const uc = new PubliceerAanbesteding(aanbestedingen, publisher, ids);
    const { aanbestedingId } = await uc.uitvoeren({
      kunstwerkId: 'KW1',
      sluitingsdatum: '2026-09-01',
      prijsgewicht: 60,
      kwaliteitsgewicht: 40,
    });
    return aanbestedingId;
  }

  it('publiceert een aanbesteding, bewaart en publiceert het event', async () => {
    const id = await publiceer();
    expect(await aanbestedingen.zoek((await aanbestedingen.zoekAlle())[0].id)).not.toBeNull();
    expect(publisher.types()).toContain('contract.aanbesteding.gepubliceerd');
    expect(id).toBe('A-1');
  });

  it('ontvangt een inschrijving', async () => {
    const id = await publiceer();
    const uc = new OntvangInschrijving(aanbestedingen, publisher, ids);
    await uc.uitvoeren({ aanbestedingId: id, aannemer: 'BAM', prijs: 1000, kwaliteitsscore: 80 });
    expect(publisher.types()).toContain('contract.inschrijving.ontvangen');
  });

  it('gunt en maakt een onderhoudscontract, publiceert beide events', async () => {
    const id = await publiceer();
    await new OntvangInschrijving(aanbestedingen, publisher, ids).uitvoeren({ aanbestedingId: id, aannemer: 'BAM', prijs: 1000, kwaliteitsscore: 80 });
    const readModel = new FakeKunstwerkenReadModel(true);
    const uc = new GunAanbesteding(aanbestedingen, contracten, publisher, readModel, new VasteIdGenerator('C'), 'soepel');
    const { contractId } = await uc.uitvoeren({ aanbestedingId: id, looptijdStart: '2026-01-01', looptijdEind: '2026-12-31' });
    expect(contractId).toBe('C-1');
    expect(publisher.types()).toEqual(expect.arrayContaining(['contract.aanbesteding.gegund', 'contract.onderhoudscontract.gegund']));
    expect(await contracten.zoekAlle()).toHaveLength(1);
  });

  it('blokkeert gunnen bij streng + onbekend kunstwerk', async () => {
    const id = await publiceer();
    await new OntvangInschrijving(aanbestedingen, publisher, ids).uitvoeren({ aanbestedingId: id, aannemer: 'BAM', prijs: 1000, kwaliteitsscore: 80 });
    const readModel = new FakeKunstwerkenReadModel(false);
    const uc = new GunAanbesteding(aanbestedingen, contracten, publisher, readModel, new VasteIdGenerator('C'), 'streng');
    await expect(uc.uitvoeren({ aanbestedingId: id, looptijdStart: '2026-01-01', looptijdEind: '2026-12-31' })).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- aanbesteding-usecases`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 5: Implementeer `PubliceerAanbesteding`**

`contract/src/application/aanbesteding/publiceer-aanbesteding.ts`:
```ts
import { Aanbesteding } from '../../domain/aanbesteding/aanbesteding.js';
import { AanbestedingId, Gunningscriteria, KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { AanbestedingRepository, EventPublisher, IdGenerator } from '../ports.js';

export interface PubliceerAanbestedingCommand {
  kunstwerkId: string;
  sluitingsdatum: string;
  prijsgewicht: number;
  kwaliteitsgewicht: number;
}

export class PubliceerAanbesteding {
  constructor(
    private readonly repo: AanbestedingRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: PubliceerAanbestedingCommand): Promise<{ aanbestedingId: string }> {
    const id = AanbestedingId.van(this.ids.nieuw());
    const aanbesteding = Aanbesteding.publiceer({
      id,
      kunstwerkId: KunstwerkId.van(command.kunstwerkId),
      sluitingsdatum: new Date(command.sluitingsdatum),
      criteria: Gunningscriteria.van(command.prijsgewicht, command.kwaliteitsgewicht),
    });
    await this.repo.bewaar(aanbesteding);
    await this.publisher.publiceer(aanbesteding.trekEventsLeeg());
    return { aanbestedingId: id.waarde };
  }
}
```

- [ ] **Step 6: Implementeer `OntvangInschrijving`**

`contract/src/application/aanbesteding/ontvang-inschrijving.ts`:
```ts
import { Aannemer, AanbestedingId, Bedrag } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { AanbestedingRepository, EventPublisher, IdGenerator } from '../ports.js';

export interface OntvangInschrijvingCommand {
  aanbestedingId: string;
  aannemer: string;
  prijs: number;
  kwaliteitsscore: number;
}

export class OntvangInschrijving {
  constructor(
    private readonly repo: AanbestedingRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: OntvangInschrijvingCommand): Promise<void> {
    const aanbesteding = await this.repo.zoek(AanbestedingId.van(command.aanbestedingId));
    if (!aanbesteding) throw new DomeinFout('aanbesteding niet gevonden');
    aanbesteding.ontvangInschrijving({
      id: this.ids.nieuw(),
      aannemer: Aannemer.van(command.aannemer),
      prijs: Bedrag.vanEuro(command.prijs),
      kwaliteitsscore: command.kwaliteitsscore,
    });
    await this.repo.bewaar(aanbesteding);
    await this.publisher.publiceer(aanbesteding.trekEventsLeeg());
  }
}
```

- [ ] **Step 7: Implementeer `GunAanbesteding`**

`contract/src/application/aanbesteding/gun-aanbesteding.ts`:
```ts
import { Onderhoudscontract } from '../../domain/onderhoudscontract/onderhoudscontract.js';
import { AanbestedingId, Contractperiode, ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type {
  AanbestedingRepository,
  EventPublisher,
  IdGenerator,
  KunstwerkenReadModel,
  OnderhoudscontractRepository,
} from '../ports.js';

export interface GunAanbestedingCommand {
  aanbestedingId: string;
  looptijdStart: string;
  looptijdEind: string;
}

export class GunAanbesteding {
  constructor(
    private readonly aanbestedingen: AanbestedingRepository,
    private readonly contracten: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
    private readonly kunstwerken: KunstwerkenReadModel,
    private readonly ids: IdGenerator,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: GunAanbestedingCommand): Promise<{ contractId: string }> {
    const aanbesteding = await this.aanbestedingen.zoek(AanbestedingId.van(command.aanbestedingId));
    if (!aanbesteding) throw new DomeinFout('aanbesteding niet gevonden');

    const bekend = await this.kunstwerken.isBekendEnInGebruik(aanbesteding.kunstwerkId);
    if (!bekend) {
      if (this.validatie === 'streng') throw new DomeinFout('kunstwerk onbekend of buiten gebruik');
      // soepel: doorgaan (Fase 1); een waarschuwing is voldoende
      console.warn(`kunstwerk ${aanbesteding.kunstwerkId.waarde} onbekend in read-model — soepele validatie, gunning gaat door`);
    }

    const uitslag = aanbesteding.gun();
    await this.aanbestedingen.bewaar(aanbesteding);

    const contractId = ContractId.van(this.ids.nieuw());
    const contract = Onderhoudscontract.gun({
      id: contractId,
      kunstwerkId: aanbesteding.kunstwerkId,
      opdrachtnemer: uitslag.winnaar,
      looptijd: Contractperiode.van(new Date(command.looptijdStart), new Date(command.looptijdEind)),
      waarde: uitslag.winnendePrijs,
      aanbestedingId: aanbesteding.id,
    });
    await this.contracten.bewaar(contract);

    await this.publisher.publiceer([...aanbesteding.trekEventsLeeg(), ...contract.trekEventsLeeg()]);
    return { contractId: contractId.waarde };
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- aanbesteding-usecases`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add contract/src/application/ports.ts contract/src/application/aanbesteding contract/test/support/fakes.ts contract/test/application/aanbesteding-usecases.test.ts
git commit -m "feat(contract): application-ports, fakes en Aanbesteding-use-cases"
```

---

### Task 9: Application — Onderhoudscontract-use-cases + queries

**Files:**
- Create: `contract/src/application/onderhoudscontract/keur-wijziging-goed.ts`
- Create: `contract/src/application/onderhoudscontract/stel-prestatieverklaring-op.ts`
- Create: `contract/src/application/onderhoudscontract/rond-onderhoudscontract-af.ts`
- Create: `contract/src/application/queries.ts`
- Test: `contract/test/application/onderhoudscontract-usecases.test.ts`

**Interfaces:**
- Consumes: ports + fakes (Task 8), Onderhoudscontract-aggregate (Task 7).
- Produces: `KeurWijzigingGoed`, `StelPrestatieverklaringOp`, `RondOnderhoudscontractAf` — elk `uitvoeren(command)`.
- Produces: query-functies `zoekContracten(repo)`, `zoekContractenPerKunstwerk(repo, kunstwerkId)`, `haalContract(repo, id)`, `zoekAanbestedingen(repo)`, `haalAanbesteding(repo, id)` — retourneren leesmodellen (plain objects) via een mapper, geen aggregates.

- [ ] **Step 1: Write the failing test**

`contract/test/application/onderhoudscontract-usecases.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import { Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { KeurWijzigingGoed } from '../../src/application/onderhoudscontract/keur-wijziging-goed.js';
import { StelPrestatieverklaringOp } from '../../src/application/onderhoudscontract/stel-prestatieverklaring-op.js';
import { RondOnderhoudscontractAf } from '../../src/application/onderhoudscontract/rond-onderhoudscontract-af.js';
import { FakeEventPublisher, InMemoryOnderhoudscontractRepository, VasteIdGenerator } from '../support/fakes.js';

describe('Onderhoudscontract-use-cases', () => {
  let repo: InMemoryOnderhoudscontractRepository;
  let publisher: FakeEventPublisher;

  beforeEach(async () => {
    repo = new InMemoryOnderhoudscontractRepository();
    publisher = new FakeEventPublisher();
    const c = Onderhoudscontract.gun({
      id: ContractId.van('C1'),
      kunstwerkId: KunstwerkId.van('KW1'),
      opdrachtnemer: Aannemer.van('BAM'),
      looptijd: Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31')),
      waarde: Bedrag.vanEuro(1000),
    });
    c.trekEventsLeeg();
    await repo.bewaar(c);
  });

  it('keurt een wijziging goed', async () => {
    await new KeurWijzigingGoed(repo, publisher, new VasteIdGenerator('W')).uitvoeren({
      contractId: 'C1', bedrag: 200, soort: 'Verhoging', reden: 'meerwerk', datum: '2026-03-01',
    });
    expect(publisher.types()).toContain('contract.wijziging.goedgekeurd');
    expect((await repo.zoek(ContractId.van('C1')))!.waarde.euro).toBe(1200);
  });

  it('stelt een prestatieverklaring op', async () => {
    await new StelPrestatieverklaringOp(repo, publisher, new VasteIdGenerator('P')).uitvoeren({
      contractId: 'C1', periodeStart: '2026-01-01', periodeEind: '2026-06-30', score: 85, bedrag: 500,
    });
    expect(publisher.types()).toContain('contract.prestatieverklaring.opgesteld');
  });

  it('rondt een contract af', async () => {
    await new RondOnderhoudscontractAf(repo, publisher).uitvoeren({ contractId: 'C1', datum: '2026-12-31' });
    expect(publisher.types()).toContain('contract.onderhoudscontract.afgerond');
    expect((await repo.zoek(ContractId.van('C1')))!.status).toBe('Afgerond');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onderhoudscontract-usecases`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 3: Implementeer `KeurWijzigingGoed`**

`contract/src/application/onderhoudscontract/keur-wijziging-goed.ts`:
```ts
import { Bedrag, ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { WijzigingSoort } from '../../domain/onderhoudscontract/wijziging.js';
import type { EventPublisher, IdGenerator, OnderhoudscontractRepository } from '../ports.js';

export interface KeurWijzigingGoedCommand {
  contractId: string;
  bedrag: number;
  soort: WijzigingSoort;
  reden: string;
  datum: string;
}

export class KeurWijzigingGoed {
  constructor(
    private readonly repo: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: KeurWijzigingGoedCommand): Promise<void> {
    const contract = await this.repo.zoek(ContractId.van(command.contractId));
    if (!contract) throw new DomeinFout('contract niet gevonden');
    contract.keurWijzigingGoed({
      id: this.ids.nieuw(),
      mutatie: Bedrag.vanEuro(command.bedrag),
      soort: command.soort,
      reden: command.reden,
      datum: new Date(command.datum),
    });
    await this.repo.bewaar(contract);
    await this.publisher.publiceer(contract.trekEventsLeeg());
  }
}
```

- [ ] **Step 4: Implementeer `StelPrestatieverklaringOp`**

`contract/src/application/onderhoudscontract/stel-prestatieverklaring-op.ts`:
```ts
import { Bedrag, Contractperiode, ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, IdGenerator, OnderhoudscontractRepository } from '../ports.js';

export interface StelPrestatieverklaringOpCommand {
  contractId: string;
  periodeStart: string;
  periodeEind: string;
  score: number;
  bedrag: number;
}

export class StelPrestatieverklaringOp {
  constructor(
    private readonly repo: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: StelPrestatieverklaringOpCommand): Promise<void> {
    const contract = await this.repo.zoek(ContractId.van(command.contractId));
    if (!contract) throw new DomeinFout('contract niet gevonden');
    contract.stelPrestatieverklaringOp({
      id: this.ids.nieuw(),
      periode: Contractperiode.van(new Date(command.periodeStart), new Date(command.periodeEind)),
      score: command.score,
      bedrag: Bedrag.vanEuro(command.bedrag),
    });
    await this.repo.bewaar(contract);
    await this.publisher.publiceer(contract.trekEventsLeeg());
  }
}
```

- [ ] **Step 5: Implementeer `RondOnderhoudscontractAf`**

`contract/src/application/onderhoudscontract/rond-onderhoudscontract-af.ts`:
```ts
import { ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, OnderhoudscontractRepository } from '../ports.js';

export interface RondOnderhoudscontractAfCommand {
  contractId: string;
  datum: string;
}

export class RondOnderhoudscontractAf {
  constructor(
    private readonly repo: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async uitvoeren(command: RondOnderhoudscontractAfCommand): Promise<void> {
    const contract = await this.repo.zoek(ContractId.van(command.contractId));
    if (!contract) throw new DomeinFout('contract niet gevonden');
    contract.rondAf(new Date(command.datum));
    await this.repo.bewaar(contract);
    await this.publisher.publiceer(contract.trekEventsLeeg());
  }
}
```

- [ ] **Step 6: Implementeer `queries.ts`**

`contract/src/application/queries.ts`:
```ts
import type { AanbestedingRepository, OnderhoudscontractRepository } from './ports.js';
import type { Aanbesteding } from '../domain/aanbesteding/aanbesteding.js';
import type { Onderhoudscontract } from '../domain/onderhoudscontract/onderhoudscontract.js';
import { AanbestedingId, ContractId, KunstwerkId } from '../domain/gedeeld/waarden.js';

export interface AanbestedingWeergave {
  aanbestedingId: string;
  kunstwerkId: string;
  status: string;
  aantalInschrijvingen: number;
}
export interface ContractWeergave {
  contractId: string;
  kunstwerkId: string;
  opdrachtnemer: string;
  status: string;
  waarde: number;
}

function naarAanbestedingWeergave(a: Aanbesteding): AanbestedingWeergave {
  return { aanbestedingId: a.id.waarde, kunstwerkId: a.kunstwerkId.waarde, status: a.status, aantalInschrijvingen: a.inschrijvingen.length };
}
function naarContractWeergave(c: Onderhoudscontract): ContractWeergave {
  return { contractId: c.id.waarde, kunstwerkId: c.kunstwerkId.waarde, opdrachtnemer: '', status: c.status, waarde: c.waarde.euro };
}

export async function zoekAanbestedingen(repo: AanbestedingRepository): Promise<AanbestedingWeergave[]> {
  return (await repo.zoekAlle()).map(naarAanbestedingWeergave);
}
export async function haalAanbesteding(repo: AanbestedingRepository, id: string): Promise<AanbestedingWeergave | null> {
  const a = await repo.zoek(AanbestedingId.van(id));
  return a ? naarAanbestedingWeergave(a) : null;
}
export async function zoekContracten(repo: OnderhoudscontractRepository): Promise<ContractWeergave[]> {
  return (await repo.zoekAlle()).map(naarContractWeergave);
}
export async function zoekContractenPerKunstwerk(repo: OnderhoudscontractRepository, kunstwerkId: string): Promise<ContractWeergave[]> {
  return (await repo.zoekPerKunstwerk(KunstwerkId.van(kunstwerkId))).map(naarContractWeergave);
}
export async function haalContract(repo: OnderhoudscontractRepository, id: string): Promise<ContractWeergave | null> {
  const c = await repo.zoek(ContractId.van(id));
  return c ? naarContractWeergave(c) : null;
}
```

> **Let op:** `naarContractWeergave` toont `opdrachtnemer: ''` omdat het aggregate de opdrachtnemer nu privé houdt. Voeg in Task 7 een getter `get opdrachtnemerNaam(): string { return this.opdrachtnemer.naam; }` toe aan `Onderhoudscontract` en gebruik die hier (`opdrachtnemer: c.opdrachtnemerNaam`). Voeg dezelfde getter-aanpassing toe als losse stap hieronder.

- [ ] **Step 7: Getter toevoegen aan Onderhoudscontract**

Voeg in `contract/src/domain/onderhoudscontract/onderhoudscontract.ts` bij de getters toe:
```ts
  get opdrachtnemerNaam(): string { return this.opdrachtnemer.naam; }
```
En pas in `queries.ts` `naarContractWeergave` aan naar `opdrachtnemer: c.opdrachtnemerNaam`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — alle domain- + application-tests groen.

- [ ] **Step 9: Commit**

```bash
git add contract/src/application/onderhoudscontract contract/src/application/queries.ts contract/src/domain/onderhoudscontract/onderhoudscontract.ts contract/test/application/onderhoudscontract-usecases.test.ts
git commit -m "feat(contract): Onderhoudscontract-use-cases en queries"
```

---

### Task 10: Infrastructure — Prisma-domeintabellen + repo-implementaties

**Files:**
- Modify: `contract/prisma/schema.prisma`
- Create: `contract/src/infrastructure/db/prisma-aanbesteding-repository.ts`
- Create: `contract/src/infrastructure/db/prisma-onderhoudscontract-repository.ts`

**Interfaces:**
- Consumes: repo-ports (Task 8), aggregates (Task 6/7).
- Produces: `class PrismaAanbestedingRepository implements AanbestedingRepository`; `class PrismaOnderhoudscontractRepository implements OnderhoudscontractRepository` — constructor neemt `PrismaClient`.

- [ ] **Step 1: Schema uitbreiden**

Voeg toe aan `contract/prisma/schema.prisma`:
```prisma
model Aanbesteding {
  id                String        @id
  kunstwerkId       String
  sluitingsdatum    DateTime
  prijsgewicht      Int
  kwaliteitsgewicht Int
  status            String
  inschrijvingen    Inschrijving[]
}

model Inschrijving {
  id             String       @id
  aanbestedingId String
  aannemer       String
  prijsCenten    Int
  kwaliteitsscore Int
  aanbesteding   Aanbesteding @relation(fields: [aanbestedingId], references: [id])
}

model Onderhoudscontract {
  id             String            @id
  kunstwerkId    String
  opdrachtnemer  String
  looptijdStart  DateTime
  looptijdEind   DateTime
  waardeCenten   Int
  aanbestedingId String?
  status         String
  wijzigingen    Wijziging[]
  prestaties     Prestatieverklaring[]
}

model Wijziging {
  id         String             @id
  contractId String
  mutatieCenten Int
  soort      String
  reden      String
  datum      DateTime
  contract   Onderhoudscontract @relation(fields: [contractId], references: [id])
}

model Prestatieverklaring {
  id           String             @id
  contractId   String
  periodeStart DateTime
  periodeEind  DateTime
  score        Int
  bedragCenten Int
  contract     Onderhoudscontract @relation(fields: [contractId], references: [id])
}
```

- [ ] **Step 2: Migratie**

Run (in `contract/`): `DATABASE_URL=postgres://rws:rws@localhost:5432/contract_db npx prisma migrate dev --name domeintabellen`
Expected: nieuwe migratie; tabellen bestaan; `npx prisma generate` bijgewerkt.

- [ ] **Step 3: `PrismaAanbestedingRepository`**

`contract/src/infrastructure/db/prisma-aanbesteding-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { AanbestedingRepository } from '../../application/ports.js';
import { Aanbesteding, type AanbestedingStatus } from '../../domain/aanbesteding/aanbesteding.js';
import { Aannemer, AanbestedingId, Bedrag, Gunningscriteria, KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { Inschrijving } from '../../domain/aanbesteding/inschrijving.js';

export class PrismaAanbestedingRepository implements AanbestedingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(a: Aanbesteding): Promise<void> {
    const inschrijvingen = a.inschrijvingen;
    await this.prisma.$transaction([
      this.prisma.aanbesteding.upsert({
        where: { id: a.id.waarde },
        create: {
          id: a.id.waarde,
          kunstwerkId: a.kunstwerkId.waarde,
          sluitingsdatum: a.sluitingsdatum,
          prijsgewicht: a.criteria.prijsgewicht,
          kwaliteitsgewicht: a.criteria.kwaliteitsgewicht,
          status: a.status,
        },
        update: { status: a.status },
      }),
      this.prisma.inschrijving.deleteMany({ where: { aanbestedingId: a.id.waarde } }),
      this.prisma.inschrijving.createMany({
        data: inschrijvingen.map((i) => ({
          id: i.id,
          aanbestedingId: a.id.waarde,
          aannemer: i.aannemer.naam,
          prijsCenten: i.prijs.centen,
          kwaliteitsscore: i.kwaliteitsscore,
        })),
      }),
    ]);
  }

  async zoek(id: AanbestedingId): Promise<Aanbesteding | null> {
    const rij = await this.prisma.aanbesteding.findUnique({ where: { id: id.waarde }, include: { inschrijvingen: true } });
    if (!rij) return null;
    const inschrijvingen: Inschrijving[] = rij.inschrijvingen.map((i) => ({
      id: i.id,
      aannemer: Aannemer.van(i.aannemer),
      prijs: Bedrag.vanCenten(i.prijsCenten),
      kwaliteitsscore: i.kwaliteitsscore,
    }));
    return Aanbesteding.herstel({
      id: AanbestedingId.van(rij.id),
      kunstwerkId: KunstwerkId.van(rij.kunstwerkId),
      sluitingsdatum: rij.sluitingsdatum,
      criteria: Gunningscriteria.van(rij.prijsgewicht, rij.kwaliteitsgewicht),
      status: rij.status as AanbestedingStatus,
      inschrijvingen,
    });
  }

  async zoekAlle(): Promise<Aanbesteding[]> {
    const rijen = await this.prisma.aanbesteding.findMany({ include: { inschrijvingen: true } });
    return Promise.all(rijen.map((r) => this.zoek(AanbestedingId.van(r.id)))) as Promise<Aanbesteding[]>;
  }
}
```

> **Let op:** `sluitingsdatum` en `criteria` moeten leesbaar zijn voor de repo. Voeg in `Aanbesteding` (Task 6) publieke getters toe: `get sluitingsdatum(): Date` en `get criteria(): Gunningscriteria`. Voeg die getters toe als aparte stap.

- [ ] **Step 4: Getters toevoegen aan Aanbesteding**

Voeg in `contract/src/domain/aanbesteding/aanbesteding.ts` bij de getters toe:
```ts
  get sluitingsdatum(): Date { return this.sluitingsdatumWaarde; }
  get criteria(): Gunningscriteria { return this.criteriaWaarde; }
```
Hernoem daarvoor de private velden `sluitingsdatum`/`criteria` naar `sluitingsdatumWaarde`/`criteriaWaarde` in de constructor en het gebruik ervan (in `publiceer`/`emviScore`), zodat de getters de publieke naam krijgen.

- [ ] **Step 5: `PrismaOnderhoudscontractRepository`**

`contract/src/infrastructure/db/prisma-onderhoudscontract-repository.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { OnderhoudscontractRepository } from '../../application/ports.js';
import { Onderhoudscontract, type ContractStatus } from '../../domain/onderhoudscontract/onderhoudscontract.js';
import { AanbestedingId, Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { Wijziging, WijzigingSoort } from '../../domain/onderhoudscontract/wijziging.js';
import type { Prestatieverklaring } from '../../domain/onderhoudscontract/prestatieverklaring.js';

export class PrismaOnderhoudscontractRepository implements OnderhoudscontractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(c: Onderhoudscontract): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.onderhoudscontract.upsert({
        where: { id: c.id.waarde },
        create: {
          id: c.id.waarde,
          kunstwerkId: c.kunstwerkId.waarde,
          opdrachtnemer: c.opdrachtnemerNaam,
          looptijdStart: c.looptijd.start,
          looptijdEind: c.looptijd.eind,
          waardeCenten: c.waarde.centen,
          aanbestedingId: c.aanbestedingIdWaarde,
          status: c.status,
        },
        update: { waardeCenten: c.waarde.centen, status: c.status },
      }),
      this.prisma.wijziging.deleteMany({ where: { contractId: c.id.waarde } }),
      this.prisma.wijziging.createMany({
        data: c.wijzigingenLijst.map((w) => ({
          id: w.id, contractId: c.id.waarde, mutatieCenten: w.mutatie.centen, soort: w.soort, reden: w.reden, datum: w.datum,
        })),
      }),
      this.prisma.prestatieverklaring.deleteMany({ where: { contractId: c.id.waarde } }),
      this.prisma.prestatieverklaring.createMany({
        data: c.prestatiesLijst.map((p) => ({
          id: p.id, contractId: c.id.waarde, periodeStart: p.periode.start, periodeEind: p.periode.eind, score: p.score, bedragCenten: p.bedrag.centen,
        })),
      }),
    ]);
  }

  async zoek(id: ContractId): Promise<Onderhoudscontract | null> {
    const rij = await this.prisma.onderhoudscontract.findUnique({ where: { id: id.waarde }, include: { wijzigingen: true, prestaties: true } });
    if (!rij) return null;
    const wijzigingen: Wijziging[] = rij.wijzigingen.map((w) => ({
      id: w.id, mutatie: Bedrag.vanCenten(w.mutatieCenten), soort: w.soort as WijzigingSoort, reden: w.reden, datum: w.datum,
    }));
    const prestaties: Prestatieverklaring[] = rij.prestaties.map((p) => ({
      id: p.id, periode: Contractperiode.van(p.periodeStart, p.periodeEind), score: p.score, bedrag: Bedrag.vanCenten(p.bedragCenten),
    }));
    return Onderhoudscontract.herstel({
      id: ContractId.van(rij.id),
      kunstwerkId: KunstwerkId.van(rij.kunstwerkId),
      opdrachtnemer: Aannemer.van(rij.opdrachtnemer),
      looptijd: Contractperiode.van(rij.looptijdStart, rij.looptijdEind),
      waarde: Bedrag.vanCenten(rij.waardeCenten),
      aanbestedingId: rij.aanbestedingId ? AanbestedingId.van(rij.aanbestedingId) : undefined,
      status: rij.status as ContractStatus,
      wijzigingen,
      prestatieverklaringen: prestaties,
    });
  }

  async zoekAlle(): Promise<Onderhoudscontract[]> {
    const rijen = await this.prisma.onderhoudscontract.findMany();
    return Promise.all(rijen.map((r) => this.zoek(ContractId.van(r.id)))) as Promise<Onderhoudscontract[]>;
  }

  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoudscontract[]> {
    const rijen = await this.prisma.onderhoudscontract.findMany({ where: { kunstwerkId: kunstwerkId.waarde } });
    return Promise.all(rijen.map((r) => this.zoek(ContractId.van(r.id)))) as Promise<Onderhoudscontract[]>;
  }
}
```

- [ ] **Step 6: Getters/exposers toevoegen aan Onderhoudscontract**

Voeg in `contract/src/domain/onderhoudscontract/onderhoudscontract.ts` bij de getters toe (voor de repo):
```ts
  get looptijd(): Contractperiode { return this._looptijd; }
  get aanbestedingIdWaarde(): string | undefined { return this._aanbestedingId?.waarde; }
  get wijzigingenLijst(): readonly Wijziging[] { return this.wijzigingen; }
  get prestatiesLijst(): readonly Prestatieverklaring[] { return this.prestatieverklaringen; }
```
Hernoem daarvoor de private velden `looptijd`→`_looptijd` en `aanbestedingId`→`_aanbestedingId` in constructor + gebruik. (`opdrachtnemerNaam` bestaat al uit Task 9.)

- [ ] **Step 7: Build controleren**

Run: `npm run build`
Expected: `tsc` compileert zonder fouten (types kloppen tussen repo's, aggregates en Prisma-client).

- [ ] **Step 8: Commit**

```bash
git add contract/prisma contract/src/infrastructure/db contract/src/domain
git commit -m "feat(contract): Prisma-domeintabellen en repository-implementaties"
```

---

### Task 11: Infrastructure — RabbitMQ EventPublisher (envelope)

**Files:**
- Create: `contract/src/infrastructure/messaging/rabbitmq-event-publisher.ts`
- Test: `contract/test/infrastructure/rabbitmq-event-publisher.test.ts`

**Interfaces:**
- Consumes: `EventPublisher` (Task 8), `ContractDomainEvent` (Task 5), `RWS_EXCHANGE` (Task 3).
- Produces: `class RabbitMqEventPublisher implements EventPublisher` — constructor `(kanaal: KanaalPublish, idGenerator?: () => string, klok?: () => Date)`, waarbij `interface KanaalPublish { publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean }`.

- [ ] **Step 1: Write the failing test**

`contract/test/infrastructure/rabbitmq-event-publisher.test.ts`:
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
      { eventType: 'contract.onderhoudscontract.gegund', data: { contractId: 'C1', kunstwerkId: 'KW1', opdrachtnemer: 'BAM', looptijd: { start: 's', eind: 'e' } } },
    ]);

    expect(gepubliceerd).toHaveLength(1);
    expect(gepubliceerd[0].exchange).toBe('rws.events');
    expect(gepubliceerd[0].routingKey).toBe('contract.onderhoudscontract.gegund');
    expect(gepubliceerd[0].body).toEqual({
      eventId: 'vaste-uuid',
      eventType: 'contract.onderhoudscontract.gegund',
      occurredAt: '2026-07-01T12:00:00.000Z',
      producer: 'contract',
      version: 1,
      data: { contractId: 'C1', kunstwerkId: 'KW1', opdrachtnemer: 'BAM', looptijd: { start: 's', eind: 'e' } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rabbitmq-event-publisher`
Expected: FAIL — module ontbreekt.

- [ ] **Step 3: Implementeer de publisher**

`contract/src/infrastructure/messaging/rabbitmq-event-publisher.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { EventPublisher } from '../../application/ports.js';
import type { ContractDomainEvent } from '../../domain/gedeeld/domain-events.js';
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

  async publiceer(events: ContractDomainEvent[]): Promise<void> {
    for (const event of events) {
      const envelope = {
        eventId: this.nieuwId(),
        eventType: event.eventType,
        occurredAt: this.nu().toISOString(),
        producer: 'contract',
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
git add contract/src/infrastructure/messaging/rabbitmq-event-publisher.ts contract/test/infrastructure/rabbitmq-event-publisher.test.ts
git commit -m "feat(contract): RabbitMQ EventPublisher met vaste envelope"
```

---

### Task 12: Infrastructure — Beheer-consumer + KunstwerkenReadModel

**Files:**
- Create: `contract/src/infrastructure/db/prisma-kunstwerken-read-model.ts`
- Create: `contract/src/infrastructure/messaging/beheer-kunstwerk-consumer.ts`
- Test: `contract/test/infrastructure/beheer-kunstwerk-consumer.test.ts`

**Interfaces:**
- Consumes: `KunstwerkenReadModel` (Task 8), `RabbitMqConnectie` (Task 3).
- Produces: `class PrismaKunstwerkenReadModel implements KunstwerkenReadModel`.
- Produces: `class BeheerKunstwerkVerwerker` met `async verwerk(envelope: { eventId: string; eventType: string; data: Record<string, unknown> }): Promise<void>` (idempotent) en losstaande `startBeheerConsumer(connectie, verwerker)` voor de bedrading. De verwerker gebruikt twee poorten: `KunstwerkStore` (upsert/markeer) en `EventDedup` (isVerwerkt/markeerVerwerkt).

- [ ] **Step 1: Write the failing test (idempotentie + vertaling)**

`contract/test/infrastructure/beheer-kunstwerk-consumer.test.ts`:
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

`contract/src/infrastructure/messaging/beheer-kunstwerk-consumer.ts`:
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

const QUEUE = 'contract.beheer-kunstwerk';

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

`contract/src/infrastructure/db/prisma-kunstwerken-read-model.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import type { KunstwerkenReadModel } from '../../application/ports.js';
import type { KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { EventDedup, KunstwerkStore } from '../messaging/beheer-kunstwerk-consumer.js';

export class PrismaKunstwerkenReadModel implements KunstwerkenReadModel, KunstwerkStore, EventDedup {
  constructor(private readonly prisma: PrismaClient) {}

  async isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> {
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
git add contract/src/infrastructure/db/prisma-kunstwerken-read-model.ts contract/src/infrastructure/messaging/beheer-kunstwerk-consumer.ts contract/test/infrastructure/beheer-kunstwerk-consumer.test.ts
git commit -m "feat(contract): Beheer-kunstwerk-consumer met idempotent read-model"
```

---

### Task 13: Interface — Aanbesteding-routes

**Files:**
- Create: `contract/src/interface/http/aanbesteding-routes.ts`
- Create: `contract/src/interface/http/fout-afhandeling.ts`

**Interfaces:**
- Consumes: use cases (Task 8), queries (Task 9).
- Produces: `registreerAanbestedingRoutes(app, deps: AanbestedingRouteDeps)` waarbij `deps` de use cases + repo bevat.
- Produces: `naarHttpFout(fout: unknown): { code: number; body: { fout: string } }`.

- [ ] **Step 1: Foutvertaling**

`contract/src/interface/http/fout-afhandeling.ts`:
```ts
import { DomeinFout } from '../../domain/gedeeld/fouten.js';

export function naarHttpFout(fout: unknown): { code: number; body: { fout: string } } {
  if (fout instanceof DomeinFout) return { code: 400, body: { fout: fout.message } };
  return { code: 500, body: { fout: 'interne fout' } };
}
```

- [ ] **Step 2: Aanbesteding-routes**

`contract/src/interface/http/aanbesteding-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { PubliceerAanbesteding } from '../../application/aanbesteding/publiceer-aanbesteding.js';
import type { OntvangInschrijving } from '../../application/aanbesteding/ontvang-inschrijving.js';
import type { GunAanbesteding } from '../../application/aanbesteding/gun-aanbesteding.js';
import type { AanbestedingRepository } from '../../application/ports.js';
import { haalAanbesteding, zoekAanbestedingen } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface AanbestedingRouteDeps {
  publiceer: PubliceerAanbesteding;
  ontvangInschrijving: OntvangInschrijving;
  gun: GunAanbesteding;
  repo: AanbestedingRepository;
}

export function registreerAanbestedingRoutes(app: FastifyInstance, deps: AanbestedingRouteDeps): void {
  app.post('/api/aanbestedingen', {
    schema: {
      body: {
        type: 'object',
        required: ['kunstwerkId', 'sluitingsdatum', 'prijsgewicht', 'kwaliteitsgewicht'],
        properties: {
          kunstwerkId: { type: 'string' },
          sluitingsdatum: { type: 'string' },
          prijsgewicht: { type: 'number' },
          kwaliteitsgewicht: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const resultaat = await deps.publiceer.uitvoeren(req.body as never);
      reply.code(201).send(resultaat);
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.post('/api/aanbestedingen/:id/inschrijvingen', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.ontvangInschrijving.uitvoeren({ aanbestedingId: id, ...(req.body as object) } as never);
      reply.code(202).send({ status: 'ontvangen' });
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.post('/api/aanbestedingen/:id/gunning', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const resultaat = await deps.gun.uitvoeren({ aanbestedingId: id, ...(req.body as object) } as never);
      reply.code(201).send(resultaat);
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.get('/api/aanbestedingen', async (_req, reply) => {
    reply.send(await zoekAanbestedingen(deps.repo));
  });

  app.get('/api/aanbestedingen/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const weergave = await haalAanbesteding(deps.repo, id);
    if (!weergave) { reply.code(404).send({ fout: 'niet gevonden' }); return; }
    reply.send(weergave);
  });
}
```

- [ ] **Step 3: Build controleren**

Run: `npm run build`
Expected: compileert zonder fouten.

- [ ] **Step 4: Commit**

```bash
git add contract/src/interface/http/aanbesteding-routes.ts contract/src/interface/http/fout-afhandeling.ts
git commit -m "feat(contract): REST-routes voor aanbestedingen"
```

---

### Task 14: Interface — Contract-routes

**Files:**
- Create: `contract/src/interface/http/contract-routes.ts`

**Interfaces:**
- Consumes: use cases (Task 9), queries (Task 9).
- Produces: `registreerContractRoutes(app, deps: ContractRouteDeps)`.

- [ ] **Step 1: Contract-routes**

`contract/src/interface/http/contract-routes.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { KeurWijzigingGoed } from '../../application/onderhoudscontract/keur-wijziging-goed.js';
import type { StelPrestatieverklaringOp } from '../../application/onderhoudscontract/stel-prestatieverklaring-op.js';
import type { RondOnderhoudscontractAf } from '../../application/onderhoudscontract/rond-onderhoudscontract-af.js';
import type { OnderhoudscontractRepository } from '../../application/ports.js';
import { haalContract, zoekContracten, zoekContractenPerKunstwerk } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface ContractRouteDeps {
  keurWijziging: KeurWijzigingGoed;
  stelPrestatie: StelPrestatieverklaringOp;
  rondAf: RondOnderhoudscontractAf;
  repo: OnderhoudscontractRepository;
}

export function registreerContractRoutes(app: FastifyInstance, deps: ContractRouteDeps): void {
  app.post('/api/contracten/:id/wijzigingen', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.keurWijziging.uitvoeren({ contractId: id, ...(req.body as object) } as never);
      reply.code(201).send({ status: 'goedgekeurd' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.post('/api/contracten/:id/prestatieverklaringen', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.stelPrestatie.uitvoeren({ contractId: id, ...(req.body as object) } as never);
      reply.code(201).send({ status: 'opgesteld' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.post('/api/contracten/:id/afronding', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.rondAf.uitvoeren({ contractId: id, ...(req.body as object) } as never);
      reply.code(200).send({ status: 'afgerond' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.get('/api/contracten', async (req, reply) => {
    const { kunstwerkId } = req.query as { kunstwerkId?: string };
    if (kunstwerkId) { reply.send(await zoekContractenPerKunstwerk(deps.repo, kunstwerkId)); return; }
    reply.send(await zoekContracten(deps.repo));
  });

  app.get('/api/contracten/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const weergave = await haalContract(deps.repo, id);
    if (!weergave) { reply.code(404).send({ fout: 'niet gevonden' }); return; }
    reply.send(weergave);
  });
}
```

- [ ] **Step 2: Build controleren**

Run: `npm run build`
Expected: compileert zonder fouten.

- [ ] **Step 3: Commit**

```bash
git add contract/src/interface/http/contract-routes.ts
git commit -m "feat(contract): REST-routes voor onderhoudscontracten"
```

---

### Task 15: Interface — OpenAPI + composition root

Bedraad alles in `main.ts` en registreer OpenAPI. Breid `bouwApp` uit met de echte routes.

**Files:**
- Modify: `contract/src/interface/http/app.ts`
- Modify: `contract/src/main.ts`
- Create: `contract/src/infrastructure/id-generator.ts`

**Interfaces:**
- Consumes: alle voorgaande taken.
- Produces: `class UuidIdGenerator implements IdGenerator`.
- Produces: uitgebreide `AppDeps` met `aanbesteding?: AanbestedingRouteDeps` en `contract?: ContractRouteDeps`.

- [ ] **Step 1: UUID-id-generator**

`contract/src/infrastructure/id-generator.ts`:
```ts
import { v4 as uuid } from 'uuid';
import type { IdGenerator } from '../application/ports.js';

export class UuidIdGenerator implements IdGenerator {
  nieuw(): string { return uuid(); }
}
```

- [ ] **Step 2: `app.ts` uitbreiden met routes + OpenAPI**

`contract/src/interface/http/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registreerHealthRoute, type HealthChecks } from './health-route.js';
import { registreerAanbestedingRoutes, type AanbestedingRouteDeps } from './aanbesteding-routes.js';
import { registreerContractRoutes, type ContractRouteDeps } from './contract-routes.js';

export interface AppDeps {
  health?: HealthChecks;
  aanbesteding?: AanbestedingRouteDeps;
  contract?: ContractRouteDeps;
}

export async function bouwApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(swagger, {
    openapi: { info: { title: 'Contract-service', version: '0.1.0' } },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  registreerHealthRoute(app, deps.health);
  if (deps.aanbesteding) registreerAanbestedingRoutes(app, deps.aanbesteding);
  if (deps.contract) registreerContractRoutes(app, deps.contract);
  return app;
}
```

> **Let op:** `bouwApp` is nu `async`. Pas de aanroep in `main.ts` en de bestaande skelet-aanroep dienovereenkomstig aan (`await bouwApp(...)`).

- [ ] **Step 3: Composition root in `main.ts`**

`contract/src/main.ts`:
```ts
import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';
import { maakPrismaClient } from './infrastructure/db/prisma-client.js';
import { RabbitMqConnectie } from './infrastructure/messaging/rabbitmq-connectie.js';
import { RabbitMqEventPublisher } from './infrastructure/messaging/rabbitmq-event-publisher.js';
import { PrismaAanbestedingRepository } from './infrastructure/db/prisma-aanbesteding-repository.js';
import { PrismaOnderhoudscontractRepository } from './infrastructure/db/prisma-onderhoudscontract-repository.js';
import { PrismaKunstwerkenReadModel } from './infrastructure/db/prisma-kunstwerken-read-model.js';
import { UuidIdGenerator } from './infrastructure/id-generator.js';
import { BeheerKunstwerkVerwerker, startBeheerConsumer } from './infrastructure/messaging/beheer-kunstwerk-consumer.js';
import { PubliceerAanbesteding } from './application/aanbesteding/publiceer-aanbesteding.js';
import { OntvangInschrijving } from './application/aanbesteding/ontvang-inschrijving.js';
import { GunAanbesteding } from './application/aanbesteding/gun-aanbesteding.js';
import { KeurWijzigingGoed } from './application/onderhoudscontract/keur-wijziging-goed.js';
import { StelPrestatieverklaringOp } from './application/onderhoudscontract/stel-prestatieverklaring-op.js';
import { RondOnderhoudscontractAf } from './application/onderhoudscontract/rond-onderhoudscontract-af.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const prisma = maakPrismaClient(config.databaseUrl);
  const rabbit = await RabbitMqConnectie.verbind(config.rabbitmqUrl);

  const ids = new UuidIdGenerator();
  const publisher = new RabbitMqEventPublisher(rabbit.kanaal);
  const aanbestedingRepo = new PrismaAanbestedingRepository(prisma);
  const contractRepo = new PrismaOnderhoudscontractRepository(prisma);
  const kunstwerken = new PrismaKunstwerkenReadModel(prisma);

  const app = await bouwApp({
    health: {
      db: async () => { await prisma.$queryRaw`SELECT 1`; return true; },
      broker: async () => rabbit.isVerbonden(),
    },
    aanbesteding: {
      publiceer: new PubliceerAanbesteding(aanbestedingRepo, publisher, ids),
      ontvangInschrijving: new OntvangInschrijving(aanbestedingRepo, publisher, ids),
      gun: new GunAanbesteding(aanbestedingRepo, contractRepo, publisher, kunstwerken, ids, config.kunstwerkValidatie),
      repo: aanbestedingRepo,
    },
    contract: {
      keurWijziging: new KeurWijzigingGoed(contractRepo, publisher, ids),
      stelPrestatie: new StelPrestatieverklaringOp(contractRepo, publisher, ids),
      rondAf: new RondOnderhoudscontractAf(contractRepo, publisher),
      repo: contractRepo,
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

- [ ] **Step 5: Manuele smoke-test**

Run: repo-root `docker compose up -d postgres rabbitmq`; `contract/` `npx prisma migrate deploy` (met lokale `DATABASE_URL`); `npx tsx src/main.ts`.
Verifieer:
```bash
curl -s localhost:8001/health
curl -s -X POST localhost:8001/api/aanbestedingen -H 'content-type: application/json' \
  -d '{"kunstwerkId":"KW1","sluitingsdatum":"2026-09-01","prijsgewicht":60,"kwaliteitsgewicht":40}'
# neem de aanbestedingId over uit het antwoord (hierna <AID>)
curl -s -X POST localhost:8001/api/aanbestedingen/<AID>/inschrijvingen -H 'content-type: application/json' \
  -d '{"aannemer":"BAM","prijs":1000,"kwaliteitsscore":80}'
curl -s -X POST localhost:8001/api/aanbestedingen/<AID>/gunning -H 'content-type: application/json' \
  -d '{"looptijdStart":"2026-01-01","looptijdEind":"2026-12-31"}'
curl -s localhost:8001/api/contracten
```
Expected: health 200; POST's 201/202; `GET /api/contracten` toont het gegunde contract. Controleer in de RabbitMQ-UI (`http://localhost:15672`) dat er events op `rws.events` verschenen (bind een tijdelijke queue op `contract.#`). Open `http://localhost:8001/api/docs` voor de OpenAPI-UI.

- [ ] **Step 6: Commit**

```bash
git add contract/src/interface/http/app.ts contract/src/main.ts contract/src/infrastructure/id-generator.ts
git commit -m "feat(contract): OpenAPI en composition root — service volledig bedraad"
```

---

### Task 16: Docker + docker-compose + eind-verificatie

**Files:**
- Modify: `contract/Dockerfile`
- Modify: `docker-compose.yml` (repo-root)
- Create: `contract/.dockerignore`

**Interfaces:** geen code-interfaces; leveren een draaiende container.

- [ ] **Step 1: Dockerfile (multi-stage Node)**

Vervang de inhoud van `contract/Dockerfile`:
```dockerfile
# Contract-service — Node.js (TypeScript) multi-stage
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
EXPOSE 8001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

- [ ] **Step 2: `.dockerignore`**

`contract/.dockerignore`:
```
node_modules
dist
.env
test
```

- [ ] **Step 3: Compose-blok activeren**

In `docker-compose.yml` (repo-root): verwijder de `#`-comments van het `contract`-blok (regels rond het `contract:`-blok), zodat het actief wordt. Laat de andere service-blokken ongemoeid.

- [ ] **Step 4: `.env` aanmaken**

Run (in `contract/`): `cp .env.example .env` (laat de hostnamen op `postgres`/`rabbitmq` staan — binnen compose kloppen die).

- [ ] **Step 5: Eind-verificatie via compose**

Run (repo-root): `docker compose up --build contract postgres rabbitmq`
Verifieer in een tweede shell:
```bash
curl -s localhost:8001/health         # {"status":"ok","db":true,"broker":true}
```
Herhaal daarna de POST-flow uit Task 15 tegen `localhost:8001`. Expected: 200/201-antwoorden, contract zichtbaar via `GET /api/contracten`, events op `rws.events`.

- [ ] **Step 6: Commit**

```bash
git add contract/Dockerfile contract/.dockerignore docker-compose.yml
git commit -m "feat(contract): Docker-image en compose-integratie"
```

---

## Self-Review (uitgevoerd)

**Spec-dekking:** alle 7 events (Tasks 6/7/11), beide aggregates (6/7), read-model + soepele validatie (8/12), REST + OpenAPI (13/14/15), health + DB + broker (1–3, 15), TDD op domain/application (4–9), Docker (16). ✔
**Fase-grens:** consumeren van `beheer.ontwerpeisen`/`monitoring.rapport`, strenge validatie, buitengebruikstelling-reactie op actieve contracten, Testcontainers en Dokploy zitten bewust **niet** in dit plan (Fase 2). ✔
**Type-consistentie:** `trekEventsLeeg`, `ContractDomainEvent`, `Bedrag.centen/euro`, repo-getters (`opdrachtnemerNaam`, `looptijd`, `criteria`, `sluitingsdatum`) worden in latere taken toegevoegd vóór gebruik — let bij uitvoering op de expliciete getter-stappen in Tasks 9/10. ✔

## Aandachtspunten bij uitvoering

- Enkele taken voegen **getters aan bestaande aggregates** toe (Task 9 stap 7, Task 10 stap 4 en 6). Voer die stappen echt uit; anders faalt de build.
- `bouwApp` wordt in Task 15 `async`; werk beide aanroepen bij.
- Prisma-migraties draaien lokaal met `DATABASE_URL` op host `localhost`; in de container gebruikt compose host `postgres`.
