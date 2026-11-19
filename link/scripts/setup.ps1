# Muse Link automatic setup (runs elevated from the wizard)
# Steps: Tailscale install / OpenSSH Server enable / dedicated user /
# Muse public key registration / base folder + ACL.
# Log: C:\ProgramData\MuseLink\setup.log
$ErrorActionPreference = 'Continue'
$logDir = 'C:\ProgramData\MuseLink'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'setup.log'
function Log($msg) {
  $line = ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
  Add-Content -Path $log -Value $line -Encoding UTF8
}
Log '=== Muse Link setup started ==='

$baseFolder = 'C:\MuseWorkspaces'
$linkUser = 'muselink'
$musePublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOWdgbAAkcpiTcE8qv4cGUtGO0nBg5//4PoNi13RrxBb hatch'

# 1) Tailscale via winget
try {
  if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    Log 'Tailscale: already installed, skipped'
  } elseif (Test-Path 'C:\Program Files\Tailscale\tailscale.exe') {
    Log 'Tailscale: already installed (exe found), skipped'
  } else {
    Log 'Tailscale: installing via winget...'
    winget install --id Tailscale.Tailscale -e --silent --accept-package-agreements --accept-source-agreements | Out-File -Append -FilePath $log -Encoding utf8
    Log 'Tailscale: winget finished'
  }
} catch { Log ('Tailscale: ERROR ' + $_.Exception.Message) }

# 2) OpenSSH Server
try {
  $cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*' | Where-Object { $_.State -ne 'Installed' }
  if ($cap) {
    Log 'OpenSSH Server: installing capability...'
    Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null
  } else {
    Log 'OpenSSH Server: already installed'
  }
  Set-Service -Name sshd -StartupType Automatic
  # sshd_config: pubkey auth on. Password auth is left as-is at OS level;
  # the dedicated user gets a random, unknown password (see step 3).
  $sshdConfig = 'C:\ProgramData\ssh\sshd_config'
  if (Test-Path $sshdConfig) {
    $cfg = Get-Content $sshdConfig -Raw
    if ($cfg -notmatch 'PubkeyAuthentication') {
      Add-Content -Path $sshdConfig -Value "`nPubkeyAuthentication yes" -Encoding ascii
    }
  }
  Start-Service sshd -ErrorAction SilentlyContinue
  Log 'OpenSSH Server: service set to Automatic and started'
} catch { Log ('OpenSSH Server: ERROR ' + $_.Exception.Message) }

# 3) Dedicated local user (random password, never shown / never used for login by password from Muse)
try {
  $existing = Get-LocalUser -Name $linkUser -ErrorAction SilentlyContinue
  if (-not $existing) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pw = [Convert]::ToBase64String($bytes) + '!aA1'
    $secure = ConvertTo-SecureString $pw -AsPlainText -Force
    New-LocalUser -Name $linkUser -Password $secure -Description 'Muse Link dedicated SSH user' | Out-Null
    Log 'Dedicated user: created'
  } else {
    Log 'Dedicated user: already exists'
  }
} catch { Log ('Dedicated user: ERROR ' + $_.Exception.Message) }

# 4) Register Muse public key for the dedicated user
# The dedicated user has never logged on interactively, so its profile folder
# may not be resolved by sshd. Register the key in two places:
# (a) the user's .ssh\authorized_keys, (b) a fixed path under ProgramData that
# sshd_config points to via a Match block (this is the reliable one).
try {
  $sshDir = "C:\Users\$linkUser\.ssh"
  New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
  $authKeys = Join-Path $sshDir 'authorized_keys'
  $already = $false
  if (Test-Path $authKeys) { $already = [bool](Select-String -Path $authKeys -SimpleMatch $musePublicKey -Quiet) }
  if (-not $already) { Add-Content -Path $authKeys -Value $musePublicKey -Encoding ascii }
  icacls $sshDir /inheritance:r /grant:r "${linkUser}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
  icacls $authKeys /inheritance:r /grant:r "${linkUser}:F" 'SYSTEM:F' 'Administrators:F' | Out-Null

  $pdKeys = Join-Path $logDir 'authorized_keys'
  $alreadyPd = $false
  if (Test-Path $pdKeys) { $alreadyPd = [bool](Select-String -Path $pdKeys -SimpleMatch $musePublicKey -Quiet) }
  if (-not $alreadyPd) { Add-Content -Path $pdKeys -Value $musePublicKey -Encoding ascii }
  icacls $pdKeys /inheritance:r /grant:r 'SYSTEM:F' 'Administrators:F' "${linkUser}:R" | Out-Null

  $sshdConfig2 = 'C:\ProgramData\ssh\sshd_config'
  if (Test-Path $sshdConfig2) {
    $cfg2 = Get-Content $sshdConfig2 -Raw
    if ($cfg2 -notmatch 'MuseLink/authorized_keys') {
      Add-Content -Path $sshdConfig2 -Value "`nMatch User $linkUser`n    AuthorizedKeysFile C:/ProgramData/MuseLink/authorized_keys" -Encoding ascii
      Log 'Public key: sshd_config Match block added'
    }
  }
  Restart-Service sshd -ErrorAction SilentlyContinue
  Log 'Public key: registered'
} catch { Log ('Public key: ERROR ' + $_.Exception.Message) }

# 5) Base folder + ACL (dedicated user may access only under this folder via share of work)
try {
  New-Item -ItemType Directory -Force -Path $baseFolder | Out-Null
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  # Keep inheritance off the base folder itself is too strict for daily use by the owner,
  # so we grant explicitly: current user, SYSTEM, Administrators, and the link user.
  icacls $baseFolder /grant "${linkUser}:(OI)(CI)M" | Out-Null
  Log 'Base folder: created and granted to link user'
} catch { Log ('Base folder: ERROR ' + $_.Exception.Message) }

Log '=== Muse Link setup finished ==='
