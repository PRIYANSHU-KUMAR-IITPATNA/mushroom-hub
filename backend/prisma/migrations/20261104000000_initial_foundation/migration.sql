-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingRegistrationStatus" AS ENUM ('REGISTERED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'REPORTING', 'COMPLETED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "HarvestStatus" AS ENUM ('SUBMITTED', 'RECEIVED', 'WEIGHED', 'GRADED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QualityGrade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "HarvestDecisionStatus" AS ENUM ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('MUSHROOM', 'MUSHROOM_BAG');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('HARVEST_RECEIPT', 'RESERVATION', 'RESERVATION_RELEASE', 'DISPATCH', 'SPOILAGE', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "BuyerOrderStatus" AS ENUM ('PLACED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'READY', 'DISPATCHED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('FARMER_PAYOUT', 'BUYER_RECEIPT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CREDIT', 'DEBIT', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentAllocationType" AS ENUM ('ALLOCATION', 'REVERSAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_e164" VARCHAR(16),
    "phone_verified_at" TIMESTAMPTZ(6),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "revoked_by_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "grant_reason" VARCHAR(500) NOT NULL,
    "revocation_reason" VARCHAR(500),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "locality" VARCHAR(160) NOT NULL,
    "pin_code" VARCHAR(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "farmer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "contact_name" VARCHAR(120) NOT NULL,
    "business_name" VARCHAR(160) NOT NULL,
    "business_type" VARCHAR(40) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "locality" VARCHAR(160) NOT NULL,
    "pin_code" VARCHAR(6) NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "buyer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_verifications" (
    "id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "evidence_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewer_id" UUID,
    "reason" VARCHAR(1000),
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "farmer_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "location" VARCHAR(240) NOT NULL,
    "capacity" INTEGER,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_registrations" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "status" "TrainingRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_attendance" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" UUID,
    "notes" TEXT,

    CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mushroom_bag_batches" (
    "id" UUID NOT NULL,
    "batch_code" VARCHAR(80) NOT NULL,
    "produced_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "quantity_produced" DECIMAL(14,3) NOT NULL,
    "quantity_available" DECIMAL(14,3) NOT NULL,
    "unit_code" VARCHAR(20) NOT NULL DEFAULT 'bag',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mushroom_bag_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bag_distributions" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "distributed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_by_id" UUID,

    CONSTRAINT "bag_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_records" (
    "id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "distribution_id" UUID,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "started_at" TIMESTAMPTZ(6),
    "reported_at" TIMESTAMPTZ(6),
    "expected_yield_kg" DECIMAL(14,3),
    "actual_yield_kg" DECIMAL(14,3),
    "notes" TEXT,
    "reported_by_id" UUID,

    CONSTRAINT "production_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_centres" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_submissions" (
    "id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "production_id" UUID,
    "status" "HarvestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_weight_kg" DECIMAL(14,3),
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collection_centre_id" UUID,
    "received_at" TIMESTAMPTZ(6),
    "received_by_id" UUID,

    CONSTRAINT "harvest_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weighing_records" (
    "id" UUID NOT NULL,
    "harvest_id" UUID NOT NULL,
    "collection_centre_id" UUID NOT NULL,
    "gross_weight_kg" DECIMAL(14,3) NOT NULL,
    "tare_weight_kg" DECIMAL(14,3) NOT NULL,
    "net_weight_kg" DECIMAL(14,3) NOT NULL,
    "scale_reference" VARCHAR(100),
    "weighed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weighed_by_id" UUID NOT NULL,

    CONSTRAINT "weighing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_grade_results" (
    "id" UUID NOT NULL,
    "harvest_id" UUID NOT NULL,
    "grade" "QualityGrade" NOT NULL,
    "inspected_weight_kg" DECIMAL(14,3) NOT NULL,
    "accepted_weight_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rejected_weight_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "rate_per_kg" DECIMAL(14,2),
    "criteria_version" VARCHAR(40),
    "inspected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_grade_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_decisions" (
    "id" UUID NOT NULL,
    "harvest_id" UUID NOT NULL,
    "status" "HarvestDecisionStatus" NOT NULL,
    "reason" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID NOT NULL,

    CONSTRAINT "harvest_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "unit_code" VARCHAR(20) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" UUID NOT NULL,
    "batch_code" VARCHAR(80) NOT NULL,
    "product_id" UUID NOT NULL,
    "harvest_id" UUID,
    "grade_result_id" UUID,
    "collection_centre_id" UUID NOT NULL,
    "received_quantity" DECIMAL(14,3) NOT NULL,
    "quantity_on_hand" DECIMAL(14,3) NOT NULL,
    "quantity_reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "on_hand_delta" DECIMAL(14,3) NOT NULL,
    "reserved_delta" DECIMAL(14,3) NOT NULL,
    "order_item_id" UUID,
    "reversal_of_id" UUID,
    "reason" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_orders" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "buyer_id" UUID NOT NULL,
    "status" "BuyerOrderStatus" NOT NULL DEFAULT 'PLACED',
    "fulfillment" "FulfillmentMethod" NOT NULL,
    "delivery_address" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "placed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "buyer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_code" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',

    CONSTRAINT "buyer_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_records" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reference" VARCHAR(80),
    "dispatched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    "recipient" VARCHAR(160),
    "proof_object_key" TEXT,
    "recorded_by_id" UUID,
    "notes" TEXT,

    CONSTRAINT "dispatch_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_items" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "dispatch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_payable_ledger" (
    "id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "harvest_decision_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "source_reference" VARCHAR(120) NOT NULL,
    "reversal_of_id" UUID,
    "note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_payable_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_receivable_ledger" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "order_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "source_reference" VARCHAR(120) NOT NULL,
    "reversal_of_id" UUID,
    "due_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_receivable_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(160),
    "transfer_at" TIMESTAMPTZ(6),
    "reversal_of_id" UUID,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "farmer_payable_entry_id" UUID,
    "buyer_receivable_entry_id" UUID,
    "type" "PaymentAllocationType" NOT NULL DEFAULT 'ALLOCATION',
    "reversal_of_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "incurred_at" TIMESTAMPTZ(6) NOT NULL,
    "description" TEXT,
    "receipt_object_key" TEXT,
    "reversal_of_id" UUID,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "request_id" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "operation" VARCHAR(120) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "resource_type" VARCHAR(100),
    "resource_id" VARCHAR(100),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_role_id_revoked_at_idx" ON "user_roles"("user_id", "role_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_profiles_user_id_key" ON "farmer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "farmer_profiles_district_locality_idx" ON "farmer_profiles"("district", "locality");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_profiles_user_id_key" ON "buyer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "buyer_profiles_district_business_name_idx" ON "buyer_profiles"("district", "business_name");

-- CreateIndex
CREATE INDEX "farmer_verifications_status_submitted_at_idx" ON "farmer_verifications"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "farmer_verifications_farmer_id_submitted_at_idx" ON "farmer_verifications"("farmer_id", "submitted_at");

-- CreateIndex
CREATE INDEX "training_sessions_status_starts_at_idx" ON "training_sessions"("status", "starts_at");

-- CreateIndex
CREATE INDEX "training_registrations_farmer_id_registered_at_idx" ON "training_registrations"("farmer_id", "registered_at");

-- CreateIndex
CREATE UNIQUE INDEX "training_registrations_session_id_farmer_id_key" ON "training_registrations"("session_id", "farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_attendance_registration_id_key" ON "training_attendance"("registration_id");

-- CreateIndex
CREATE INDEX "training_attendance_recorded_at_idx" ON "training_attendance"("recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "mushroom_bag_batches_batch_code_key" ON "mushroom_bag_batches"("batch_code");

-- CreateIndex
CREATE INDEX "mushroom_bag_batches_expires_at_quantity_available_idx" ON "mushroom_bag_batches"("expires_at", "quantity_available");

-- CreateIndex
CREATE INDEX "bag_distributions_farmer_id_distributed_at_idx" ON "bag_distributions"("farmer_id", "distributed_at");

-- CreateIndex
CREATE INDEX "bag_distributions_batch_id_distributed_at_idx" ON "bag_distributions"("batch_id", "distributed_at");

-- CreateIndex
CREATE INDEX "production_records_farmer_id_status_started_at_idx" ON "production_records"("farmer_id", "status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "collection_centres_code_key" ON "collection_centres"("code");

-- CreateIndex
CREATE INDEX "harvest_submissions_farmer_id_submitted_at_idx" ON "harvest_submissions"("farmer_id", "submitted_at");

-- CreateIndex
CREATE INDEX "harvest_submissions_status_submitted_at_idx" ON "harvest_submissions"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "weighing_records_harvest_id_weighed_at_idx" ON "weighing_records"("harvest_id", "weighed_at");

-- CreateIndex
CREATE INDEX "harvest_grade_results_grade_inspected_at_idx" ON "harvest_grade_results"("grade", "inspected_at");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_grade_results_harvest_id_grade_key" ON "harvest_grade_results"("harvest_id", "grade");

-- CreateIndex
CREATE INDEX "harvest_decisions_harvest_id_decided_at_idx" ON "harvest_decisions"("harvest_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_kind_active_idx" ON "products"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_batch_code_key" ON "inventory_batches"("batch_code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_grade_result_id_key" ON "inventory_batches"("grade_result_id");

-- CreateIndex
CREATE INDEX "inventory_batches_product_id_expires_at_idx" ON "inventory_batches"("product_id", "expires_at");

-- CreateIndex
CREATE INDEX "inventory_batches_collection_centre_id_product_id_idx" ON "inventory_batches"("collection_centre_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_batch_id_created_at_idx" ON "inventory_movements"("batch_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_order_item_id_idx" ON "inventory_movements"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_orders_reference_key" ON "buyer_orders"("reference");

-- CreateIndex
CREATE INDEX "buyer_orders_buyer_id_placed_at_idx" ON "buyer_orders"("buyer_id", "placed_at");

-- CreateIndex
CREATE INDEX "buyer_orders_status_placed_at_idx" ON "buyer_orders"("status", "placed_at");

-- CreateIndex
CREATE INDEX "buyer_order_items_order_id_idx" ON "buyer_order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_records_reference_key" ON "dispatch_records"("reference");

-- CreateIndex
CREATE INDEX "dispatch_records_order_id_dispatched_at_idx" ON "dispatch_records"("order_id", "dispatched_at");

-- CreateIndex
CREATE INDEX "dispatch_items_order_item_id_idx" ON "dispatch_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_items_dispatch_id_order_item_id_key" ON "dispatch_items"("dispatch_id", "order_item_id");

-- CreateIndex
CREATE INDEX "farmer_payable_ledger_farmer_id_created_at_idx" ON "farmer_payable_ledger"("farmer_id", "created_at");

-- CreateIndex
CREATE INDEX "farmer_payable_ledger_harvest_decision_id_idx" ON "farmer_payable_ledger"("harvest_decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_payable_ledger_farmer_id_source_reference_key" ON "farmer_payable_ledger"("farmer_id", "source_reference");

-- CreateIndex
CREATE INDEX "buyer_receivable_ledger_buyer_id_created_at_idx" ON "buyer_receivable_ledger"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "buyer_receivable_ledger_order_id_idx" ON "buyer_receivable_ledger"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_receivable_ledger_buyer_id_source_reference_key" ON "buyer_receivable_ledger"("buyer_id", "source_reference");

-- CreateIndex
CREATE INDEX "payments_direction_created_at_idx" ON "payments"("direction", "created_at");

-- CreateIndex
CREATE INDEX "payments_reference_idx" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_farmer_payable_entry_id_idx" ON "payment_allocations"("farmer_payable_entry_id");

-- CreateIndex
CREATE INDEX "payment_allocations_buyer_receivable_entry_id_idx" ON "payment_allocations"("buyer_receivable_entry_id");

-- CreateIndex
CREATE INDEX "payment_allocations_reversal_of_id_idx" ON "payment_allocations"("reversal_of_id");

-- CreateIndex
CREATE INDEX "expenses_incurred_at_category_idx" ON "expenses"("incurred_at", "category");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_actor_id_operation_key_key" ON "idempotency_keys"("actor_id", "operation", "key");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_profiles" ADD CONSTRAINT "farmer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_verifications" ADD CONSTRAINT "farmer_verifications_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_verifications" ADD CONSTRAINT "farmer_verifications_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_registrations" ADD CONSTRAINT "training_registrations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_registrations" ADD CONSTRAINT "training_registrations_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "training_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mushroom_bag_batches" ADD CONSTRAINT "mushroom_bag_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bag_distributions" ADD CONSTRAINT "bag_distributions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "mushroom_bag_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bag_distributions" ADD CONSTRAINT "bag_distributions_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bag_distributions" ADD CONSTRAINT "bag_distributions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "bag_distributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_submissions" ADD CONSTRAINT "harvest_submissions_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_submissions" ADD CONSTRAINT "harvest_submissions_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "production_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_submissions" ADD CONSTRAINT "harvest_submissions_collection_centre_id_fkey" FOREIGN KEY ("collection_centre_id") REFERENCES "collection_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_submissions" ADD CONSTRAINT "harvest_submissions_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighing_records" ADD CONSTRAINT "weighing_records_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvest_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighing_records" ADD CONSTRAINT "weighing_records_collection_centre_id_fkey" FOREIGN KEY ("collection_centre_id") REFERENCES "collection_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weighing_records" ADD CONSTRAINT "weighing_records_weighed_by_id_fkey" FOREIGN KEY ("weighed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_grade_results" ADD CONSTRAINT "harvest_grade_results_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvest_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_decisions" ADD CONSTRAINT "harvest_decisions_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvest_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_decisions" ADD CONSTRAINT "harvest_decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_harvest_id_fkey" FOREIGN KEY ("harvest_id") REFERENCES "harvest_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_grade_result_id_fkey" FOREIGN KEY ("grade_result_id") REFERENCES "harvest_grade_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_collection_centre_id_fkey" FOREIGN KEY ("collection_centre_id") REFERENCES "collection_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "buyer_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_orders" ADD CONSTRAINT "buyer_orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_order_items" ADD CONSTRAINT "buyer_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "buyer_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_order_items" ADD CONSTRAINT "buyer_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "buyer_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatch_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "buyer_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_payable_ledger" ADD CONSTRAINT "farmer_payable_ledger_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_payable_ledger" ADD CONSTRAINT "farmer_payable_ledger_harvest_decision_id_fkey" FOREIGN KEY ("harvest_decision_id") REFERENCES "harvest_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_payable_ledger" ADD CONSTRAINT "farmer_payable_ledger_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "farmer_payable_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_payable_ledger" ADD CONSTRAINT "farmer_payable_ledger_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_receivable_ledger" ADD CONSTRAINT "buyer_receivable_ledger_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_receivable_ledger" ADD CONSTRAINT "buyer_receivable_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "buyer_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_receivable_ledger" ADD CONSTRAINT "buyer_receivable_ledger_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "buyer_receivable_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_receivable_ledger" ADD CONSTRAINT "buyer_receivable_ledger_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_farmer_payable_entry_id_fkey" FOREIGN KEY ("farmer_payable_entry_id") REFERENCES "farmer_payable_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_buyer_receivable_entry_id_fkey" FOREIGN KEY ("buyer_receivable_entry_id") REFERENCES "buyer_receivable_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business-shape constraints not expressible in the Prisma schema language.
CREATE UNIQUE INDEX "user_roles_one_active_role_per_user"
  ON "user_roles" ("user_id", "role_id")
  WHERE "revoked_at" IS NULL;

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_reason_state_check"
  CHECK (
    length(trim("grant_reason")) > 0
    AND (
      ("revoked_at" IS NULL AND "revoked_by_id" IS NULL AND "revocation_reason" IS NULL)
      OR
      (
        "revoked_at" IS NOT NULL
        AND "revoked_by_id" IS NOT NULL
        AND length(trim(coalesce("revocation_reason", ''))) > 0
        AND "revoked_at" >= "granted_at"
      )
    )
  );

ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164_format_check"
  CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "farmer_profiles"
  ADD CONSTRAINT "farmer_profiles_pin_code_format_check"
  CHECK ("pin_code" ~ '^[0-9]{6}$');

ALTER TABLE "buyer_profiles"
  ADD CONSTRAINT "buyer_profiles_pin_code_format_check"
  CHECK ("pin_code" ~ '^[0-9]{6}$');

ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_time_window_check"
  CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "training_sessions_capacity_positive_check"
  CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "mushroom_bag_batches"
  ADD CONSTRAINT "mushroom_bag_batches_quantities_check"
  CHECK (
    "quantity_produced" > 0
    AND "quantity_available" >= 0
    AND "quantity_available" <= "quantity_produced"
  );

ALTER TABLE "bag_distributions"
  ADD CONSTRAINT "bag_distributions_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "production_records"
  ADD CONSTRAINT "production_records_yields_nonnegative_check"
  CHECK (
    ("expected_yield_kg" IS NULL OR "expected_yield_kg" >= 0)
    AND ("actual_yield_kg" IS NULL OR "actual_yield_kg" >= 0)
  );

ALTER TABLE "harvest_submissions"
  ADD CONSTRAINT "harvest_submissions_submitted_weight_positive_check"
  CHECK ("submitted_weight_kg" IS NULL OR "submitted_weight_kg" > 0),
  ADD CONSTRAINT "harvest_submissions_receipt_fields_consistent_check"
  CHECK (
    ("collection_centre_id" IS NULL AND "received_at" IS NULL AND "received_by_id" IS NULL)
    OR
    ("collection_centre_id" IS NOT NULL AND "received_at" IS NOT NULL AND "received_by_id" IS NOT NULL)
  );

ALTER TABLE "weighing_records"
  ADD CONSTRAINT "weighing_records_weights_consistent_check"
  CHECK (
    "gross_weight_kg" > 0
    AND "tare_weight_kg" >= 0
    AND "net_weight_kg" > 0
    AND "net_weight_kg" = "gross_weight_kg" - "tare_weight_kg"
  );

ALTER TABLE "harvest_grade_results"
  ADD CONSTRAINT "harvest_grade_results_weights_consistent_check"
  CHECK (
    "inspected_weight_kg" > 0
    AND "accepted_weight_kg" >= 0
    AND "rejected_weight_kg" >= 0
    AND "accepted_weight_kg" + "rejected_weight_kg" <= "inspected_weight_kg"
  );

ALTER TABLE "harvest_decisions"
  ADD CONSTRAINT "harvest_decisions_rejection_reason_check"
  CHECK (
    "status" <> 'REJECTED'
    OR length(trim(coalesce("reason", ''))) > 0
  );

ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_quantities_check"
  CHECK (
    "received_quantity" > 0
    AND "quantity_on_hand" >= 0
    AND "quantity_reserved" >= 0
    AND "quantity_reserved" <= "quantity_on_hand"
  );

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_delta_nonzero_check"
  CHECK ("on_hand_delta" <> 0 OR "reserved_delta" <> 0),
  ADD CONSTRAINT "inventory_movements_type_delta_check"
  CHECK (
    (
      "type" = 'HARVEST_RECEIPT'
      AND "on_hand_delta" > 0
      AND "reserved_delta" = 0
      AND "reversal_of_id" IS NULL
    )
    OR
    (
      "type" = 'RESERVATION'
      AND "on_hand_delta" = 0
      AND "reserved_delta" > 0
      AND "reversal_of_id" IS NULL
    )
    OR
    (
      "type" = 'RESERVATION_RELEASE'
      AND "on_hand_delta" = 0
      AND "reserved_delta" < 0
      AND "reversal_of_id" IS NULL
    )
    OR
    (
      "type" = 'DISPATCH'
      AND "on_hand_delta" < 0
      AND "reserved_delta" = "on_hand_delta"
      AND "reversal_of_id" IS NULL
    )
    OR
    (
      "type" = 'SPOILAGE'
      AND "on_hand_delta" < 0
      AND "reserved_delta" = 0
      AND "reversal_of_id" IS NULL
    )
    OR
    (
      "type" = 'ADJUSTMENT'
      AND "on_hand_delta" <> 0
      AND "reserved_delta" = 0
      AND "reversal_of_id" IS NULL
    )
    OR
    (
      "type" = 'REVERSAL'
      AND "reversal_of_id" IS NOT NULL
    )
  );

ALTER TABLE "buyer_orders"
  ADD CONSTRAINT "buyer_orders_fulfillment_address_check"
  CHECK (
    ("fulfillment" = 'PICKUP' AND "delivery_address" IS NULL)
    OR
    ("fulfillment" = 'DELIVERY' AND length(trim(coalesce("delivery_address", ''))) > 0)
  ),
  ADD CONSTRAINT "buyer_orders_inr_currency_check"
  CHECK ("currency" = 'INR');

ALTER TABLE "buyer_order_items"
  ADD CONSTRAINT "buyer_order_items_quantity_price_check"
  CHECK ("quantity" > 0 AND "unit_price" >= 0),
  ADD CONSTRAINT "buyer_order_items_inr_currency_check"
  CHECK ("currency" = 'INR');

ALTER TABLE "dispatch_items"
  ADD CONSTRAINT "dispatch_items_quantity_positive_check"
  CHECK ("quantity" > 0);

ALTER TABLE "farmer_payable_ledger"
  ADD CONSTRAINT "farmer_payable_ledger_amount_reference_check"
  CHECK ("amount" > 0 AND length(trim("source_reference")) > 0),
  ADD CONSTRAINT "farmer_payable_ledger_inr_currency_check"
  CHECK ("currency" = 'INR'),
  ADD CONSTRAINT "farmer_payable_ledger_reversal_link_check"
  CHECK (
    ("type" = 'REVERSAL' AND "reversal_of_id" IS NOT NULL)
    OR
    ("type" <> 'REVERSAL' AND "reversal_of_id" IS NULL)
  );

ALTER TABLE "buyer_receivable_ledger"
  ADD CONSTRAINT "buyer_receivable_ledger_amount_reference_check"
  CHECK ("amount" > 0 AND length(trim("source_reference")) > 0),
  ADD CONSTRAINT "buyer_receivable_ledger_inr_currency_check"
  CHECK ("currency" = 'INR'),
  ADD CONSTRAINT "buyer_receivable_ledger_reversal_link_check"
  CHECK (
    ("type" = 'REVERSAL' AND "reversal_of_id" IS NOT NULL)
    OR
    ("type" <> 'REVERSAL' AND "reversal_of_id" IS NULL)
  );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive_check"
  CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_inr_currency_check"
  CHECK ("currency" = 'INR');

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_single_ledger_target_check"
  CHECK (
    ("farmer_payable_entry_id" IS NOT NULL AND "buyer_receivable_entry_id" IS NULL)
    OR
    ("farmer_payable_entry_id" IS NULL AND "buyer_receivable_entry_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "payment_allocations_amount_positive_check"
  CHECK ("amount" > 0),
  ADD CONSTRAINT "payment_allocations_reversal_link_check"
  CHECK (
    ("type" = 'ALLOCATION' AND "reversal_of_id" IS NULL)
    OR
    ("type" = 'REVERSAL' AND "reversal_of_id" IS NOT NULL)
  );

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_positive_check"
  CHECK ("amount" > 0),
  ADD CONSTRAINT "expenses_inr_currency_check"
  CHECK ("currency" = 'INR');

ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_keys_nonempty_values_check"
  CHECK (
    length(trim("operation")) > 0
    AND length(trim("key")) > 0
    AND length(trim("request_hash")) > 0
  );
