import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'storing' })
export class StoringEntity {
  @PrimaryColumn()
  storingId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  omschrijving: string;

  @Column()
  ernst: string;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  onderhoudId: string | null;
}
