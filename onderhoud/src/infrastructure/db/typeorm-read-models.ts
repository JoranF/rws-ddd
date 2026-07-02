import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BekendKunstwerkEntity } from './entities/bekend-kunstwerk.entity';
import { GeldendContractEntity } from './entities/geldend-contract.entity';
import { OnderhoudseisEntity } from './entities/onderhoudseis.entity';
import { VerwerktEventEntity } from './entities/verwerkt-event.entity';
import type { ContractenReadModel, KunstwerkenReadModel } from '../../application/ports';
import type { KunstwerkId } from '../../domain/gedeeld/waarden';
import type { EventDedup } from '../messaging/consumer-helpers';
import type { BeheerStore } from '../messaging/beheer-consumer';
import type { ContractStore } from '../messaging/contract-consumer';

@Injectable()
export class TypeOrmEventDedup implements EventDedup {
  constructor(@InjectRepository(VerwerktEventEntity) private readonly repo: Repository<VerwerktEventEntity>) {}
  async isVerwerkt(eventId: string): Promise<boolean> {
    return (await this.repo.findOne({ where: { eventId } })) !== null;
  }
  async markeerVerwerkt(eventId: string): Promise<void> {
    await this.repo.save(this.repo.create({ eventId }));
  }
}

@Injectable()
export class TypeOrmKunstwerkenReadModel implements KunstwerkenReadModel, BeheerStore {
  constructor(
    @InjectRepository(BekendKunstwerkEntity) private readonly kunstwerken: Repository<BekendKunstwerkEntity>,
    @InjectRepository(OnderhoudseisEntity) private readonly eisen: Repository<OnderhoudseisEntity>,
  ) {}

  async isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> {
    const rij = await this.kunstwerken.findOne({ where: { kunstwerkId: id.waarde } });
    return rij?.inGebruik ?? false;
  }
  async upsertKunstwerk(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void> {
    await this.kunstwerken.save(this.kunstwerken.create({ kunstwerkId, type, locatie, inGebruik: true }));
  }
  async markeerBuitenGebruik(kunstwerkId: string): Promise<void> {
    const bestaand = await this.kunstwerken.findOne({ where: { kunstwerkId } });
    await this.kunstwerken.save(this.kunstwerken.create({ ...bestaand, kunstwerkId, inGebruik: false }));
  }
  async bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void> {
    await this.eisen.save(this.eisen.create({ kunstwerkId, eisen }));
  }
}

@Injectable()
export class TypeOrmContractenReadModel implements ContractenReadModel, ContractStore {
  constructor(@InjectRepository(GeldendContractEntity) private readonly repo: Repository<GeldendContractEntity>) {}

  async geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null> {
    const rij = await this.repo.findOne({
      where: { kunstwerkId: id.waarde, actief: true },
      order: { bijgewerktOp: 'DESC' },
    });
    return rij ? { contractId: rij.contractId, opdrachtnemer: rij.opdrachtnemer } : null;
  }
  async upsertGegund(p: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijdStart: string | null; looptijdEind: string | null }): Promise<void> {
    await this.repo.save(this.repo.create({
      contractId: p.contractId,
      kunstwerkId: p.kunstwerkId,
      opdrachtnemer: p.opdrachtnemer,
      looptijdStart: p.looptijdStart ? new Date(p.looptijdStart) : null,
      looptijdEind: p.looptijdEind ? new Date(p.looptijdEind) : null,
      actief: true,
    }));
  }
  async markeerAfgerond(contractId: string): Promise<void> {
    await this.repo.update({ contractId }, { actief: false });
  }
}
