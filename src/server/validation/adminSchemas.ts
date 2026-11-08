export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Katı Allow-List Doğrulayıcı:
 * İstemciden gelen objede tanımlı allowList DIŞINDA tek bir yabancı/beklenmeyen
 * anahtar bile varsa (Mass-Assignment girişimi) derhal ValidationError fırlatır.
 */
function enforceAllowList(obj: Record<string, any>, allowedKeys: string[]): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new ValidationError('body', 'Geçersiz veri gövdesi.');
  }
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (!allowedKeys.includes(k)) {
      throw new ValidationError(k, `Güvenlik ihlali: İzin verilmeyen parametre enjeksiyonu tespit edildi ('${k}').`);
    }
  }
}

// ============================================================================
// 1. PERSONEL (STAFF) ŞEMALARI
// ============================================================================
export interface CreateStaffInput {
  name: string;
  email?: string;
  roleKey: 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN';
  section?: string;
  pin?: string;
  password?: string;
  branchId?: string;
}

export function validateCreateStaff(body: any): CreateStaffInput {
  enforceAllowList(body, ['name', 'email', 'roleKey', 'section', 'pin', 'password', 'branchId']);

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    throw new ValidationError('name', 'İsim en az 2 karakter olmalıdır.');
  }

  const validRoles = ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'];
  if (!body.roleKey || !validRoles.includes(body.roleKey)) {
    throw new ValidationError('roleKey', `Geçerli bir rol seçilmelidir: ${validRoles.join(', ')}`);
  }

  if (body.email && (typeof body.email !== 'string' || !body.email.includes('@'))) {
    throw new ValidationError('email', 'Geçerli bir e-posta adresi giriniz.');
  }

  if (body.pin && (typeof body.pin !== 'string' || !/^\d{4,6}$/.test(body.pin))) {
    throw new ValidationError('pin', 'PIN 4 ile 6 haneli rakamlardan oluşmalıdır.');
  }

  return {
    name: body.name.trim(),
    email: body.email?.trim().toLowerCase(),
    roleKey: body.roleKey,
    section: body.section?.trim(),
    pin: body.pin,
    password: body.password,
    branchId: body.branchId,
  };
}

export interface UpdateStaffInput {
  id: string;
  data: {
    name?: string;
    email?: string;
    roleKey?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN';
    section?: string;
    pin?: string;
    password?: string;
    isActive?: boolean;
  };
}

export function validateUpdateStaff(body: any): UpdateStaffInput {
  enforceAllowList(body, ['id', 'data']);

  if (!body.id || typeof body.id !== 'string') {
    throw new ValidationError('id', 'Personel ID zorunludur.');
  }

  enforceAllowList(body.data, ['name', 'email', 'roleKey', 'section', 'pin', 'password', 'isActive']);

  if (body.data.roleKey) {
    const validRoles = ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'];
    if (!validRoles.includes(body.data.roleKey)) {
      throw new ValidationError('roleKey', `Geçerli bir rol seçilmelidir: ${validRoles.join(', ')}`);
    }
  }

  if (body.data.pin && !/^\d{4,6}$/.test(body.data.pin)) {
    throw new ValidationError('pin', 'PIN 4-6 haneli rakam olmalıdır.');
  }

  return {
    id: body.id,
    data: {
      name: body.data.name?.trim(),
      email: body.data.email?.trim().toLowerCase(),
      roleKey: body.data.roleKey,
      section: body.data.section?.trim(),
      pin: body.data.pin,
      password: body.data.password,
      isActive: typeof body.data.isActive === 'boolean' ? body.data.isActive : undefined,
    },
  };
}

// ============================================================================
// 2. KATEGORİ & MENÜ ŞEMALARI
// ============================================================================
export function validateCreateCategory(body: any) {
  enforceAllowList(body, ['name', 'icon', 'order']);
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new ValidationError('name', 'Kategori adı zorunludur.');
  }
  return {
    name: body.name.trim(),
    icon: typeof body.icon === 'string' ? body.icon.slice(0, 10) : undefined,
    order: typeof body.order === 'number' ? body.order : undefined,
  };
}

export function validateUpdateCategory(body: any) {
  enforceAllowList(body, ['name', 'icon', 'order', 'isActive']);
  return {
    name: body.name ? String(body.name).trim() : undefined,
    icon: typeof body.icon === 'string' ? body.icon.slice(0, 10) : undefined,
    order: typeof body.order === 'number' ? body.order : undefined,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
  };
}

