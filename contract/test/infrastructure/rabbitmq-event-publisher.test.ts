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
