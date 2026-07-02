import { describe, expect, it } from 'vitest';
import { OutboxRelay, type OutboxRegel, type OutboxStore } from '../../src/infrastructure/messaging/outbox-relay.js';
import type { KanaalPublish } from '../../src/infrastructure/messaging/rabbitmq-event-publisher.js';

class FakeOutboxStore implements OutboxStore {
  constructor(private regels: OutboxRegel[]) {}
  verzonden: string[] = [];
  async pakOnverzonden(limiet: number): Promise<OutboxRegel[]> {
    return this.regels.filter((r) => !this.verzonden.includes(r.id)).slice(0, limiet);
  }
  async markeerVerzonden(ids: string[]): Promise<void> { this.verzonden.push(...ids); }
}

function vangKanaal() {
  const uit: Array<{ routingKey: string; body: unknown }> = [];
  const kanaal: KanaalPublish = {
    publish(_exchange, routingKey, content) { uit.push({ routingKey, body: JSON.parse(content.toString()) }); return true; },
  };
  return { kanaal, uit };
}

describe('OutboxRelay', () => {
  it('bezorgt onverzonden events op rws.events met de originele envelope en markeert ze verzonden', async () => {
    const store = new FakeOutboxStore([
      { id: 'evt-1', routingKey: 'contract.aanbesteding.gepubliceerd', payload: { eventId: 'evt-1', eventType: 'contract.aanbesteding.gepubliceerd', data: { x: 1 } } },
      { id: 'evt-2', routingKey: 'contract.onderhoudscontract.gegund', payload: { eventId: 'evt-2', eventType: 'contract.onderhoudscontract.gegund', data: { y: 2 } } },
    ]);
    const { kanaal, uit } = vangKanaal();
    const relay = new OutboxRelay(store, kanaal);

    const aantal = await relay.verwerkBatch();

    expect(aantal).toBe(2);
    expect(uit.map((u) => u.routingKey)).toEqual(['contract.aanbesteding.gepubliceerd', 'contract.onderhoudscontract.gegund']);
    expect((uit[0].body as { eventId: string }).eventId).toBe('evt-1');
    expect(store.verzonden).toEqual(['evt-1', 'evt-2']);
  });

  it('bezorgt een event niet opnieuw nadat het is verzonden', async () => {
    const store = new FakeOutboxStore([
      { id: 'evt-1', routingKey: 'contract.aanbesteding.gepubliceerd', payload: { eventId: 'evt-1' } },
    ]);
    const { kanaal, uit } = vangKanaal();
    const relay = new OutboxRelay(store, kanaal);

    await relay.verwerkBatch();
    const tweede = await relay.verwerkBatch();

    expect(tweede).toBe(0);
    expect(uit).toHaveLength(1);
  });

  it('markeert niets verzonden als de broker het bericht weigert', async () => {
    const store = new FakeOutboxStore([{ id: 'evt-1', routingKey: 'contract.x', payload: {} }]);
    const kanaal: KanaalPublish = { publish() { return false; } };
    const relay = new OutboxRelay(store, kanaal);

    const aantal = await relay.verwerkBatch();

    expect(aantal).toBe(0);
    expect(store.verzonden).toEqual([]);
  });
});
