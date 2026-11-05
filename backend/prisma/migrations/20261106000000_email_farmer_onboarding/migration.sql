ALTER TABLE "users"
    ADD COLUMN "email" VARCHAR(254),
    ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

ALTER TABLE "farmer_profiles"
    ADD COLUMN "block" VARCHAR(100);

ALTER TABLE "farmer_applications"
    ADD COLUMN "contact_phone_e164" VARCHAR(16),
    ADD COLUMN "block" VARCHAR(100);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "email_otp_challenges" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "ip_hash" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "resend_available_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,

    CONSTRAINT "email_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_otp_challenges_email_created_at_idx"
    ON "email_otp_challenges"("email", "created_at");
CREATE INDEX "email_otp_challenges_ip_hash_created_at_idx"
    ON "email_otp_challenges"("ip_hash", "created_at");
CREATE INDEX "email_otp_challenges_expires_at_consumed_at_idx"
    ON "email_otp_challenges"("expires_at", "consumed_at");

ALTER TABLE "email_otp_challenges"
    ADD CONSTRAINT "email_otp_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
