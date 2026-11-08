# =============================================================================
# MASALINK POSTGRESQL GERİ YÜKLEME (PowerShell - Windows)
# =============================================================================
param(
  [Parameter(Mandatory=$true)]
  [string]$BackupZip
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupZip)) {
  Write-Error "[HATA] Yedek dosyası bulunamadı: $BackupZip"
  exit 1
}

$ChecksumFile = "$BackupZip.sha256"
if (Test-Path $ChecksumFile) {
  Write-Host "[INFO] SHA-256 kontrol özeti doğrulanıyor..." -ForegroundColor Cyan
  $expected = (Get-Content $ChecksumFile).Trim().ToLower()
  $actual = (Get-FileHash -Path $BackupZip -Algorithm SHA256).Hash.ToLower()

  if ($expected -ne $actual) {
    Write-Error "[GÜVENLİK ALARMI] SHA-256 özeti uyuşmuyor! Beklenen: $expected, Hesaplanan: $actual"
    exit 3
  }
  Write-Host "[BAŞARILI] Bütünlük doğrulaması onaylandı." -ForegroundColor Green
}

$dbUrl = $env:DATABASE_URL
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
  Write-Error "[HATA] DATABASE_URL ortam değişkeni tanımlı değil!"
  exit 1
}

$tempExtractDir = Join-Path $env:TEMP "masalink_restore_$(Get-Random)"
New-Item -ItemType Directory -Path $tempExtractDir | Out-Null

try {
  Expand-Archive -Path $BackupZip -DestinationPath $tempExtractDir -Force
  $sqlFile = Get-ChildItem -Path $tempExtractDir -Filter "*.sql" | Select-Object -First 1

  if (-not $sqlFile) {
    throw "Arşiv içinde .sql dosyası bulunamadı!"
  }

  Write-Host "[INFO] Veritabanı geri yükleniyor: $($sqlFile.FullName)..." -ForegroundColor Cyan
  & psql "$dbUrl" -v ON_ERROR_STOP=1 -f $sqlFile.FullName

  if ($LASTEXITCODE -ne 0) {
    throw "psql komutu hata kodu ile sonlandı: $LASTEXITCODE"
  }

  Write-Host "[BAŞARILI] Veritabanı geri yükleme işlemi tamamlandı!" -ForegroundColor Green
} finally {
  Remove-Item -Path $tempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
}
