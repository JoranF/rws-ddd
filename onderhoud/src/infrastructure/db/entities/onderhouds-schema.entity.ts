import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'onderhouds_schema' })
export class OnderhoudsSchemaEntity {
  @PrimaryColumn()
  schemaId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  contractId: string;

  @Column()
  aannemer: string;

  @Column({ type: 'timestamptz' })
  periodeStart: Date;

  @Column({ type: 'timestamptz' })
  periodeEind: Date;

  @Column({ type: 'jsonb' })
  momenten: Array<{ datum: string; omschrijving: string }>;
}
