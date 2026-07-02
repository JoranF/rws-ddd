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
