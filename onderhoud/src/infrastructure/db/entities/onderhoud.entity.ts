import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { InspectieEntity } from './inspectie.entity';
import { FactuurEntity } from './factuur.entity';

@Entity({ name: 'onderhoud' })
export class OnderhoudEntity {
  @PrimaryColumn()
  onderhoudId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  status: string;

  @Column()
  aanleidingSoort: string;

  @Column({ type: 'text', nullable: true })
  storingId: string | null;

  @Column({ type: 'text', nullable: true })
  incidentId: string | null;

  @Column({ type: 'text', nullable: true })
  bevinding: string | null;

  @Column({ type: 'text', nullable: true })
  ernst: string | null;

  @Column({ type: 'text', nullable: true })
  contractId: string | null;

  @Column({ type: 'text', nullable: true })
  aannemerId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  gestartOp: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  afgerondOp: Date | null;

  @Column({ type: 'text', nullable: true })
  resultaat: string | null;

  @OneToMany(() => InspectieEntity, (i) => i.onderhoud, { cascade: true, eager: true })
  inspecties: InspectieEntity[];

  @OneToMany(() => FactuurEntity, (f) => f.onderhoud, { cascade: true, eager: true })
  facturen: FactuurEntity[];
}
