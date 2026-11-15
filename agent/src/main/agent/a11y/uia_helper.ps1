# Karvix Windows accessibility helper (UI Automation). Same JSON protocol as atspi_helper.py:
#   -Request <base64 utf8 json>   -> one JSON object on stdout.
#   {"cmd":"windows"} | {"cmd":"snapshot","window":"..","frame_path":"..","max_nodes":300}
#   {"cmd":"act","path":"..","role":"..","name":"..","op":"click|set_text|insert_text|focus|close","text":".."}
#   {"cmd":"focused_editable"}
# Elements are addressed by their path of child indices from the desktop root plus expected role+name, so a stale
# address is refused ("the window changed") instead of acting on the wrong control.
# NOTE: written without access to a Windows machine — to be verified by running it (see docs/PC_CONTROL_PLAN.md).
param([Parameter(Mandatory = $true)][string]$Request)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class KvxFg { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }
"@
} catch {
  @{ ok = $false; error = "missing_uia"; detail = "$_" } | ConvertTo-Json -Compress; exit 0
}
$AE = [System.Windows.Automation.AutomationElement]
$CT = [System.Windows.Automation.ControlType]
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$req = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Request)) | ConvertFrom-Json

$RoleMap = @{
  "Button" = "push button"; "CheckBox" = "check box"; "RadioButton" = "radio button"; "ComboBox" = "combo box";
  "Edit" = "entry"; "Document" = "document text"; "Hyperlink" = "link"; "MenuItem" = "menu item"; "Menu" = "menu";
  "ListItem" = "list item"; "TabItem" = "page tab"; "TreeItem" = "tree item"; "DataItem" = "table cell";
  "Text" = "label"; "Window" = "frame"; "TitleBar" = "title bar"; "StatusBar" = "status bar"; "Slider" = "slider";
  "Spinner" = "spin button"; "SplitButton" = "push button"; "Header" = "heading"; "HeaderItem" = "heading"
}
$Interactive = @("push button", "check box", "radio button", "combo box", "entry", "document text", "link", "menu item", "menu", "list item", "page tab", "tree item", "table cell", "slider", "spin button")
$KeepNamed = @("label", "heading", "title bar", "status bar")

function Role($el) {
  $n = $el.Current.ControlType.ProgrammaticName -replace "^ControlType\.", ""
  if ($RoleMap.ContainsKey($n)) { return $RoleMap[$n] } else { return $n.ToLower() }
}
function Pattern($el, $p) { $o = $null; if ($el.TryGetCurrentPattern($p, [ref]$o)) { return $o } else { return $null } }
function Children($el) { $c = $walker.GetFirstChild($el); while ($c -ne $null) { $c; $c = $walker.GetNextSibling($c) } }

function Windows-List {
  $fg = $null
  try { $fg = $AE::FromHandle([KvxFg]::GetForegroundWindow()) } catch {}
  $i = 0; $out = @()
  foreach ($w in (Children ($AE::RootElement))) {
    $name = $w.Current.Name
    $app = ""
    try { $app = (Get-Process -Id $w.Current.ProcessId -ErrorAction Stop).ProcessName } catch {}
    $active = $false
    if ($fg -ne $null) { try { $active = [System.Windows.Automation.Automation]::Compare($w, $fg) } catch {} }
    if ($name) { $out += @{ path = "$i"; app = $app; title = $name; active = [bool]$active } }
    $i++
  }
  return $out
}

function Resolve-Path-El([string]$path) {
  $el = $AE::RootElement
  foreach ($part in $path.Split(".")) {
    $idx = [int]$part; $c = $walker.GetFirstChild($el)
    for ($k = 0; $k -lt $idx -and $c -ne $null; $k++) { $c = $walker.GetNextSibling($c) }
    if ($c -eq $null) { return $null }
    $el = $c
  }
  return $el
}

