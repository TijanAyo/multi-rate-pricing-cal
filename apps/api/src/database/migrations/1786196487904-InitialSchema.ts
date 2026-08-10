import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Initial schema: users, documents and line items.
 *
 * Two constraints here are worth reading rather than skimming:
 *
 *  - `uq_users_email_active` is a PARTIAL unique index. A plain unique
 *    constraint plus soft delete would let a deleted account hold its email
 *    hostage forever; scoping to live rows frees it on deletion.
 *
 *  - `chk_line_items_discount_pair` enforces that the discount type and value
 *    are either both NULL or both set. Combined with storing the discount as
 *    one value plus a type tag, "percent AND fixed at once" is unrepresentable
 *    at the database level, not merely rejected by the API.
 */
export class InitialSchema1786196487904 implements MigrationInterface {
    name = 'InitialSchema1786196487904'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Supplies uuid_generate_v4(), which the primary keys default to.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."line_items_discount_type_enum" AS ENUM('percent', 'fixed')`);
        await queryRunner.query(`CREATE TABLE "line_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "description" character varying(255) NOT NULL, "quantity" integer NOT NULL, "unit_price" numeric(14,2) NOT NULL, "position" integer NOT NULL DEFAULT '0', "discount_type" "public"."line_items_discount_type_enum", "discount_value" numeric(14,4), "tax_percent" numeric(9,4), "subtotal" numeric(14,2) NOT NULL DEFAULT '0', "discount_amount" numeric(14,2) NOT NULL DEFAULT '0', "tax_amount" numeric(14,2) NOT NULL DEFAULT '0', "line_total" numeric(14,2) NOT NULL DEFAULT '0', "document_id" uuid NOT NULL, CONSTRAINT "chk_line_items_quantity_positive" CHECK ("quantity" >= 1), CONSTRAINT "chk_line_items_discount_pair" CHECK (("discount_type" IS NULL) = ("discount_value" IS NULL)), CONSTRAINT "PK_6d227c876e374542dc9bb44dfb4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_line_items_document" ON "line_items" ("document_id") `);
        await queryRunner.query(`CREATE TYPE "public"."documents_status_enum" AS ENUM('draft', 'finalized')`);
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "title" character varying(255) NOT NULL, "customer" character varying(255) NOT NULL, "issue_date" date NOT NULL, "status" "public"."documents_status_enum" NOT NULL DEFAULT 'draft', "subtotal" numeric(14,2) NOT NULL DEFAULT '0', "total_discount" numeric(14,2) NOT NULL DEFAULT '0', "total_tax" numeric(14,2) NOT NULL DEFAULT '0', "grand_total" numeric(14,2) NOT NULL DEFAULT '0', "user_id" uuid NOT NULL, CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_documents_user_issue_date" ON "documents" ("user_id", "issue_date") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "email" character varying(320) NOT NULL, "password_hash" character varying NOT NULL, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email_active" ON "users" ("email") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "line_items" ADD CONSTRAINT "FK_8b8fda0181ebc7ed0f89eff3d26" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_c7481daf5059307842edef74d73" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_c7481daf5059307842edef74d73"`);
        await queryRunner.query(`ALTER TABLE "line_items" DROP CONSTRAINT "FK_8b8fda0181ebc7ed0f89eff3d26"`);
        await queryRunner.query(`DROP INDEX "public"."uq_users_email_active"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."idx_documents_user_issue_date"`);
        await queryRunner.query(`DROP TABLE "documents"`);
        await queryRunner.query(`DROP TYPE "public"."documents_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."idx_line_items_document"`);
        await queryRunner.query(`DROP TABLE "line_items"`);
        await queryRunner.query(`DROP TYPE "public"."line_items_discount_type_enum"`);
    }

}
