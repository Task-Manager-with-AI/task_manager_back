-- CreateTable
CREATE TABLE "GeneratedDiagram" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "diagramType" TEXT NOT NULL,
    "prompt" TEXT,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedDiagram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedDiagram_projectId_diagramType_createdAt_idx" ON "GeneratedDiagram"("projectId", "diagramType", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDiagram_documentId_createdAt_idx" ON "GeneratedDiagram"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedDiagram_createdById_idx" ON "GeneratedDiagram"("createdById");

-- AddForeignKey
ALTER TABLE "GeneratedDiagram" ADD CONSTRAINT "GeneratedDiagram_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDiagram" ADD CONSTRAINT "GeneratedDiagram_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDiagram" ADD CONSTRAINT "GeneratedDiagram_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