export function validateCreateProduct(body: any) {
  enforceAllowList(body, [
    'categoryId',
    'name',
    'description',
    'price',
    'image',
    'imageUrl',
    'badge',
    'isAvailable',
    'prepTimeMinutes',
    'station',
    'code',
    'isPopular',
  ]);

  if (!body.categoryId || typeof body.categoryId !== 'string') {
    throw new ValidationError('categoryId', 'Kategori ID zorunludur.');
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new ValidationError('name', 'Ürün adı zorunludur.');
  }
  if (typeof body.price !== 'number' || body.price <= 0) {
    throw new ValidationError('price', 'Fiyat sıfırdan büyük bir sayı olmalıdır.');
  }

  return {
    categoryId: body.categoryId,
    name: body.name.trim(),
    description: typeof body.description === 'string' ? body.description.slice(0, 500) : undefined,
    price: body.price,
    image: typeof body.image === 'string' ? body.image : undefined,
    imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : (typeof body.image === 'string' ? body.image : undefined),
    badge: typeof body.badge === 'string' ? body.badge.slice(0, 50) : undefined,
    isAvailable: typeof body.isAvailable === 'boolean' ? body.isAvailable : true,
    prepTimeMinutes: typeof body.prepTimeMinutes === 'number' && body.prepTimeMinutes > 0 ? body.prepTimeMinutes : undefined,
    station: typeof body.station === 'string' ? body.station : undefined,
    code: typeof body.code === 'string' ? body.code.trim() : undefined,
    isPopular: typeof body.isPopular === 'boolean' ? body.isPopular : undefined,
  };
}

export function validateUpdateProduct(body: any) {
  enforceAllowList(body, [
    'categoryId',
    'name',
    'description',
    'price',
    'image',
    'imageUrl',
    'badge',
    'isAvailable',
    'prepTimeMinutes',
    'station',
    'code',
    'isPopular',
  ]);

  if (body.price !== undefined && (typeof body.price !== 'number' || body.price <= 0)) {
    throw new ValidationError('price', 'Fiyat sıfırdan büyük bir sayı olmalıdır.');
  }

  return {
    categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    description: typeof body.description === 'string' ? body.description.slice(0, 500) : undefined,
    price: typeof body.price === 'number' ? body.price : undefined,
    image: typeof body.image === 'string' ? body.image : undefined,
    imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : (typeof body.image === 'string' ? body.image : undefined),
    badge: typeof body.badge === 'string' ? body.badge.slice(0, 50) : undefined,
    isAvailable: typeof body.isAvailable === 'boolean' ? body.isAvailable : undefined,
    prepTimeMinutes: typeof body.prepTimeMinutes === 'number' ? body.prepTimeMinutes : undefined,
    station: typeof body.station === 'string' ? body.station : undefined,
    code: typeof body.code === 'string' ? body.code.trim() : undefined,
    isPopular: typeof body.isPopular === 'boolean' ? body.isPopular : undefined,
  };
}

export function validateCreateExtra(body: any) {
  enforceAllowList(body, ['name', 'price', 'extraPrice', 'code']);
  if (!body.name || typeof body.name !== 'string') throw new ValidationError('name', 'Ekstra adı zorunludur.');
  const price = typeof body.extraPrice === 'number' ? body.extraPrice : typeof body.price === 'number' ? body.price : -1;
  if (price < 0) throw new ValidationError('price', 'Geçerli bir ekstra fiyatı belirtilmelidir.');

  return {
    name: body.name.trim(),
    extraPrice: price,
    code: typeof body.code === 'string' ? body.code.trim() : undefined,
  };
}

export function validateUpdateExtra(body: any) {
  enforceAllowList(body, ['name', 'price', 'extraPrice', 'isActive']);
  const price = typeof body.extraPrice === 'number' ? body.extraPrice : typeof body.price === 'number' ? body.price : undefined;
  if (price !== undefined && price < 0) {
    throw new ValidationError('price', 'Geçerli bir ekstra fiyatı belirtilmelidir.');
  }
  return {
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    extraPrice: price,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
  };
}

