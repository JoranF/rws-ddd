-- CreateTable
CREATE TABLE "Ontwerpeis" (
    "kunstwerkId" TEXT NOT NULL,
    "eisen" JSONB NOT NULL,
    "bijgewerktOp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ontwerpeis_pkey" PRIMARY KEY ("kunstwerkId")
);

-- CreateTable
CREATE TABLE "KpiRapport" (
    "id" TEXT NOT NULL,
    "kunstwerkId" TEXT NOT NULL,
    "incidentId" TEXT,
    "kpiScore" INTEGER,
    "resultaten" JSONB NOT NULL,
    "ontvangenOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiRapport_pkey" PRIMARY KEY ("id")
);
