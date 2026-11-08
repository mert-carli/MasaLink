-- =============================================================================
-- MASALINK — POSTGRESQL ROW-LEVEL SECURITY (RLS) POLİTİKALARI
-- =============================================================================
-- Bu migration, çok kiracılı (multi-tenant) veri izolasyonunu doğrudan
-- PostgreSQL veritabanı motoru seviyesinde zorunlu kılar.
--
-- Mekanizma:
-- 1. Her oturum / transaction başında `app.current_tenant_id` değişkeni ayarlanır:
--    SELECT set_config('app.current_tenant_id', 'tenant-artisan-burger', true);
-- 2. PostgreSQL RLS motoru, satırdaki `tenantId` bu ayarla eşleşmiyorsa
--    satırı gizler (SELECT boş döner) ve yazma girişimlerini (INSERT/UPDATE/DELETE) reddeder.
-- 3. Değişken ayarlanmamışsa (boş/null ise), `USING` koşulu false döner ve
--    hiçbir veri sızmaz (Fail-safe by default).
-- 4. Sistem tohumlaması veya migrasyonlar için `app.bypass_rls = 'true'` ayarlanabilir.
-- =============================================================================

-- Yardımcı fonksiyon: Geçerli oturum için kiracıyı ayarlar
CREATE OR REPLACE FUNCTION masalink_set_tenant(p_tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1. ROW-LEVEL SECURITY AKTİVASYONU (ENABLE & FORCE)
-- (FORCE: Tablo sahibi veya süper kullanıcılar dahi RLS kurallarını atlayamaz)
-- -----------------------------------------------------------------------------

ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Table" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Table" FORCE ROW LEVEL SECURITY;

ALTER TABLE "TableSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TableSession" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ProductOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductOption" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ingredient" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Recipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Recipe" FORCE ROW LEVEL SECURITY;

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" FORCE ROW LEVEL SECURITY;

ALTER TABLE "OrderDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderDraft" FORCE ROW LEVEL SECURITY;

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. İZOLASYON POLİTİKALARI (CREATE POLICY)
-- -----------------------------------------------------------------------------

-- Branch
CREATE POLICY "tenant_isolation_branch" ON "Branch"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Role
CREATE POLICY "tenant_isolation_role" ON "Role"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- User
CREATE POLICY "tenant_isolation_user" ON "User"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Table
CREATE POLICY "tenant_isolation_table" ON "Table"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- TableSession
CREATE POLICY "tenant_isolation_session" ON "TableSession"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Category
CREATE POLICY "tenant_isolation_category" ON "Category"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Product
CREATE POLICY "tenant_isolation_product" ON "Product"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- ProductOption
CREATE POLICY "tenant_isolation_product_option" ON "ProductOption"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Order
CREATE POLICY "tenant_isolation_order" ON "Order"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- OrderItem
CREATE POLICY "tenant_isolation_order_item" ON "OrderItem"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Payment
CREATE POLICY "tenant_isolation_payment" ON "Payment"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Ingredient
CREATE POLICY "tenant_isolation_ingredient" ON "Ingredient"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Recipe
CREATE POLICY "tenant_isolation_recipe" ON "Recipe"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- StockMovement
CREATE POLICY "tenant_isolation_stock_movement" ON "StockMovement"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- OrderDraft
CREATE POLICY "tenant_isolation_order_draft" ON "OrderDraft"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- AuditLog
CREATE POLICY "tenant_isolation_audit_log" ON "AuditLog"
  FOR ALL
  USING (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    OR current_setting('app.bypass_rls', true) = 'true'
  );