// ============================================================================
// 3. MASA (TABLE) ŞEMALARI
// ============================================================================
export function validateCreateTable(body: any) {
  enforceAllowList(body, ['code', 'name', 'section', 'capacity', 'branchId']);

  if (!body.code || typeof body.code !== 'string') throw new ValidationError('code', 'Masa kodu zorunludur.');
  if (!body.name || typeof body.name !== 'string') throw new ValidationError('name', 'Masa adı zorunludur.');

  const validSections = ['SALON', 'BAHCE', 'TERAS', 'BAR'];
  if (!body.section || !validSections.includes(body.section)) {
    throw new ValidationError('section', `Geçersiz bölge: ${validSections.join(', ')}`);
  }

  return {
    code: body.code.trim(),
    name: body.name.trim(),
    section: body.section as 'SALON' | 'BAHCE' | 'TERAS' | 'BAR',
    capacity: typeof body.capacity === 'number' && body.capacity > 0 ? body.capacity : 4,
    branchId: body.branchId,
  };
}

export function validateUpdateTable(body: any) {
  enforceAllowList(body, ['code', 'name', 'section', 'capacity', 'isActive']);

  if (body.section) {
    const validSections = ['SALON', 'BAHCE', 'TERAS', 'BAR'];
    if (!validSections.includes(body.section)) {
      throw new ValidationError('section', `Geçersiz bölge: ${validSections.join(', ')}`);
    }
  }

  return {
    code: typeof body.code === 'string' ? body.code.trim() : undefined,
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    section: body.section,
    capacity: typeof body.capacity === 'number' && body.capacity > 0 ? body.capacity : undefined,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
  };
}

// ============================================================================
// 4. HAMMADDE & REÇETE ŞEMALARI
// ============================================================================
export function validateCreateIngredient(body: any) {
  enforceAllowList(body, ['name', 'unit', 'currentStock', 'minStock', 'costPerUnit']);

  if (!body.name || typeof body.name !== 'string') throw new ValidationError('name', 'Hammadde adı zorunludur.');
  if (!body.unit || typeof body.unit !== 'string') throw new ValidationError('unit', 'Ölçü birimi zorunludur.');
  if (typeof body.costPerUnit !== 'number' || body.costPerUnit < 0) {
    throw new ValidationError('costPerUnit', 'Birim maliyet sıfır veya pozitif olmalıdır.');
  }

  return {
    name: body.name.trim(),
    unit: body.unit.trim().toUpperCase(),
    currentStock: typeof body.currentStock === 'number' ? body.currentStock : 0,
    minStock: typeof body.minStock === 'number' ? body.minStock : 5,
    costPerUnit: body.costPerUnit,
  };
}

export function validateSaveRecipe(body: any) {
  enforceAllowList(body, ['productId', 'recipeData']);
  if (!body.productId || typeof body.productId !== 'string') {
    throw new ValidationError('productId', 'Ürün ID (productId) zorunludur.');
  }
  if (!body.recipeData || typeof body.recipeData !== 'object') {
    throw new ValidationError('recipeData', 'Reçete içeriği zorunludur.');
  }

  enforceAllowList(body.recipeData, ['yield', 'items']);
  if (!Array.isArray(body.recipeData.items) || body.recipeData.items.length === 0) {
    throw new ValidationError('items', 'Reçete en az 1 hammadde kalemi içermelidir.');
  }

  const items = body.recipeData.items.map((it: any, idx: number) => {
    enforceAllowList(it, ['ingredientId', 'netAmount', 'wastePercent']);
    if (!it.ingredientId || typeof it.ingredientId !== 'string') {
      throw new ValidationError(`items[${idx}].ingredientId`, 'Hammadde ID zorunludur.');
    }
    if (typeof it.netAmount !== 'number' || it.netAmount <= 0) {
      throw new ValidationError(`items[${idx}].netAmount`, 'Net miktar pozitif bir sayı olmalıdır.');
    }
    return {
      ingredientId: it.ingredientId,
      netAmount: it.netAmount,
      wastePercent: typeof it.wastePercent === 'number' ? Math.max(0, it.wastePercent) : 0,
    };
  });

  return {
    productId: body.productId,
    recipeData: {
      yield: typeof body.recipeData.yield === 'number' && body.recipeData.yield > 0 ? body.recipeData.yield : 1,
      items,
    },
  };
}

// ============================================================================
// 5. KDS (MUTFAK EKRANI) ŞEMALARI
// ============================================================================
export function validateKdsStatusUpdate(body: any) {
  enforceAllowList(body, ['orderId', 'status', 'tableId']);
  if (!body.orderId || typeof body.orderId !== 'string' || body.orderId.trim() === '') {
    throw new ValidationError('orderId', 'Geçerli bir sipariş ID (orderId) zorunludur.');
  }
  const validStatuses = ['PREPARING', 'READY', 'SERVED', 'CANCELLED'];
  if (!body.status || !validStatuses.includes(body.status)) {
    throw new ValidationError('status', `Geçerli bir sipariş durumu seçilmelidir: ${validStatuses.join(', ')}`);
  }
  return {
    orderId: body.orderId.trim(),
    status: body.status as 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED',
    tableId: typeof body.tableId === 'string' ? body.tableId.trim() : undefined,
  };
}

// ============================================================================
// 6. SİPARİŞ (ORDER) MUTASYON ŞEMALARI
// ============================================================================
export interface ValidatedSubmitOrderInput {
  tableId: string;
  source?: 'POS' | 'WAITER' | 'QR';
  items: Array<{
    productId?: string;
    productCode?: string;
    name?: string;
    quantity: number;
    cookingLevel?: string;
    selectedOptions?: Array<{ id?: string; code?: string; name?: string; price?: number }>;
    extras?: Array<{ id?: string; code?: string; name?: string; price?: number }>;
    customNote?: string;
    notes?: string;
    guestTag?: string;
  }>;
  clientVersion?: number;
  customerNote?: string;
  guestName?: string;
  requiresApproval?: boolean;
  idempotencyKey?: string;
  qrToken?: string;
}

export function validateSubmitOrder(body: any): ValidatedSubmitOrderInput {
  // Mass-assignment & yetkisiz alan enjeksiyonunu engelle:
  // id, tenantId, status, paidAmount, createdAt, updatedAt, role, ownerId vb. kesinlikle yasaktır!
  enforceAllowList(body, [
    'tableId',
    'source',
    'items',
    'clientVersion',
    'customerNote',
    'guestName',
    'requiresApproval',
    'idempotencyKey',
    'qrToken',
  ]);

  if (!body.tableId || typeof body.tableId !== 'string' || body.tableId.trim().length === 0) {
    throw new ValidationError('tableId', 'Masa ID (tableId) zorunludur.');
  }

  if (body.source && !['POS', 'WAITER', 'QR'].includes(body.source)) {
    throw new ValidationError('source', 'Geçersiz sipariş kaynağı (POS, WAITER, QR olmalıdır).');
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError('items', 'Sipariş en az bir ürün kalemi içermelidir.');
  }

  const validatedItems = body.items.map((item: any, idx: number) => {
    if (!item || typeof item !== 'object') {
      throw new ValidationError(`items[${idx}]`, 'Geçersiz sipariş kalemi formatı.');
    }
    // Kalem bazında mass-assignment kalkanı (fiyat, vergi, tenantId enjeksiyonunu engelle)
    enforceAllowList(item, [
      'productId',
      'productCode',
      'name',
      'quantity',
      'cookingLevel',
      'selectedOptions',
      'extras',
      'customNote',
      'notes',
      'guestTag',
    ]);

    if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity) || item.quantity > 500) {
      throw new ValidationError(`items[${idx}].quantity`, 'Ürün adedi 1 ile 500 arasında bir tam sayı olmalıdır.');
    }

    const validateExtraList = (extrasList: any[], fieldName: string) => {
      if (!Array.isArray(extrasList)) return [];
      return extrasList.map((ext: any, extIdx: number) => {
        enforceAllowList(ext, ['id', 'code', 'name', 'price']);
        return {
          id: typeof ext.id === 'string' ? ext.id : undefined,
          code: typeof ext.code === 'string' ? ext.code : undefined,
          name: typeof ext.name === 'string' ? ext.name : undefined,
          price: typeof ext.price === 'number' && ext.price >= 0 ? ext.price : undefined,
        };
      });
    };

    return {
      productId: typeof item.productId === 'string' ? item.productId : undefined,
      productCode: typeof item.productCode === 'string' ? item.productCode : undefined,
      name: typeof item.name === 'string' ? item.name.slice(0, 100) : undefined,
      quantity: item.quantity,
      cookingLevel: typeof item.cookingLevel === 'string' ? item.cookingLevel.slice(0, 50) : undefined,
      selectedOptions: item.selectedOptions ? validateExtraList(item.selectedOptions, 'selectedOptions') : undefined,
      extras: item.extras ? validateExtraList(item.extras, 'extras') : undefined,
      customNote: typeof item.customNote === 'string' ? item.customNote.slice(0, 300) : undefined,
      notes: typeof item.notes === 'string' ? item.notes.slice(0, 300) : undefined,
      guestTag: typeof item.guestTag === 'string' ? item.guestTag.slice(0, 50) : undefined,
    };
  });

  return {
    tableId: body.tableId.trim(),
    source: body.source,
    items: validatedItems,
    clientVersion: typeof body.clientVersion === 'number' ? body.clientVersion : undefined,
    customerNote: typeof body.customerNote === 'string' ? body.customerNote.slice(0, 500) : undefined,
    guestName: typeof body.guestName === 'string' ? body.guestName.slice(0, 100) : undefined,
    requiresApproval: Boolean(body.requiresApproval),
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 100) : undefined,
    qrToken: typeof body.qrToken === 'string' ? body.qrToken : undefined,
  };
}

// ============================================================================
// 7. ONLINE ÖDEME BAŞLATMA (PAYMENT INITIATE) ŞEMASI
// ============================================================================
export interface ValidatedInitiatePaymentInput {
  branchId?: string;
  tableId: string;
  tableCode?: string;
  sessionId?: string;
  amount: number;
  currency?: string;
  provider?: 'IYZICO' | 'PAYTR';
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items?: Array<{ name: string; price: number; quantity: number }>;
  isPartialPayment?: boolean;
  guestName?: string;
  callbackUrl?: string;
}

export function validateInitiatePayment(body: any): ValidatedInitiatePaymentInput {
  // Mass-assignment & tenant-spoofing kalkanı:
  // tenantId KESİNLİKLE kabul edilmez, request host/auth guard'dan çözümlenmelidir.
  // status, isPaid, id, createdAt, updatedAt vb. enjekte edilemez!
  enforceAllowList(body, [
    'branchId',
    'tableId',
    'tableCode',
    'sessionId',
    'amount',
    'currency',
    'provider',
    'customerName',
    'customerEmail',
    'customerPhone',
    'items',
    'isPartialPayment',
    'guestName',
    'callbackUrl',
  ]);

  if (!body.tableId || typeof body.tableId !== 'string') {
    throw new ValidationError('tableId', 'Masa ID (tableId) zorunludur.');
  }

  if (
    typeof body.amount !== 'number' ||
    !Number.isFinite(body.amount) ||
    isNaN(body.amount) ||
    body.amount <= 0 ||
    body.amount > 1_000_000
  ) {
    throw new ValidationError('amount', 'Ödeme tutarı sıfırdan büyük ve en fazla 1.000.000 TL olan sonlu geçerli bir sayı olmalıdır.');
  }

  if (body.provider && !['IYZICO', 'PAYTR'].includes(body.provider)) {
    throw new ValidationError('provider', 'Ödeme sağlayıcısı IYZICO veya PAYTR olmalıdır.');
  }

  return {
    branchId: typeof body.branchId === 'string' ? body.branchId : undefined,
    tableId: body.tableId.trim(),
    tableCode: typeof body.tableCode === 'string' ? body.tableCode.trim() : undefined,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
    amount: Math.round(body.amount * 100) / 100,
    currency: typeof body.currency === 'string' ? body.currency.toUpperCase() : 'TRY',
    provider: body.provider,
    customerName: typeof body.customerName === 'string' ? body.customerName.slice(0, 100) : 'Masa Misafiri',
    customerEmail: typeof body.customerEmail === 'string' ? body.customerEmail.slice(0, 100) : 'misafir@masalink.com',
    customerPhone: typeof body.customerPhone === 'string' ? body.customerPhone.slice(0, 30) : undefined,
    items: Array.isArray(body.items) ? body.items : [],
    isPartialPayment: Boolean(body.isPartialPayment),
    guestName: typeof body.guestName === 'string' ? body.guestName.slice(0, 100) : undefined,
    callbackUrl: typeof body.callbackUrl === 'string' ? body.callbackUrl : undefined,
  };
}

// ============================================================================
// 8. MASA HESAP KAPATMA / ÖDEME TAHSİLAT ŞEMASI
// ============================================================================
export interface ValidatedSettlePaymentInput {
  tableId: string;
  totalAmount: number;
  paymentAmount: number;
  paymentMethod?: string;
  discountType?: 'none' | 'percent' | 'amount';
  discountValue?: number;
  discountReason?: string;
  compedItems?: any[];
  cancelledItems?: any[];
  managerPin?: string;
  managerAuthToken?: string;
  cashierName?: string;
  idempotencyKey?: string;
  expectedVersion?: number;
}

