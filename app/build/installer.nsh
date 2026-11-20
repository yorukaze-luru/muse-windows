; Optional Muse Link component for the Muse Windows installer.
;
; The standalone Muse Link installer (Muse-Link-Setup.exe) is staged by
; CI into link-setup/ and bundled into this installer as an extra file
; (see "extraFiles" in package.json), so it lands in $INSTDIR during
; install. This script adds one custom page with a single checkbox.
; If the user leaves it checked, the Link installer runs silently and
; Link then exists as its own app with its own uninstall entry (separate
; from this app, as designed).
;
; Diagnosis (2026-11-20): the first 1.0.0 test install showed the page
; and a checked box, yet Link was not installed. A logging build then
; proved the checkbox state and the bundled exe were both fine, but the
; silent install crashed: ExecWait returned -1073741819 (0xC0000005,
; access violation). Running the bundled installer from inside this
; installer is therefore avoided now. Instead the bundled exe is copied
; to $TEMP and a detached PowerShell helper waits for THIS installer
; process to exit, then runs it silently and logs its exit code.
;
; Every step is logged to %TEMP%\Muse-Windows-Setup-<pid>.log (one file
; per installer process; two installer instances writing one shared file
; overwrote each other's lines in the first logging build).

!include LogicLib.nsh
!include nsDialogs.nsh

; The page, its functions and its variables exist only in the installer
; build. Without this guard, the uninstaller build (BUILD_UNINSTALLER)
; sees them as unreferenced and makensis warnings 6010/6001 fail the build.
!ifndef BUILD_UNINSTALLER
Var /GLOBAL museLinkCheckboxHwnd
Var /GLOBAL museLinkState
Var /GLOBAL museLinkPid

!macro customPageAfterChangeDir
  Page custom MuseLinkPageCreate MuseLinkPageLeave
!macroend

Function MuseLinkPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "追加コンポーネント"
  Pop $0
  ${NSD_CreateCheckbox} 0 28u 100% 12u "Muse Link エージェントもインストールする"
  Pop $museLinkCheckboxHwnd
  ${NSD_SetState} $museLinkCheckboxHwnd ${BST_CHECKED}
  ${NSD_CreateLabel} 0 46u 100% 52u "Muse Link は、Muse があなたのPCのフォルダで作業できるようにする連携エージェントです。別のアプリとしてインストールされ、初回起動時にセットアップウィザードが開きます。不要な場合はチェックを外してください。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function MuseLinkPageLeave
  ${NSD_GetState} $museLinkCheckboxHwnd $museLinkState
  Push "MuseLink: page leave, checkbox state=$museLinkState"
  Call MuseLinkLog
FunctionEnd

; Append one line (top of stack) to %TEMP%\Muse-Windows-Setup-<pid>.log.
; Preserves $0/$1/$2 across the call.
Function MuseLinkLog
  Exch $0
  Push $1
  Push $2
  System::Call 'kernel32::GetCurrentProcessId() i .r2'
  FileOpen $1 "$TEMP\Muse-Windows-Setup-$2.log" a
  ${If} $1 != ""
    FileWrite $1 "$0$\r$\n"
    FileClose $1
  ${EndIf}
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

!macro customInstall
  System::Call 'kernel32::GetCurrentProcessId() i .r0'
  StrCpy $museLinkPid $0
  Push "MuseLink: customInstall start, INSTDIR=$INSTDIR, pid=$museLinkPid"
  Call MuseLinkLog
  ${If} ${FileExists} "$INSTDIR\Muse-Link-Setup.exe"
    Push "MuseLink: bundled exe found in INSTDIR"
    Call MuseLinkLog
    ${If} $museLinkState == ${BST_CHECKED}
      DetailPrint "Muse Link: deferred install scheduled (runs after this installer exits)"
      CopyFiles /SILENT "$INSTDIR\Muse-Link-Setup.exe" "$TEMP\Muse-Link-Setup-Deferred.exe"
      Delete "$INSTDIR\Muse-Link-Setup.exe"
      ${If} ${FileExists} "$TEMP\Muse-Link-Setup-Deferred.exe"
        Push "MuseLink: checkbox checked, deferred copy ready in TEMP"
        Call MuseLinkLog
        ; Write the deferred helper script. In these NSIS strings, $$ is a
        ; literal $ for PowerShell, while $TEMP / $museLinkPid expand here.
        FileOpen $0 "$TEMP\Muse-Link-Deferred.ps1" w
        FileWrite $0 "Wait-Process -Id $museLinkPid -Timeout 180 -ErrorAction SilentlyContinue$\r$\n"
        FileWrite $0 "$$p = Start-Process -FilePath '$TEMP\Muse-Link-Setup-Deferred.exe' -ArgumentList '/S' -Wait -PassThru$\r$\n"
        FileWrite $0 "Add-Content -Path '$TEMP\Muse-Windows-Setup-$museLinkPid.log' -Value ('MuseLink: deferred install exit code=' + $$p.ExitCode)$\r$\n"
        FileWrite $0 "Remove-Item '$TEMP\Muse-Link-Setup-Deferred.exe' -Force -ErrorAction SilentlyContinue$\r$\n"
        FileClose $0
        Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\Muse-Link-Deferred.ps1"'
        Push "MuseLink: deferred helper launched"
        Call MuseLinkLog
      ${Else}
        Push "MuseLink: deferred copy FAILED"
        Call MuseLinkLog
        DetailPrint "Muse Link: could not stage the bundled installer"
      ${EndIf}
    ${Else}
      Push "MuseLink: checkbox unchecked, skipping install (state=$museLinkState)"
      Call MuseLinkLog
      DetailPrint "Muse Link: checkbox unchecked, skipping install"
      Delete "$INSTDIR\Muse-Link-Setup.exe"
    ${EndIf}
  ${Else}
    Push "MuseLink: bundled exe NOT found in INSTDIR"
    Call MuseLinkLog
    DetailPrint "Muse Link: bundled installer NOT found in $INSTDIR"
  ${EndIf}
  Push "MuseLink: customInstall end"
  Call MuseLinkLog
!macroend
