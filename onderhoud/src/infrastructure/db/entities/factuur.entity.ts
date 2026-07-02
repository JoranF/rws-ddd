import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OnderhoudEntity } from './onderhoud.entity';

@Entity({ name: 'factuur' })
export class FactuurEntity {
  @PrimaryColumn()
  factuurId: string;

  @Column()
  onderhoudId: string;

  @Column({ type: 'int' })
  bedragCenten: number;

  @Column({ default: 'EUR' })
  valuta: string;

  @Column()
  status: string;

  @Column({ type: 'timestamptz' })
  ontvangenOp: Date;

  @ManyToOne(() => OnderhoudEntity, (o) => o.facturen, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'onderhoudId' })
  onderhoud: OnderhoudEntity;
}