function Pick-Window($query, $framePath) {
  if ($framePath) { $el = Resolve-Path-El $framePath; if ($el) { return @{ path = $framePath; el = $el } } else { return $null } }
  $q = ("" + $query).ToLower()
  $wins = Windows-List
  $m = $null
  if ($q) { $m = $wins | Where-Object { $_.title.ToLower().Contains($q) -or $_.app.ToLower().Contains($q) } | Select-Object -First 1 }
  else { $m = $wins | Where-Object { $_.active } | Select-Object -First 1 }
  if (-not $m) { return $null }
  return @{ path = $m.path; el = (Resolve-Path-El $m.path); app = $m.app }
}

function Snapshot($query, $framePath, [int]$maxNodes) {
  $picked = Pick-Window $query $framePath
  if (-not $picked -or -not $picked.el) { return @{ ok = $false; error = "no_window"; detail = "No matching window is visible to accessibility." } }
  $deadline = (Get-Date).AddSeconds(6); $nodes = New-Object System.Collections.ArrayList
  function Walk($el, [string]$path, [int]$depth, [string]$parentName) {
    if ($nodes.Count -ge $maxNodes -or $depth -gt 16 -or (Get-Date) -gt $deadline) { return }
    $cur = $el.Current
    if ($cur.IsOffscreen -and $depth -gt 0) { return }
    $role = Role $el; $name = $cur.Name
    $keep = ($Interactive -contains $role) -or (($KeepNamed -contains $role) -and $name)
    if (($KeepNamed -contains $role) -and $name -and $name -eq $parentName) { $keep = $false }
    if ($keep -and $depth -gt 0) {
      $item = @{ path = $path; role = $role; name = ("" + $name).Substring(0, [Math]::Min(120, ("" + $name).Length)) }
      $flags = @()
      if (-not $cur.IsEnabled) { $flags += "disabled" }
      if ($cur.HasKeyboardFocus) { $flags += "focused" }
      $vp = Pattern $el ([System.Windows.Automation.ValuePattern]::Pattern)
      if ($vp) {
        try { $v = $vp.Current.Value; if ($v) { $item.text = $v.Substring(0, [Math]::Min(300, $v.Length)) }; if (-not $vp.Current.IsReadOnly -and $role -in @("entry", "document text")) { $flags += "editable" } } catch {}
      }
      $tp = Pattern $el ([System.Windows.Automation.TogglePattern]::Pattern)
      if ($tp) { try { if ($tp.Current.ToggleState -eq "On") { $flags += "checked" } } catch {} }
      $sp = Pattern $el ([System.Windows.Automation.SelectionItemPattern]::Pattern)
      if ($sp) { try { if ($sp.Current.IsSelected) { $flags += "selected" } } catch {} }
      if ($flags.Count) { $item.flags = $flags }
      [void]$nodes.Add($item)
    }
    $next = if ($keep -and ($Interactive -contains $role) -and $name) { $name } else { $parentName }
    $i = 0
    foreach ($c in (Children $el)) { Walk $c "$path.$i" ($depth + 1) $next; $i++ }
  }
  Walk $picked.el $picked.path 0 ""
  $app = if ($picked.app) { $picked.app } else { "" }
  return @{ ok = $true; app = $app; title = $picked.el.Current.Name; nodes = @($nodes); truncated = ($nodes.Count -ge $maxNodes) }
}

