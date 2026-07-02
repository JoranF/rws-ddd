import { MigrationInterface, QueryRunner } from "typeorm";

export class DomeinTabellen1782988217390 implements MigrationInterface {
    name = 'DomeinTabellen1782988217390'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "storing" ("storingId" character varying NOT NULL, "kunstwerkId" character varying NOT NULL, "omschrijving" character varying NOT NULL, "ernst" character varying NOT NULL, "status" character varying NOT NULL, "onderhoudId" text, CONSTRAINT "PK_92004ebbf876ac5cdf79519e828" PRIMARY KEY ("storingId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fd7c6dfc3878ebb2a72530c148" ON "storing" ("kunstwerkId") `);
        await queryRunner.query(`CREATE TABLE "inspectie" ("inspectieId" character varying NOT NULL, "onderhoudId" character varying NOT NULL, "datum" TIMESTAMP WITH TIME ZONE NOT NULL, "oordeel" character varying NOT NULL, "opmerkingen" text, CONSTRAINT "PK_28df2f94a64929fdc09e42a1d1c" PRIMARY KEY ("inspectieId"))`);
        await queryRunner.query(`CREATE TABLE "factuur" ("factuurId" character varying NOT NULL, "onderhoudId" character varying NOT NULL, "bedragCenten" integer NOT NULL, "valuta" character varying NOT NULL DEFAULT 'EUR', "status" character varying NOT NULL, "ontvangenOp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_cc5e5971b2a5316c69f31ba8bfc" PRIMARY KEY ("factuurId"))`);
        await queryRunner.query(`CREATE TABLE "onderhoud" ("onderhoudId" character varying NOT NULL, "kunstwerkId" character varying NOT NULL, "status" character varying NOT NULL, "aanleidingSoort" character varying NOT NULL, "storingId" text, "incidentId" text, "bevinding" text, "ernst" text, "contractId" text, "aannemerId" text, "gestartOp" TIMESTAMP WITH TIME ZONE, "afgerondOp" TIMESTAMP WITH TIME ZONE, "resultaat" text, CONSTRAINT "PK_f618dc9accb92b82f34c85bcdf0" PRIMARY KEY ("onderhoudId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_af6ca1dfa7b02697837267c424" ON "onderhoud" ("kunstwerkId") `);
        await queryRunner.query(`CREATE TABLE "onderhouds_schema" ("schemaId" character varying NOT NULL, "kunstwerkId" character varying NOT NULL, "contractId" character varying NOT NULL, "aannemer" character varying NOT NULL, "periodeStart" TIMESTAMP WITH TIME ZONE NOT NULL, "periodeEind" TIMESTAMP WITH TIME ZONE NOT NULL, "momenten" jsonb NOT NULL, CONSTRAINT "PK_27b8d6ed95808f9e0472c6d63e7" PRIMARY KEY ("schemaId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_170d6165579e5e3d5e83bb77b7" ON "onderhouds_schema" ("kunstwerkId") `);
        await queryRunner.query(`ALTER TABLE "inspectie" ADD CONSTRAINT "FK_572107e103503e519b32d9ce5ce" FOREIGN KEY ("onderhoudId") REFERENCES "onderhoud"("onderhoudId") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "factuur" ADD CONSTRAINT "FK_2f8047b3bdbe93622585d7000b2" FOREIGN KEY ("onderhoudId") REFERENCES "onderhoud"("onderhoudId") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "factuur" DROP CONSTRAINT "FK_2f8047b3bdbe93622585d7000b2"`);
        await queryRunner.query(`ALTER TABLE "inspectie" DROP CONSTRAINT "FK_572107e103503e519b32d9ce5ce"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_170d6165579e5e3d5e83bb77b7"`);
        await queryRunner.query(`DROP TABLE "onderhouds_schema"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_af6ca1dfa7b02697837267c424"`);
        await queryRunner.query(`DROP TABLE "onderhoud"`);
        await queryRunner.query(`DROP TABLE "factuur"`);
        await queryRunner.query(`DROP TABLE "inspectie"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd7c6dfc3878ebb2a72530c148"`);
        await queryRunner.query(`DROP TABLE "storing"`);
    }

}
