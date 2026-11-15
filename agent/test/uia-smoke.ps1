# Smoke test for the Windows UI Automation helper, run on a real Windows machine (CI or by hand):
#   powershell -ExecutionPolicy Bypass -File agent/test/uia-smoke.ps1
# Launches Notepad, then checks: list windows, read its controls, type text into the editor, read it back, close it.
$ErrorActionPreference = "Stop"
$helper = Join-Path $PSScriptRoot "..\src\main\agent\a11y\uia_helper.ps1"
function Call($obj) {
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 6)))
  $raw = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -Request $b64
  return ($raw -join "`n") | ConvertFrom-Json
}
$fail = 0
function Check($ok, $label, $detail = "") { if ($ok) { Write-Host "PASS $label" } else { Write-Host "FAIL $label $detail"; $script:fail++ } }

$p = Start-Process notepad.exe -PassThru
Start-Sleep -Seconds 4
try {
  $w = Call @{ cmd = "windows" }
  Check ($w.ok -eq $true) "windows command ok" ($w | ConvertTo-Json -Compress)
  $note = $w.windows | Where-Object { $_.title -match "Notepad" } | Select-Object -First 1
  Check ($null -ne $note) "Notepad is listed" (($w.windows | ForEach-Object { $_.title }) -join " | ")

  $s = Call @{ cmd = "snapshot"; window = "Notepad"; max_nodes = 200 }
  Check ($s.ok -eq $true -and $s.nodes.Count -gt 0) "snapshot reads controls" ($s | ConvertTo-Json -Compress -Depth 4)
  $edit = $s.nodes | Where-Object { $_.role -in @("entry", "document text") } | Select-Object -First 1
  Check ($null -ne $edit) "found the text editor control" (($s.nodes | ForEach-Object { "$($_.role):$($_.name)" }) -join " | ")

  if ($edit) {
    $r = Call @{ cmd = "act"; path = $edit.path; role = $edit.role; name = $edit.name; op = "set_text"; text = "karvix uia smoke" }
    Check ($r.ok -eq $true) "set_text into the editor" ($r | ConvertTo-Json -Compress)
    $s2 = Call @{ cmd = "snapshot"; window = "Notepad"; max_nodes = 200 }
    $edit2 = $s2.nodes | Where-Object { $_.role -in @("entry", "document text") } | Select-Object -First 1
    Check ($edit2.text -eq "karvix uia smoke") "text reads back" ($s2 | ConvertTo-Json -Compress -Depth 4)

    $bad = Call @{ cmd = "act"; path = $edit.path; role = $edit.role; name = "NOT THE NAME"; op = "set_text"; text = "x" }
    Check ($bad.ok -eq $false -and $bad.error -eq "stale") "stale element is refused" ($bad | ConvertTo-Json -Compress)
  }

  if ($note) {
    $c = Call @{ cmd = "act"; path = $note.path; role = "frame"; op = "close" }
    Check ($c.ok -eq $true) "close window" ($c | ConvertTo-Json -Compress)
  }
} finally {
  Start-Sleep -Seconds 2
  Get-Process notepad -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
if ($fail -gt 0) { Write-Host "$fail check(s) failed"; exit 1 }
Write-Host "All checks passed"
