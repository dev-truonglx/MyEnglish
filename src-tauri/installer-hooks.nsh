; MyEnglish NSIS installer hooks
; Called by Tauri's generated installer.nsi before/after installation and uninstallation.
;
; NSIS_HOOK_PREINSTALL runs before files are extracted:
;   - Gracefully and forcefully kills any running MyEnglish process (including tray/background/WebView2)
;   - Waits until file locks on MyEnglish.exe are released before file extraction begins

!macro KillRunningMyEnglish
  DetailPrint "Đang đóng MyEnglish nếu đang chạy..."

  ; 1. Try graceful quit first (WM_CLOSE to windows)
  ${If} ${RunningX64}
    nsExec::Exec '"$WINDIR\Sysnative\taskkill.exe" /IM MyEnglish.exe'
    nsExec::Exec '"$WINDIR\Sysnative\taskkill.exe" /IM tauri-app.exe'
  ${EndIf}
  nsExec::Exec '"$SYSDIR\taskkill.exe" /IM MyEnglish.exe'
  nsExec::Exec '"$SYSDIR\taskkill.exe" /IM tauri-app.exe'

  Sleep 500

  ; 2. Force-kill via native 64-bit and 32-bit taskkill (/F /T kills entire process tree)
  ${If} ${RunningX64}
    nsExec::Exec '"$WINDIR\Sysnative\taskkill.exe" /F /IM MyEnglish.exe /T'
    nsExec::Exec '"$WINDIR\Sysnative\taskkill.exe" /F /IM tauri-app.exe /T'
  ${EndIf}
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM MyEnglish.exe /T'
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM tauri-app.exe /T'

  ; 3. Force-kill via PowerShell by process name
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -Command "Get-Process -Name MyEnglish,tauri-app -ErrorAction SilentlyContinue | Stop-Process -Force"'

  ; 4. Force-kill any orphaned processes running from $INSTDIR (such as msedgewebview2.exe)
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -Command "if (Test-Path \"$INSTDIR\") { Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith(\"$INSTDIR\", [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } }"'

  ; 5. Wait up to 3 seconds for file handles to be released by Windows kernel
  DetailPrint "Đang chờ giải phóng tài nguyên..."
  StrCpy $R4 0
  kill_wait_loop:
    IntOp $R4 $R4 + 1
    ${If} $R4 > 6
      Goto kill_wait_done
    ${EndIf}
    Sleep 500
    ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ClearErrors
      FileOpen $R5 "$INSTDIR\${MAINBINARYNAME}.exe" "a"
      ${IfNot} ${Errors}
        FileClose $R5
        Goto kill_wait_done
      ${EndIf}
    ${Else}
      Goto kill_wait_done
    ${EndIf}
    Goto kill_wait_loop
  kill_wait_done:
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KillRunningMyEnglish
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KillRunningMyEnglish
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Nothing extra needed post-install
!macroend
