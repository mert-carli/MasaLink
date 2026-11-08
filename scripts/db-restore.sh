#!/usr/bin/env bash
# =============================================================================
# MASALINK POSTGRESQL GERİ YÜKLEME KOMUT DOSYASI (Database Restore Script)
# =============================================================================
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Kullanım: $0 <yedek_dosyası_yolu.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[HATA] Belirtilen yedek dosyası bulunamadı: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[HATA] DATABASE_URL ortam değişkeni tanımlı değil!" >&2
  exit 1
fi

echo "[INFO] [$(date)] Geri yükleme başlatılıyor: ${BACKUP_FILE}"

# 1. Bütünlük denetimi (SHA-256 Checksum Verification)
if [ -f "${CHECKSUM_FILE}" ]; then
  echo "[INFO] SHA-256 kontrol özeti doğrulanıyor..."
  EXPECTED_HASH=$(cat "${CHECKSUM_FILE}" | tr -d '[:space:]')
  ACTUAL_HASH=$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')

  if [ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]; then
    echo "[GÜVENLİK ALARMI] Yedek dosyasının SHA-256 özeti uyuşmuyor! Dosya tahrif edilmiş veya bozulmuş olabilir!" >&2
    echo "Beklenen: ${EXPECTED_HASH}" >&2
    echo "Hesaplanan: ${ACTUAL_HASH}" >&2
    exit 3
  fi
  echo "[BAŞARILI] SHA-256 doğrulaması başarılı (${ACTUAL_HASH})."
else
  echo "[UYARI] ${CHECKSUM_FILE} bulunamadı, bütünlük doğrulaması atlanıyor."
fi

# 2. Geri yükleme işlemini çalıştır
echo "[INFO] Veritabanı geri yükleniyor..."
if gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL}" --single-transaction --set ON_ERROR_STOP=on; then
  echo "[BAŞARILI] [$(date)] Geri yükleme başarıyla tamamlandı!"
else
  echo "[HATA] [$(date)] Veritabanı geri yükleme işlemi başarısız oldu!" >&2
  exit 4
fi
