-- CreateEnum
CREATE TYPE "Module" AS ENUM ('PLATFORM', 'ITSM', 'ITOM', 'HRSD', 'CSM', 'FSM', 'SPM', 'SECOPS', 'IRM');

-- CreateEnum
CREATE TYPE "ScenarioKind" AS ENUM ('SCRIPT_LAB');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'AUTH_EXPIRED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "Layer" AS ENUM ('STRUCTURE', 'STATIC', 'FUNCTIONAL', 'REVIEW');

-- CreateEnum
CREATE TYPE "LayerStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdiConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "oauthScope" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "lastHealth" JSONB,
    "lastHealthAt" TIMESTAMP(3),
    "detectedRelease" TEXT,
    "snowUserName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdiConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "kind" "ScenarioKind" NOT NULL DEFAULT 'SCRIPT_LAB',
    "module" "Module" NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "releaseFamily" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioVersion" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjective" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioObjective" (
    "scenarioId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,

    CONSTRAINT "ScenarioObjective_pkey" PRIMARY KEY ("scenarioId","objectiveId")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scenarioVersionId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'QUEUED',
    "instanceName" TEXT NOT NULL,
    "hintsRevealed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayerResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "layer" "Layer" NOT NULL,
    "status" "LayerStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "details" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "LayerResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "layerResultId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "why" TEXT,
    "fix" TEXT,
    "docsUrl" TEXT,
    "targetAlias" TEXT,
    "targetTable" TEXT,
    "targetSysId" TEXT,
    "targetName" TEXT,
    "line" INTEGER,
    "column" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioProgress" (
    "userId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "hintsRevealed" INTEGER NOT NULL DEFAULT 0,
    "firstPassedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioProgress_pkey" PRIMARY KEY ("userId","scenarioId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PdiConnection_userId_key" ON "PdiConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioVersion_scenarioId_version_key" ON "ScenarioVersion"("scenarioId", "version");

-- CreateIndex
CREATE INDEX "Attempt_userId_createdAt_idx" ON "Attempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_scenarioVersionId_idx" ON "Attempt"("scenarioVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "LayerResult_attemptId_layer_key" ON "LayerResult"("attemptId", "layer");

-- CreateIndex
CREATE INDEX "Finding_checkId_idx" ON "Finding"("checkId");

-- CreateIndex
CREATE INDEX "Finding_layerResultId_idx" ON "Finding"("layerResultId");

-- AddForeignKey
ALTER TABLE "PdiConnection" ADD CONSTRAINT "PdiConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioVersion" ADD CONSTRAINT "ScenarioVersion_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioObjective" ADD CONSTRAINT "ScenarioObjective_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioObjective" ADD CONSTRAINT "ScenarioObjective_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "LearningObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "ScenarioVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayerResult" ADD CONSTRAINT "LayerResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_layerResultId_fkey" FOREIGN KEY ("layerResultId") REFERENCES "LayerResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioProgress" ADD CONSTRAINT "ScenarioProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioProgress" ADD CONSTRAINT "ScenarioProgress_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
