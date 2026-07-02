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
