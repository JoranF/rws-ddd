import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'onderhoudseis' })
export class OnderhoudseisEntity {
  @PrimaryColumn()
  kunstwerkId: string;

  @Column({ type: 'jsonb' })
  eisen: unknown;

  @UpdateDateColumn()
  bijgewerktOp: Date;
}
