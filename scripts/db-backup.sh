#!/usr/bin/env bash
# =============================================================================
# MASALINK POSTGRESQL YEDEKLEME KOMUT DOSYASI (Database Backup Script)
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/masalink_backup_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "[INFO] [$(date)] MasaLink veritabanı yedeği başlatılıyor..."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[HATA] DATABASE_URL ortam değişkeni tanımlı değil!" >&2
  exit 1
fi

# pg_dump ile gzip sıkıştırmalı tam yedek al
if pg_dump "${DATABASE_URL}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --quote-all-identifiers \
    | gzip -9 > "${BACKUP_FILE}"; then
  
  # SHA-256 bütünlük özeti üret
  sha256sum "${BACKUP_FILE}" | awk '{print $1}' > "${CHECKSUM_FILE}"
  
  FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "[BAŞARILI] [$(date)] Yedek tamamlandı: ${BACKUP_FILE} (${FILESIZE})"
  echo "[BAŞARILI] Bütünlük özeti (SHA-256): $(cat "${CHECKSUM_FILE}")"
else
  echo "[HATA] [$(date)] pg_dump başarısız oldu!" >&2
  rm -f "${BACKUP_FILE}" "${CHECKSUM_FILE}"
  exit 2
fi

# Eski yedekleri temizle (Retention süresini aşan dosyalar)
echo "[INFO] ${RETENTION_DAYS} günden eski yedekler temizleniyor..."
find "${BACKUP_DIR}" -name "masalink_backup_*.sql.gz*" -mtime "+${RETENTION_DAYS}" -exec rm -f {} +

echo "[INFO] Yedekleme süreci başarıyla sonuçlandı."
