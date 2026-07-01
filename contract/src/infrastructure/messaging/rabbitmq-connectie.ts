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