function Act($r) {
  $el = $null
  try { $el = Resolve-Path-El $r.path } catch {}
  if (-not $el) { return @{ ok = $false; error = "stale"; detail = "That element is gone — look at the screen again." } }
  if ($r.role -and (Role $el) -ne $r.role) { return @{ ok = $false; error = "stale"; detail = "The window changed — look at the screen again." } }
  if ($r.name -ne $null) { $n = "" + $el.Current.Name; if ($n.Substring(0, [Math]::Min(120, $n.Length)) -ne $r.name) { return @{ ok = $false; error = "stale"; detail = "The window changed — look at the screen again." } } }
  try {
    switch ($r.op) {
      "click" {
        $p = Pattern $el ([System.Windows.Automation.InvokePattern]::Pattern); if ($p) { $p.Invoke(); return @{ ok = $true; action = "invoke" } }
        $p = Pattern $el ([System.Windows.Automation.TogglePattern]::Pattern); if ($p) { $p.Toggle(); return @{ ok = $true; action = "toggle" } }
        $p = Pattern $el ([System.Windows.Automation.SelectionItemPattern]::Pattern); if ($p) { $p.Select(); return @{ ok = $true; action = "select" } }
        $p = Pattern $el ([System.Windows.Automation.ExpandCollapsePattern]::Pattern); if ($p) { $p.Expand(); return @{ ok = $true; action = "expand" } }
        return @{ ok = $false; error = "no_action"; detail = "This element can't be clicked." }
      }
      "set_text" {
        $p = Pattern $el ([System.Windows.Automation.ValuePattern]::Pattern)
        if (-not $p -or $p.Current.IsReadOnly) { return @{ ok = $false; error = "not_editable"; detail = "This field can't be typed into." } }
        $p.SetValue([string]$r.text); return @{ ok = $true }
      }
      "insert_text" {
        $el.SetFocus(); Start-Sleep -Milliseconds 120
        $esc = ([string]$r.text) -replace '([+^%~(){}\[\]])', '{$1}'
        [System.Windows.Forms.SendKeys]::SendWait($esc); return @{ ok = $true }
      }
      "focus" { $el.SetFocus(); return @{ ok = $true } }
      "close" {
        $p = Pattern $el ([System.Windows.Automation.WindowPattern]::Pattern)
        if (-not $p) { return @{ ok = $false; error = "no_action"; detail = "This window can't be closed that way." } }
        $p.Close(); return @{ ok = $true }
      }
    }
  } catch { return @{ ok = $false; error = "failed"; detail = ("" + $_.Exception.Message).Substring(0, [Math]::Min(200, ("" + $_.Exception.Message).Length)) } }
  return @{ ok = $false; error = "bad_op"; detail = "Unknown operation $($r.op)" }
}

function Focused-Editable {
  try {
    $f = $AE::FocusedElement
    if ($f -eq $null) { return @{ ok = $true; element = $null } }
    $vp = Pattern $f ([System.Windows.Automation.ValuePattern]::Pattern)
    if (-not $vp -or $vp.Current.IsReadOnly) { return @{ ok = $true; element = $null } }
    # Rebuild the path from the root so the address works like every other element's.
    $chain = @(); $cur = $f
    while ($cur -ne $null -and -not [System.Windows.Automation.Automation]::Compare($cur, $AE::RootElement)) { $chain += $cur; $cur = $walker.GetParent($cur) }
    [array]::Reverse($chain); $path = @()
    $parent = $AE::RootElement
    foreach ($c in $chain) { $k = 0; $s = $walker.GetFirstChild($parent); while ($s -ne $null -and -not [System.Windows.Automation.Automation]::Compare($s, $c)) { $s = $walker.GetNextSibling($s); $k++ }; $path += $k; $parent = $c }
    return @{ ok = $true; element = @{ path = ($path -join "."); role = (Role $f); name = ("" + $f.Current.Name) } }
  } catch { return @{ ok = $true; element = $null } }
}

try {
  switch ($req.cmd) {
    "windows" { $out = @{ ok = $true; windows = @(Windows-List) } }
    "snapshot" { $mx = if ($req.max_nodes) { [int]$req.max_nodes } else { 300 }; $out = Snapshot $req.window $req.frame_path $mx }
    "act" { $out = Act $req }
    "focused_editable" { $out = Focused-Editable }
    default { $out = @{ ok = $false; error = "bad_cmd" } }
  }
} catch { $out = @{ ok = $false; error = "helper_crash"; detail = ("" + $_.Exception.Message) } }
$out | ConvertTo-Json -Compress -Depth 8
