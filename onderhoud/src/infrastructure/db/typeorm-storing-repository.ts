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
