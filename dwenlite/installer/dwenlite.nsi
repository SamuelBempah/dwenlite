; Dwenlite for Windows: a small installer that needs no administrator rights.
Unicode True
RequestExecutionLevel user
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

Name "Dwenlite"
OutFile "Dwenlite-Setup.exe"
InstallDir "$LOCALAPPDATA\Dwenlite"
BrandingText "Dwenlite"
ShowInstDetails show

!define MUI_ICON "dwenlite.ico"
!define MUI_UNICON "dwenlite.ico"
!define MUI_WELCOMEPAGE_TITLE "Set up Dwenlite on this computer"
!define MUI_WELCOMEPAGE_TEXT "Dwenlite will run quietly in the background so your assistant can work on this computer for you, even while you are away.$\r$\n$\r$\nIt installs only for you and does not need an administrator password.$\r$\n$\r$\nHave Dwenlite Home open on your phone or in a browser: you will type a short code to connect this computer to your account."
!define MUI_FINISHPAGE_TITLE "Dwenlite is ready"
!define MUI_FINISHPAGE_TEXT "Look for the Dwenlite icon near the clock. Click it to open Dwenlite Home, or press Ctrl+Alt+D to ask something from anywhere."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var CodeArg

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
  StrCpy $1 ""
  ${If} $CodeArg != ""
    StrCpy $1 ' -Code "$CodeArg"'
  ${EndIf}

  DetailPrint "Setting up Dwenlite..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\install.ps1" -InstallDir "$INSTDIR"$1'
  Pop $2
  ${If} $2 != 0
    Abort "Dwenlite could not finish setting up. Details are in $INSTDIR\install.log"
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "DisplayName" "Dwenlite"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "DisplayIcon" "$INSTDIR\dwenlite.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "Publisher" "Dwenlite"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\uninstall.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  Sleep 1500
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Dwenlite"
SectionEnd
