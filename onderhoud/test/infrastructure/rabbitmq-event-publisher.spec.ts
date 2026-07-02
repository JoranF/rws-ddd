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
