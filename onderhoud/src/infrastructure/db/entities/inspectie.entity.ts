import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OnderhoudEntity } from './onderhoud.entity';

@Entity({ name: 'inspectie' })
export class InspectieEntity {
  @PrimaryColumn()
  inspectieId: string;

  @Column()
  onderhoudId: string;

  @Column({ type: 'timestamptz' })
  datum: Date;

  @Column()
  oordeel: string;

  @Column({ type: 'text', nullable: true })
  opmerkingen: string | null;

  @ManyToOne(() => OnderhoudEntity, (o) => o.inspecties, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'onderhoudId' })
  onderhoud: OnderhoudEntity;
}
