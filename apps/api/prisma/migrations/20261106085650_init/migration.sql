-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('COMPANY_ADMIN', 'COMPANY_MEMBER');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'REFRESH');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('COLLECT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "RunOutcome" AS ENUM ('RUNNING', 'SUCCESS_NEW', 'SUCCESS_NONE', 'FAILED');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('NEW', 'UPDATED', 'CLOSED', 'CANCELLED', 'AWARDED');

-- CreateEnum
CREATE TYPE "SavedStatus" AS ENUM ('TO_REVIEW', 'INTERESTED', 'APPLYING', 'IGNORED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DAILY_DIGEST');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "global_role" "GlobalRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "description" TEXT,
    "main_sector" TEXT,
    "secondary_sectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT,
    "address" TEXT,
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'COMPANY_MEMBER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_preferences" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Veille principale',
    "sectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords_include" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords_exclude" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "procedure_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budget_min" BIGINT,
    "budget_max" BIGINT,
    "min_score" INTEGER NOT NULL DEFAULT 40,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "watch_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "access_method" TEXT NOT NULL,
    "frequency_cron" TEXT NOT NULL DEFAULT '0 7 * * *',
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_success_at" TIMESTAMPTZ,
    "error_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collector_jobs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "kind" "JobKind" NOT NULL DEFAULT 'COLLECT',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "requested_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "collector_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "job_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "outcome" "RunOutcome" NOT NULL DEFAULT 'RUNNING',
    "publications_found" INTEGER NOT NULL DEFAULT 0,
    "items_found" INTEGER NOT NULL DEFAULT 0,
    "items_new" INTEGER NOT NULL DEFAULT 0,
    "items_updated" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "source_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_publications" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "external_ref" TEXT NOT NULL,
    "title" TEXT,
    "publication_date" DATE,
    "page_url" TEXT,
    "file_url" TEXT,
    "sha256" TEXT,
    "etag" TEXT,
    "storage_key" TEXT,
    "page_count" INTEGER,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsed_at" TIMESTAMPTZ,

    CONSTRAINT "source_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "publication_id" UUID,
    "content_hash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "organization" TEXT,
    "description" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "procedure_type" TEXT,
    "location" TEXT,
    "publication_date" DATE,
    "submission_deadline" TIMESTAMPTZ,
    "deadline_has_time" BOOLEAN NOT NULL DEFAULT false,
    "estimated_budget" BIGINT,
    "budget_tax_basis" TEXT,
    "funding_source" TEXT,
    "eligibility_requirements" JSONB NOT NULL DEFAULT '[]',
    "required_documents" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "missing_or_uncertain_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TenderStatus" NOT NULL DEFAULT 'NEW',
    "source_url" TEXT NOT NULL,
    "source_pages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "raw_text" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "extraction_model" TEXT,
    "extracted_at" TIMESTAMPTZ,
    "collected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_documents" (
    "id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "mime" TEXT,
    "sha256" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_matches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "preference_id" UUID,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "matched_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tender_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_tenders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "user_id" UUID,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "status" "SavedStatus" NOT NULL DEFAULT 'TO_REVIEW',
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "saved_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL DEFAULT 'DAILY_DIGEST',
    "digest_date" DATE NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tender_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "to" TEXT[],
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" UUID NOT NULL,
    "run_date" DATE NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "error" TEXT,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "company_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "company_members_user_id_idx" ON "company_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_members_company_id_user_id_key" ON "company_members"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "watch_preferences_company_id_idx" ON "watch_preferences"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_code_key" ON "sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "collector_jobs_idempotency_key_key" ON "collector_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "collector_jobs_status_created_at_idx" ON "collector_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "source_runs_source_id_started_at_idx" ON "source_runs"("source_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "source_publications_source_id_external_ref_key" ON "source_publications"("source_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "tenders_content_hash_key" ON "tenders"("content_hash");

-- CreateIndex
CREATE INDEX "tenders_submission_deadline_idx" ON "tenders"("submission_deadline");

-- CreateIndex
CREATE INDEX "tenders_publication_date_idx" ON "tenders"("publication_date");

-- CreateIndex
CREATE UNIQUE INDEX "tender_documents_tender_id_url_key" ON "tender_documents"("tender_id", "url");

-- CreateIndex
CREATE INDEX "tender_matches_company_id_created_at_idx" ON "tender_matches"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tender_matches_company_id_tender_id_key" ON "tender_matches"("company_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_tenders_company_id_tender_id_key" ON "saved_tenders"("company_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_company_id_digest_date_idx" ON "notifications"("company_id", "digest_date");

-- CreateIndex
CREATE INDEX "email_outbox_created_at_idx" ON "email_outbox"("created_at");

-- CreateIndex
CREATE INDEX "pipeline_runs_run_date_idx" ON "pipeline_runs"("run_date");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_preferences" ADD CONSTRAINT "watch_preferences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collector_jobs" ADD CONSTRAINT "collector_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "collector_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_publications" ADD CONSTRAINT "source_publications_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "source_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_documents" ADD CONSTRAINT "tender_documents_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_matches" ADD CONSTRAINT "tender_matches_preference_id_fkey" FOREIGN KEY ("preference_id") REFERENCES "watch_preferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_tenders" ADD CONSTRAINT "saved_tenders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_tenders" ADD CONSTRAINT "saved_tenders_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_tenders" ADD CONSTRAINT "saved_tenders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
