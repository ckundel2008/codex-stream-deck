on run
  set userId to do shell script "/usr/bin/id -u"
  try
    set serviceName to "gui/" & userId & "/de.kundel.codex-micro"
    set plistPath to (POSIX path of (path to home folder)) & "Library/LaunchAgents/de.kundel.codex-micro.plist"
    do shell script "/bin/launchctl enable " & serviceName & "; /bin/launchctl bootstrap gui/" & userId & " " & quoted form of plistPath & " 2>/dev/null || /bin/launchctl kickstart " & serviceName
    display notification "Stream Deck läuft unabhängig von Codex. Kein App-Neustart nötig." with title "Codex Stream Deck"
  on error errorText
    display dialog "Der sichere Autostart konnte nicht gestartet werden: " & errorText buttons {"OK"} default button "OK" with icon stop with title "Codex Stream Deck"
  end try
end run
