# Muse Windows: build and (when the version is ahead) release script.
# The GitHub workflow is only a thin launcher for this file, so release
# logic can be updated by pushing this script alone.
$ErrorActionPreference = 'Stop'

# Restore icons from base64 (kept out of the binary-hostile connector path)
[IO.File]::WriteAllBytes('app/assets/icon.ico', [Convert]::FromBase64String((Get-Content 'app/assets/icon.ico.b64' -Raw)))
[IO.File]::WriteAllBytes('app/assets/icon.png', [Convert]::FromBase64String((Get-Content 'app/assets/icon.png.b64' -Raw)))

Push-Location app
npm ci
$v = (Get-Content package.json -Raw | ConvertFrom-Json).version
Pop-Location

# Decide: release when forced, or when package.json is ahead of the latest release
$rel = gh api "repos/$env:GITHUB_REPOSITORY/releases" | ConvertFrom-Json
$main = $rel | Where-Object { $_.tag_name -match '^v[0-9]' } | Select-Object -First 1
$isRelease = ($env:FORCE_RELEASE -eq 'true') -or (-not $main) -or ($main.tag_name -ne "v$v")

if (-not $isRelease) {
  Push-Location app
  npx electron-builder --win --publish never
  Pop-Location
  exit 0
}

# --- Release run ---
Push-Location app
npx electron-builder --win nsis --publish never
Pop-Location
Compress-Archive -Path "app/dist/Muse-Windows-Setup-$v.exe" -DestinationPath "app/dist/Muse-Windows-Setup-$v.zip" -Force
Compress-Archive -Path "plugin-template/*" -DestinationPath "app/dist/Muse-Plugin-Template.zip" -Force
$assets = @("app/dist/Muse-Windows-Setup-$v.exe", "app/dist/Muse-Windows-Setup-$v.zip", "app/dist/latest.yml", "app/dist/Muse-Windows-Setup-$v.exe.blockmap", "app/dist/Muse-Plugin-Template.zip")
$tag = "v$v"
gh release view $tag --json tagName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  gh release upload $tag $assets --clobber
  gh release edit $tag --title "Muse Windows v$v" --notes-file RELEASE_NOTES.md
  gh release delete-asset $tag "Muse-Windows-Portable-$v.exe" -y 2>$null | Out-Null
} else {
  gh release create $tag --title "Muse Windows v$v" --notes-file RELEASE_NOTES.md $assets
}

Push-Location app
npx electron-builder --win portable --publish never
Pop-Location
Compress-Archive -Path "app/dist/Muse-Windows-Portable-$v.exe" -DestinationPath "app/dist/Muse-Windows-Portable-$v.zip" -Force
$ptag = "portable-v$v"
gh release view $ptag --json tagName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  gh release upload $ptag "app/dist/Muse-Windows-Portable-$v.zip" --clobber
  gh release edit $ptag --title "Muse Windows Portable v$v"
} else {
  gh release create $ptag --title "Muse Windows Portable v$v" --notes "Portable edition: single exe in a zip. No installation, no auto-update." "app/dist/Muse-Windows-Portable-$v.zip"
}
