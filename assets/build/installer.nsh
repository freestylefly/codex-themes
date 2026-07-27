; [INPUT]: 依赖 electron-builder NSIS 宏、Win11 x64 宿主、HKCU Classes/Run 注册表
; [OUTPUT]: 提供安装时协议/文件关联注册、宿主门禁与卸载所有权清理
; [POS]: assets/build 的 Windows 安装器扩展，避免与 electron-builder 重复注册
; [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
!include LogicLib.nsh

!define CODEX_THEMES_PROTOCOL_KEY "Software\Classes\codexthemes"
!define CODEX_THEME_EXTENSION_KEY "Software\Classes\.codextheme"
!define CODEX_THEME_PROGID "CodexThemes.ThemePackage"
!define CODEX_THEME_PROGID_KEY "Software\Classes\${CODEX_THEME_PROGID}"
!define WINDOWS_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"

!macro customInit
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $0 22000 windows_supported windows_unsupported windows_supported

  windows_unsupported:
    MessageBox MB_ICONSTOP "Codex Themes 仅支持 Windows 11 x64（系统内部版本 22000 或更高）。"
    Abort

  windows_supported:
  System::Call "kernel32::GetCurrentProcess() p .r0"
  System::Call "kernel32::IsWow64Process2(p r0, *i .r1, *i .r2) i .r3"
  ${If} $3 <> 0
  ${AndIf} $2 = 0xAA64
    MessageBox MB_ICONSTOP "Codex Themes 当前不支持 Windows ARM64 或 x64 仿真运行。"
    Abort
  ${EndIf}
!macroend

!macro customInstall
  WriteRegStr HKCU "${CODEX_THEMES_PROTOCOL_KEY}" "" "URL:Codex Themes"
  WriteRegStr HKCU "${CODEX_THEMES_PROTOCOL_KEY}" "URL Protocol" ""
  WriteRegStr HKCU "${CODEX_THEMES_PROTOCOL_KEY}\DefaultIcon" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\",0'
  WriteRegStr HKCU "${CODEX_THEMES_PROTOCOL_KEY}\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'

  WriteRegStr HKCU "${CODEX_THEME_EXTENSION_KEY}" "" "${CODEX_THEME_PROGID}"
  WriteRegNone HKCU "${CODEX_THEME_EXTENSION_KEY}\OpenWithProgids" "${CODEX_THEME_PROGID}"
  WriteRegStr HKCU "${CODEX_THEME_PROGID_KEY}" "" "Codex Theme Package"
  WriteRegStr HKCU "${CODEX_THEME_PROGID_KEY}\DefaultIcon" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\",0'
  WriteRegStr HKCU "${CODEX_THEME_PROGID_KEY}\shell" "" "open"
  WriteRegStr HKCU "${CODEX_THEME_PROGID_KEY}\shell\open" "" "Open with Codex Themes"
  WriteRegStr HKCU "${CODEX_THEME_PROGID_KEY}\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'

  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "${CODEX_THEMES_PROTOCOL_KEY}\shell\open\command" ""
  ${If} $0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
    DeleteRegKey HKCU "${CODEX_THEMES_PROTOCOL_KEY}"
  ${EndIf}

  ReadRegStr $0 HKCU "${CODEX_THEME_PROGID_KEY}\shell\open\command" ""
  ${If} $0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
    ReadRegStr $1 HKCU "${CODEX_THEME_EXTENSION_KEY}" ""
    ${If} $1 == "${CODEX_THEME_PROGID}"
      DeleteRegValue HKCU "${CODEX_THEME_EXTENSION_KEY}" ""
    ${EndIf}
    DeleteRegValue HKCU "${CODEX_THEME_EXTENSION_KEY}\OpenWithProgids" "${CODEX_THEME_PROGID}"
    DeleteRegKey /ifempty HKCU "${CODEX_THEME_EXTENSION_KEY}\OpenWithProgids"
    DeleteRegKey /ifempty HKCU "${CODEX_THEME_EXTENSION_KEY}"
    DeleteRegKey HKCU "${CODEX_THEME_PROGID_KEY}"
  ${EndIf}

  ReadRegStr $0 HKCU "${WINDOWS_RUN_KEY}" "Codex Themes"
  ${If} $0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --hidden'
  ${OrIf} $0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\"'
    DeleteRegValue HKCU "${WINDOWS_RUN_KEY}" "Codex Themes"
  ${EndIf}

  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend
