/**
 * MasaLink Üretim Ortamı Yapılandırma ve Güvenlik Denetçisi (Environment Validator)
 * 
 * Amaç: Eksik veya güvensiz yapılandırmayla uygulamanın yayına girmesini (Silent Misconfiguration)
 * kesin olarak engellemek (Fail-Closed).
 */

export interface EnvValidationResult {
  isValid: boolean;
  environment: 'development' | 'test' | 'staging' | 'production';
  missingRequired: string[];
  warnings: string[];
  errors: string[];
}

export function validateEnvironmentConfig(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase() as 'development' | 'test' | 'staging' | 'production';
  const isProduction = nodeEnv === 'production';
  const isStaging = nodeEnv === 'staging';
  const isProdLike = isProduction || isStaging;

  const missingRequired: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. VERİTABANI BAĞLANTISI DENETİMİ
  if (!env.DATABASE_URL) {
    if (isProdLike) {
      missingRequired.push('DATABASE_URL');
      errors.push('Üretim ortamında PostgreSQL DATABASE_URL bağlantı dizisi zorunludur.');
    } else {
      warnings.push('DATABASE_URL tanımlanmadı. Geliştirme modunda geçici bellek kullanılacak.');
    }
  } else if (!env.DATABASE_URL.startsWith('postgresql://') && !env.DATABASE_URL.startsWith('postgres://')) {
    errors.push('DATABASE_URL geçerli bir PostgreSQL bağlantı protokolü (postgresql:// veya postgres://) içermelidir.');
  }

  // 2. OTURUM VE JWT GİZLİ ANAHTARLARI
  const jwtSecret = env.MASALINK_JWT_SECRET;
  if (!jwtSecret) {
    if (isProdLike) {
      missingRequired.push('MASALINK_JWT_SECRET');
      errors.push('MASALINK_JWT_SECRET tanımlanmadı (Üretimde en az 32 karakter zorunludur).');
    } else {
      warnings.push('MASALINK_JWT_SECRET tanımlı değil; oturumlar için rastgele geçici anahtar üretilecek.');
    }
  } else if (jwtSecret.length < 32) {
    errors.push(`MASALINK_JWT_SECRET yetersiz entropiye sahip (${jwtSecret.length} karakter). En az 32 karakter olmalıdır.`);
  } else if (['12345678901234567890123456789012', 'secretsecretsecretsecretsecret32'].includes(jwtSecret)) {
    errors.push('MASALINK_JWT_SECRET tahmin edilebilir örnek/varsayılan metin içeriyor. Özgün bir anahtar üretiniz.');
  }

  // 3. İÇ SENKRONİZASYON ANAHTARI
  const syncKey = env.MASALINK_INTERNAL_SYNC_KEY;
  if (!syncKey) {
    if (isProdLike) {
      missingRequired.push('MASALINK_INTERNAL_SYNC_KEY');
      errors.push('MASALINK_INTERNAL_SYNC_KEY tanımlanmadı (Mikroservisler arası senkronizasyon için en az 32 karakter zorunludur).');
    }
  } else if (syncKey.length < 32) {
    errors.push(`MASALINK_INTERNAL_SYNC_KEY en az 32 karakter olmalıdır (${syncKey.length} karakter bulundu).`);
  }

  // 4. TERMAL YAZICI KÖPRÜSÜ
  const bridgeSecret = env.BRIDGE_SECRET;
  if (!bridgeSecret && isProdLike) {
    warnings.push('BRIDGE_SECRET tanımlanmadı. Yerel donanım yazdırma köprüsü devre dışı kalabilir.');
  } else if (bridgeSecret && bridgeSecret.length < 16) {
    errors.push('BRIDGE_SECRET en az 16 karakter olmalıdır.');
  }

  // 5. ÖN BELLEK VE DAĞITIK KİLİT (REDIS)
  const hasUpstashUrl = Boolean(env.UPSTASH_REDIS_REST_URL);
  const hasUpstashToken = Boolean(env.UPSTASH_REDIS_REST_TOKEN);
  if (hasUpstashUrl !== hasUpstashToken) {
    errors.push('UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN ikilisi birlikte tanımlanmalıdır.');
  }

  return {
    isValid: errors.length === 0 && missingRequired.length === 0,
    environment: nodeEnv,
    missingRequired,
    warnings,
    errors,
  };
}
