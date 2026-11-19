CREATE TYPE "FarmerPurchaseRatePolicyStatus" AS ENUM ('DRAFT', 'APPROVED');

ALTER TABLE "products"
    ADD COLUMN "quality_grade" "QualityGrade",
    ADD CONSTRAINT "products_quality_grade_kind_check"
        CHECK ("quality_grade" IS NULL OR "kind" = 'MUSHROOM');

CREATE UNIQUE INDEX "products_kind_quality_grade_key"
    ON "products"("kind", "quality_grade");

CREATE TABLE "farmer_purchase_rate_policies" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(80) NOT NULL,
    "grade" "QualityGrade" NOT NULL,
    "rate_per_kg" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "status" "FarmerPurchaseRatePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_at" TIMESTAMPTZ(6),
    "approved_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_purchase_rate_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "farmer_purchase_rate_policies_rate_check" CHECK ("rate_per_kg" > 0),
    CONSTRAINT "farmer_purchase_rate_policies_currency_check" CHECK ("currency" = 'INR'),
    CONSTRAINT "farmer_purchase_rate_policies_effective_range_check"
        CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
    CONSTRAINT "farmer_purchase_rate_policies_approval_check"
        CHECK (
            ("status" = 'DRAFT' AND "approved_at" IS NULL AND "approved_by_id" IS NULL)
            OR
            ("status" = 'APPROVED' AND "approved_at" IS NOT NULL AND "approved_by_id" IS NOT NULL)
        )
);

CREATE UNIQUE INDEX "farmer_purchase_rate_policies_reference_key"
    ON "farmer_purchase_rate_policies"("reference");
CREATE UNIQUE INDEX "farmer_purchase_rate_policies_grade_effective_from_key"
    ON "farmer_purchase_rate_policies"("grade", "effective_from");
CREATE INDEX "farmer_purchase_rate_policies_grade_status_effective_from_e_idx"
    ON "farmer_purchase_rate_policies"("grade", "status", "effective_from", "effective_to");

ALTER TABLE "farmer_payable_ledger"
    ADD COLUMN "harvest_grade_result_id" UUID,
    ADD COLUMN "pricing_policy_id" UUID,
    ADD COLUMN "quality_grade" "QualityGrade",
    ADD COLUMN "accepted_quantity" DECIMAL(14,3),
    ADD COLUMN "unit_code" VARCHAR(20),
    ADD COLUMN "rate_per_kg" DECIMAL(14,2),
    ADD COLUMN "pricing_policy_reference" VARCHAR(80),
    ADD CONSTRAINT "farmer_payable_harvest_snapshot_check"
        CHECK (
            (
                "harvest_grade_result_id" IS NULL
                AND "pricing_policy_id" IS NULL
                AND "quality_grade" IS NULL
                AND "accepted_quantity" IS NULL
                AND "unit_code" IS NULL
                AND "rate_per_kg" IS NULL
                AND "pricing_policy_reference" IS NULL
            )
            OR
            (
                "harvest_grade_result_id" IS NOT NULL
                AND "pricing_policy_id" IS NOT NULL
                AND "quality_grade" IS NOT NULL
                AND "accepted_quantity" IS NOT NULL
                AND "accepted_quantity" > 0
                AND "unit_code" = 'kg'
                AND "rate_per_kg" IS NOT NULL
                AND "rate_per_kg" > 0
                AND "pricing_policy_reference" IS NOT NULL
                AND length(trim("pricing_policy_reference")) > 0
            )
        );

CREATE UNIQUE INDEX "farmer_payable_ledger_harvest_grade_result_id_key"
    ON "farmer_payable_ledger"("harvest_grade_result_id");

ALTER TABLE "farmer_purchase_rate_policies"
    ADD CONSTRAINT "farmer_purchase_rate_policies_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farmer_purchase_rate_policies"
    ADD CONSTRAINT "farmer_purchase_rate_policies_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farmer_payable_ledger"
    ADD CONSTRAINT "farmer_payable_ledger_harvest_grade_result_id_fkey"
    FOREIGN KEY ("harvest_grade_result_id") REFERENCES "harvest_grade_results"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farmer_payable_ledger"
    ADD CONSTRAINT "farmer_payable_ledger_pricing_policy_id_fkey"
    FOREIGN KEY ("pricing_policy_id") REFERENCES "farmer_purchase_rate_policies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_approved_farmer_rate_policy_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."status" = 'APPROVED' THEN
        RAISE EXCEPTION 'Approved farmer purchase rate policies are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "farmer_purchase_rate_policies_immutable"
BEFORE UPDATE OR DELETE ON "farmer_purchase_rate_policies"
FOR EACH ROW
EXECUTE FUNCTION "prevent_approved_farmer_rate_policy_mutation"();

CREATE FUNCTION "prevent_farmer_payable_ledger_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Farmer payable ledger entries are immutable; create a linked correction or reversal';
    RETURN NULL;
END;
$$;

CREATE TRIGGER "farmer_payable_ledger_immutable"
BEFORE UPDATE OR DELETE ON "farmer_payable_ledger"
FOR EACH ROW
EXECUTE FUNCTION "prevent_farmer_payable_ledger_mutation"();
