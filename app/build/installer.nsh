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

!include LogicLib.nsh
!include nsDialogs.nsh

Var /GLOBAL museLinkCheckboxHwnd
Var /GLOBAL museLinkState

; The page and its functions exist only in the installer build. Without
; this guard, the uninstaller build (BUILD_UNINSTALLER) sees the functions
; as unreferenced and makensis warning 6010 fails the build.
!ifndef BUILD_UNINSTALLER
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
FunctionEnd
!endif

!macro customInstall
  ${If} ${FileExists} "$INSTDIR\Muse-Link-Setup.exe"
    ${If} $museLinkState == ${BST_CHECKED}
      ExecWait '"$INSTDIR\Muse-Link-Setup.exe" /S'
    ${EndIf}
    Delete "$INSTDIR\Muse-Link-Setup.exe"
  ${EndIf}
!macroend
