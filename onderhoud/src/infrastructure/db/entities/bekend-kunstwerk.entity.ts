import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'bekend_kunstwerk' })
export class BekendKunstwerkEntity {
  @PrimaryColumn()
  kunstwerkId: string;

  @Column({ type: 'text', nullable: true })
  type: string | null;

  @Column({ type: 'text', nullable: true })
  locatie: string | null;

  @Column({ default: true })
  inGebruik: boolean;

  @UpdateDateColumn()
  bijgewerktOp: Date;
}
