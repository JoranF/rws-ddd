-- CreateTable
CREATE TABLE "BekendKunstwerk" (
    "kunstwerkId" TEXT NOT NULL,
    "type" TEXT,
    "locatie" TEXT,
    "inGebruik" BOOLEAN NOT NULL DEFAULT true,
    "bijgewerktOp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BekendKunstwerk_pkey" PRIMARY KEY ("kunstwerkId")
);

-- CreateTable
CREATE TABLE "VerwerktEvent" (
    "eventId" TEXT NOT NULL,
    "verwerktOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerwerktEvent_pkey" PRIMARY KEY ("eventId")
);
