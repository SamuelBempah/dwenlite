; Dwenlite for Windows: a small installer that needs no administrator rights.
Unicode True
RequestExecutionLevel user
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Name "Dwenlite"
OutFile "Dwenlite-Setup.exe"
InstallDir "$LOCALAPPDATA\Dwenlite"
BrandingText "Dwenlite"
ShowInstDetails show

!define MUI_ICON "dwenlite.ico"
!define MUI_UNICON "dwenlite.ico"
!define MUI_WELCOMEPAGE_TITLE "Set up Dwenlite on this computer"
!define MUI_WELCOMEPAGE_TEXT "Dwenlite will run quietly in the background so your assistant can work on this computer for you, even while you are away.$\r$\n$\r$\nIt installs only for you and does not need an administrator password.$\r$\n$\r$\nAt the end you will type a short code from Dwenlite Home to connect this computer to your account, so have Dwenlite Home open on your phone or in a browser."
!define MUI_FINISHPAGE_TITLE "Dwenlite is ready"
!define MUI_FINISHPAGE_TEXT "Look for the Dwenlite icon near the clock. Click it to open Dwenlite Home, or press Ctrl+Alt+D to ask something from anywhere."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
Page custom CodePre CodeLeave
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var CodeArg
Var CodeBox
Var SkipBox
Var CodeText

Section "Install"
  SetOutPath "$INSTDIR"
  File "install.ps1"
  File "run.ps1"
  File "tray.ps1"
  File "uninstall.ps1"
  File "launch.vbs"
  File "dwenlite.ico"

  ; an optional code can be given on the command line: Dwenlite-Setup.exe /CODE=ABCD1234
  ${GetParameters} $0
  ${GetOptions} $0 "/CODE=" $CodeArg

  DetailPrint "Setting up Dwenlite (this can take a minute)..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\install.ps1" -InstallDir "$INSTDIR"'
  Pop $2
  ${If} $2 != 0
    StrCpy $3 "Details are in $INSTDIR\install.log"
    IfFileExists "$INSTDIR\problem.txt" 0 +4
      FileOpen $4 "$INSTDIR\problem.txt" r
      FileRead $4 $3
      FileClose $4
    MessageBox MB_OK|MB_ICONSTOP "Dwenlite could not finish setting up.$\r$\n$\r$\n$3"
    Abort "Dwenlite could not finish setting up."
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "DisplayName" "Dwenlite"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "DisplayIcon" "$INSTDIR\dwenlite.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "Publisher" "Dwenlite"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "NoRepair" 1
SectionEnd

Function CodePre
  ; already connected from an earlier install: nothing to ask
  IfFileExists "$APPDATA\Dwenlite\config.json" 0 +3
    Call StartHelper
    Abort
  !insertmacro MUI_HEADER_TEXT "Connect this computer" "Type the code from Dwenlite Home"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 40u "Open Dwenlite Home on your phone or in a browser, tap the computer button, then Add a computer. Type the code it shows here:"
  Pop $0
  ${NSD_CreateText} 0 46u 70% 14u "$CodeArg"
  Pop $CodeBox
  ${NSD_CreateCheckbox} 0 74u 100% 12u "I will connect later"
  Pop $SkipBox
  nsDialogs::Show
FunctionEnd

Function CodeLeave
  ${NSD_GetState} $SkipBox $0
  ${If} $0 == ${BST_CHECKED}
    Call StartHelper
    Return
  ${EndIf}
  ${NSD_GetText} $CodeBox $CodeText
  ${If} $CodeText == ""
    MessageBox MB_OK|MB_ICONINFORMATION "Type the code from Dwenlite Home, or tick 'I will connect later'."
    Abort
  ${EndIf}
  ; only letters, numbers, dashes and spaces are allowed in the code
  StrCpy $R0 0
  StrLen $R1 $CodeText
  ${While} $R0 < $R1
    StrCpy $R2 $CodeText 1 $R0
    ${If} $R2 == '"'
    ${OrIf} $R2 == "&"
    ${OrIf} $R2 == "|"
    ${OrIf} $R2 == "^"
    ${OrIf} $R2 == "%"
      MessageBox MB_OK|MB_ICONEXCLAMATION "That does not look like a code. It is 8 letters and numbers, like K7M2-QX4P."
      Abort
    ${EndIf}
    IntOp $R0 $R0 + 1
  ${EndWhile}
  nsExec::ExecToStack '"$INSTDIR\node\node.exe" "$INSTDIR\agent\dwenlite-agent.mjs" pair $CodeText'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$1"
    Abort
  ${EndIf}
  MessageBox MB_OK|MB_ICONINFORMATION "This computer is connected to your Dwenlite account."
  Call StartHelper
FunctionEnd

Function StartHelper
  Exec '"$SYSDIR\wscript.exe" "$INSTDIR\launch.vbs"'
FunctionEnd

Section "Uninstall"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\uninstall.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  Sleep 1500
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite"
SectionEnd