export function validateSettlePayment(body: any): ValidatedSettlePaymentInput {
  // Mass-assignment kalkanı:
  // id, tenantId, status, createdAt, updatedAt, role vb. kesinlikle yasaktır!
  enforceAllowList(body, [
    'tableId',
    'totalAmount',
    'paymentAmount',
    'paymentMethod',
    'discountType',
    'discountValue',
    'discountReason',
    'compedItems',
    'cancelledItems',
    'managerPin',
    'managerAuthToken',
    'cashierName',
    'idempotencyKey',
    'expectedVersion',
  ]);

  if (!body.tableId || typeof body.tableId !== 'string') {
    throw new ValidationError('tableId', 'Masa ID zorunludur.');
  }

  if (typeof body.paymentAmount !== 'number' || body.paymentAmount <= 0) {
    throw new ValidationError('paymentAmount', 'Geçerli bir ödeme tutarı belirtilmelidir.');
  }

  if (body.discountType && !['none', 'percent', 'amount'].includes(body.discountType)) {
    throw new ValidationError('discountType', 'Geçersiz indirim türü.');
  }

  return {
    tableId: body.tableId.trim(),
    totalAmount: typeof body.totalAmount === 'number' ? body.totalAmount : body.paymentAmount,
    paymentAmount: body.paymentAmount,
    paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod : 'Kredi Kartı',
    discountType: body.discountType || 'none',
    discountValue: typeof body.discountValue === 'number' ? body.discountValue : 0,
    discountReason: typeof body.discountReason === 'string' ? body.discountReason : undefined,
    compedItems: Array.isArray(body.compedItems) ? body.compedItems : [],
    cancelledItems: Array.isArray(body.cancelledItems) ? body.cancelledItems : [],
    managerPin: typeof body.managerPin === 'string' ? body.managerPin : undefined,
    managerAuthToken: typeof body.managerAuthToken === 'string' ? body.managerAuthToken : undefined,
    cashierName: typeof body.cashierName === 'string' ? body.cashierName : undefined,
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 100) : undefined,
    expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
  };
}

// ============================================================================
// 9. GARSON TASLAK (DRAFT) ŞEMASI
// ============================================================================
export function validateWaiterDraft(body: any) {
  enforceAllowList(body, ['waiterId', 'waiterName', 'tableId', 'tableName', 'cart', 'itemCount', 'totalAmount']);

  if (!body.waiterId || typeof body.waiterId !== 'string') {
    throw new ValidationError('waiterId', 'Garson ID zorunludur.');
  }
  if (!body.tableId || typeof body.tableId !== 'string') {
    throw new ValidationError('tableId', 'Masa ID zorunludur.');
  }

  return {
    waiterId: body.waiterId.trim(),
    waiterName: typeof body.waiterName === 'string' ? body.waiterName.slice(0, 100) : 'Garson',
    tableId: body.tableId.trim(),
    tableName: typeof body.tableName === 'string' ? body.tableName.slice(0, 50) : 'Masa',
    cart: body.cart && typeof body.cart === 'object' ? body.cart : {},
    itemCount: typeof body.itemCount === 'number' ? body.itemCount : undefined,
    totalAmount: typeof body.totalAmount === 'number' ? body.totalAmount : undefined,
  };
}

// ============================================================================
// 10. QR SİPARİŞİ (QR ORDER) ŞEMASI
// ============================================================================
export function validateQrOrder(body: any) {
  // Mass-assignment & tenant bypass kalkanı:
  // tenantSlug / tenantId body üzerinden enjekte edilemez!
  enforceAllowList(body, [
    'tableId',
    'items',
    'clientFingerprint',
    'sessionToken',
    'customerNote',
    'guestName',
    'visionAiDetected',
    'manualOverride',
    'expectedVersion',
    'idempotencyKey',
  ]);

  if (!body.tableId || typeof body.tableId !== 'string') {
    throw new ValidationError('tableId', 'Masa ID zorunludur.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError('items', 'Sepet boş olamaz.');
  }

  return {
    tableId: body.tableId.trim(),
    items: body.items,
    clientFingerprint: typeof body.clientFingerprint === 'string' ? body.clientFingerprint : 'anon_device',
    sessionToken: typeof body.sessionToken === 'string' ? body.sessionToken : undefined,
    customerNote: typeof body.customerNote === 'string' ? body.customerNote.slice(0, 500) : undefined,
    guestName: typeof body.guestName === 'string' ? body.guestName.slice(0, 100) : undefined,
    visionAiDetected: Boolean(body.visionAiDetected),
    manualOverride: Boolean(body.manualOverride),
    expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : undefined,
  };
}
