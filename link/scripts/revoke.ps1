# Muse Link revoke (runs elevated): remove Muse's key and disable the dedicated user.
# Base folder contents and Tailscale / OpenSSH itself are NOT touched.
$ErrorActionPreference = 'Continue'
$logDir = 'C:\ProgramData\MuseLink'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'setup.log'
function Log($msg) {
  $line = ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
  Add-Content -Path $log -Value $line -Encoding UTF8
}
$linkUser = 'muselink'
$authKeys = "C:\Users\$linkUser\.ssh\authorized_keys"
if (Test-Path $authKeys) { Remove-Item $authKeys -Force; Log 'Revoke: authorized_keys removed' }
$pdKeys = 'C:\ProgramData\MuseLink\authorized_keys'
if (Test-Path $pdKeys) { Remove-Item $pdKeys -Force; Log 'Revoke: ProgramData authorized_keys removed' }
Restart-Service sshd -ErrorAction SilentlyContinue
$existing = Get-LocalUser -Name $linkUser -ErrorAction SilentlyContinue
if ($existing) { Disable-LocalUser -Name $linkUser; Log 'Revoke: dedicated user disabled' }
Log 'Revoke: finished'
