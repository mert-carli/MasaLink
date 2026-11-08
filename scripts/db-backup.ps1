# =============================================================================
# MASALINK POSTGRESQL YEDEKLEME (PowerShell - Windows)
# =============================================================================
param(
  [string]$BackupDir = "./backups",
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "masalink_backup_$Timestamp.sql"
$ZipFile = "$BackupFile.zip"
$ChecksumFile = "$ZipFile.sha256"

$dbUrl = $env:DATABASE_URL
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
  Write-Error "[HATA] DATABASE_URL ortam değişkeni tanımlı değil!"
  exit 1
}

Write-Host "[INFO] MasaLink veritabanı yedeği başlatılıyor..." -ForegroundColor Cyan

try {
  # pg_dump çalıştır
  & pg_dump "$dbUrl" --clean --if-exists --no-owner --no-privileges -f $BackupFile
  
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump komutu hata kodu ile sonlandı: $LASTEXITCODE"
  }

  # Sıkıştır
  Compress-Archive -Path $BackupFile -DestinationPath $ZipFile -Force
  Remove-Item $BackupFile -Force

  # SHA-256 hesapla
  $hash = (Get-FileHash -Path $ZipFile -Algorithm SHA256).Hash.ToLower()
  $hash | Out-File -FilePath $ChecksumFile -Encoding utf8

  Write-Host "[BAŞARILI] Yedek tamamlandı: $ZipFile" -ForegroundColor Green
  Write-Host "[BAŞARILI] SHA-256: $hash" -ForegroundColor Green

  # Eski yedekleri temizle
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -Path $BackupDir -Filter "masalink_backup_*" | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item -Force

} catch {
  Write-Error "[HATA] Yedekleme başarısız: $_"
  exit 2
}
