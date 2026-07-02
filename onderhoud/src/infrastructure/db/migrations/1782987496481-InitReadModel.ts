import { MigrationInterface, QueryRunner } from "typeorm";

export class InitReadModel1782987496481 implements MigrationInterface {
    name = 'InitReadModel1782987496481'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "verwerkt_event" ("eventId" character varying NOT NULL, "verwerktOp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_16bc02c1a33b78d1ec36579d10d" PRIMARY KEY ("eventId"))`);
        await queryRunner.query(`CREATE TABLE "onderhoudseis" ("kunstwerkId" character varying NOT NULL, "eisen" jsonb NOT NULL, "bijgewerktOp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bc9f2ecc3562bc365e0eaafee8b" PRIMARY KEY ("kunstwerkId"))`);
        await queryRunner.query(`CREATE TABLE "bekend_kunstwerk" ("kunstwerkId" character varying NOT NULL, "type" text, "locatie" text, "inGebruik" boolean NOT NULL DEFAULT true, "bijgewerktOp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a182442321ec7c8087d816203a8" PRIMARY KEY ("kunstwerkId"))`);
        await queryRunner.query(`CREATE TABLE "geldend_contract" ("contractId" character varying NOT NULL, "kunstwerkId" character varying NOT NULL, "opdrachtnemer" character varying NOT NULL, "looptijdStart" TIMESTAMP WITH TIME ZONE, "looptijdEind" TIMESTAMP WITH TIME ZONE, "actief" boolean NOT NULL DEFAULT true, "bijgewerktOp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_836c5b1c1996fdfee8d16b267d2" PRIMARY KEY ("contractId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e221a9ebcf6a40304cf8feff56" ON "geldend_contract" ("kunstwerkId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e221a9ebcf6a40304cf8feff56"`);
        await queryRunner.query(`DROP TABLE "geldend_contract"`);
        await queryRunner.query(`DROP TABLE "bekend_kunstwerk"`);
        await queryRunner.query(`DROP TABLE "onderhoudseis"`);
        await queryRunner.query(`DROP TABLE "verwerkt_event"`);
    }

}
