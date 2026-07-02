-- CreateTable
CREATE TABLE "Aanbesteding" (
    "id" TEXT NOT NULL,
    "kunstwerkId" TEXT NOT NULL,
    "sluitingsdatum" TIMESTAMP(3) NOT NULL,
    "prijsgewicht" INTEGER NOT NULL,
    "kwaliteitsgewicht" INTEGER NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "Aanbesteding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inschrijving" (
    "id" TEXT NOT NULL,
    "aanbestedingId" TEXT NOT NULL,
    "aannemer" TEXT NOT NULL,
    "prijsCenten" INTEGER NOT NULL,
    "kwaliteitsscore" INTEGER NOT NULL,

    CONSTRAINT "Inschrijving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Onderhoudscontract" (
    "id" TEXT NOT NULL,
    "kunstwerkId" TEXT NOT NULL,
    "opdrachtnemer" TEXT NOT NULL,
    "looptijdStart" TIMESTAMP(3) NOT NULL,
    "looptijdEind" TIMESTAMP(3) NOT NULL,
    "waardeCenten" INTEGER NOT NULL,
    "aanbestedingId" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "Onderhoudscontract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wijziging" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "mutatieCenten" INTEGER NOT NULL,
    "soort" TEXT NOT NULL,
    "reden" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wijziging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prestatieverklaring" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodeStart" TIMESTAMP(3) NOT NULL,
    "periodeEind" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL,
    "bedragCenten" INTEGER NOT NULL,

    CONSTRAINT "Prestatieverklaring_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Inschrijving" ADD CONSTRAINT "Inschrijving_aanbestedingId_fkey" FOREIGN KEY ("aanbestedingId") REFERENCES "Aanbesteding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wijziging" ADD CONSTRAINT "Wijziging_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Onderhoudscontract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestatieverklaring" ADD CONSTRAINT "Prestatieverklaring_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Onderhoudscontract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
