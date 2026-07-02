import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'verwerkt_event' })
export class VerwerktEventEntity {
  @PrimaryColumn()
  eventId: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  verwerktOp: Date;
}
