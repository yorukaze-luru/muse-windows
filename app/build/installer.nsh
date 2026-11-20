; Optional Muse Link component for the Muse Windows installer.
;
; The standalone Muse Link installer (Muse-Link-Setup.exe) is staged by
; CI into link-setup/ and bundled into this installer as an extra file
; (see "extraFiles" in package.json), so it lands in $INSTDIR during
; install. This script adds one custom page with a single checkbox.
; If the user leaves it checked, the Link installer runs silently at the
; end of the main install; Link then exists as its own app with its own
; uninstall entry (separate from this app, as designed). Either way the
; bundled exe is deleted from $INSTDIR afterwards.
;
; Diagnosis log (2026-11-20: the 1.0.0 test install showed the page and a
; checked box, yet Link was not installed afterwards): every step writes
; one line to %TEMP%\Muse-Windows-Setup.log, so a single log read tells
; which of the three suspects failed — bundled exe missing from $INSTDIR,
; checkbox state not CHECKED at install time, or the silent install's
; ExecWait exit code. DetailPrint mirrors the same lines in the
; installer's detail view.

!include LogicLib.nsh
!include nsDialogs.nsh

; The page, its functions and its variables exist only in the installer
; build. Without this guard, the uninstaller build (BUILD_UNINSTALLER)
; sees them as unreferenced and makensis warnings 6010/6001 fail the build.
!ifndef BUILD_UNINSTALLER
Var /GLOBAL museLinkCheckboxHwnd
Var /GLOBAL museLinkState

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

; Append one line (top of stack) to %TEMP%\Muse-Windows-Setup.log.
; Preserves $0/$1 across the call.
Function MuseLinkLog
  Exch $0
  Push $1
  FileOpen $1 "$TEMP\Muse-Windows-Setup.log" a
  ${If} $1 != ""
    FileWrite $1 "$0$\r$\n"
    FileClose $1
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd
!endif

!macro customInstall
  Push "MuseLink: customInstall start, INSTDIR=$INSTDIR"
  Call MuseLinkLog
  ${If} ${FileExists} "$INSTDIR\Muse-Link-Setup.exe"
    Push "MuseLink: bundled exe found in INSTDIR"
    Call MuseLinkLog
    DetailPrint "Muse Link: bundled installer found, checkbox state=$museLinkState"
    ${If} $museLinkState == ${BST_CHECKED}
      Push "MuseLink: checkbox checked, running silent install"
      Call MuseLinkLog
      ExecWait '"$INSTDIR\Muse-Link-Setup.exe" /S' $0
      Push "MuseLink: ExecWait exit code=$0"
      Call MuseLinkLog
      DetailPrint "Muse Link: silent install exit code=$0"
    ${Else}
      Push "MuseLink: checkbox unchecked, skipping install (state=$museLinkState)"
      Call MuseLinkLog
      DetailPrint "Muse Link: checkbox unchecked, skipping install"
    ${EndIf}
    Delete "$INSTDIR\Muse-Link-Setup.exe"
  ${Else}
    Push "MuseLink: bundled exe NOT found in INSTDIR"
    Call MuseLinkLog
    DetailPrint "Muse Link: bundled installer NOT found in $INSTDIR"
  ${EndIf}
  Push "MuseLink: customInstall end"
  Call MuseLinkLog
!macroend
