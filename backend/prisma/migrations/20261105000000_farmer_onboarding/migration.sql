CREATE TYPE "FarmerApplicationStatus" AS ENUM (
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'CHANGES_REQUESTED'
);

CREATE TYPE "FarmerExperience" AS ENUM (
    'BEGINNER',
    'SOME_EXPERIENCE',
    'EXPERIENCED'
);

CREATE TABLE "farmer_applications" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "locality" VARCHAR(160) NOT NULL,
    "pin_code" VARCHAR(6) NOT NULL,
    "address" VARCHAR(300),
    "preferred_language" VARCHAR(2) NOT NULL DEFAULT 'en',
    "experience" "FarmerExperience",
    "cultivation_space" VARCHAR(80),
    "training_interest" BOOLEAN,
    "consent_at" TIMESTAMPTZ(6) NOT NULL,
    "consent_version" VARCHAR(40) NOT NULL,
    "promotional_consent" BOOLEAN NOT NULL DEFAULT false,
    "status" "FarmerApplicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "applicant_message" VARCHAR(1000),
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "farmer_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farmer_application_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "FarmerApplicationStatus",
    "to_status" "FarmerApplicationStatus" NOT NULL,
    "actor_id" UUID,
    "internal_note" VARCHAR(1000),
    "applicant_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_application_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "phone_e164" VARCHAR(16) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "ip_hash" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "resend_available_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "csrf_token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "farmer_applications_reference_key"
    ON "farmer_applications"("reference");
CREATE UNIQUE INDEX "farmer_applications_user_id_key"
    ON "farmer_applications"("user_id");
CREATE INDEX "farmer_applications_status_submitted_at_idx"
    ON "farmer_applications"("status", "submitted_at");
CREATE INDEX "farmer_applications_district_locality_idx"
    ON "farmer_applications"("district", "locality");
CREATE INDEX "farmer_application_history_application_id_created_at_idx"
    ON "farmer_application_history"("application_id", "created_at");
CREATE INDEX "farmer_application_history_actor_id_created_at_idx"
    ON "farmer_application_history"("actor_id", "created_at");
CREATE INDEX "otp_challenges_phone_e164_created_at_idx"
    ON "otp_challenges"("phone_e164", "created_at");
CREATE INDEX "otp_challenges_ip_hash_created_at_idx"
    ON "otp_challenges"("ip_hash", "created_at");
CREATE INDEX "otp_challenges_expires_at_consumed_at_idx"
    ON "otp_challenges"("expires_at", "consumed_at");
CREATE UNIQUE INDEX "auth_sessions_token_hash_key"
    ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_id_expires_at_idx"
    ON "auth_sessions"("user_id", "expires_at");
CREATE INDEX "auth_sessions_expires_at_revoked_at_idx"
    ON "auth_sessions"("expires_at", "revoked_at");

ALTER TABLE "farmer_applications"
    ADD CONSTRAINT "farmer_applications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farmer_application_history"
    ADD CONSTRAINT "farmer_application_history_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "farmer_applications"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farmer_application_history"
    ADD CONSTRAINT "farmer_application_history_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
