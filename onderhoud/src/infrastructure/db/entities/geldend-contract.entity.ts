import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'geldend_contract' })
export class GeldendContractEntity {
  @PrimaryColumn()
  contractId: string;

  @Index()
  @Column()
  kunstwerkId: string;

  @Column()
  opdrachtnemer: string;

  @Column({ type: 'timestamptz', nullable: true })
  looptijdStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  looptijdEind: Date | null;

  @Column({ default: true })
  actief: boolean;

  @UpdateDateColumn()
  bijgewerktOp: Date;
}
