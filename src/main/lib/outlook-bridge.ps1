# ============================================================
#  SightTwin · 经典 Outlook 本机 MAPI 桥（路线 C）
#  原理：通过经典 Outlook 的已登录 MAPI Profile 读取本机 OST 数据，
#  不发起任何登录、不走网络、不弹登录窗口。
#  用法：powershell -NoProfile -File outlook-bridge.ps1 <command> <argsJsonFile> <outJsonFile>
#  command: test | mail | mail-one | events
#  参数从 argsJsonFile 读 JSON，结果写到 outJsonFile（UTF-8 JSON）。
# ============================================================
param(
  [string]$Command,
  [string]$ArgsFile,
  [string]$OutFile
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

# ---- 读取 JSON 参数 ----
$opts = @{}
if ($ArgsFile -and (Test-Path $ArgsFile)) {
  $obj = Get-Content $ArgsFile -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($p in $obj.PSObject.Properties) { $opts[$p.Name] = $p.Value }
}

function Get-Int($key, $default) {
  if ($null -ne $opts[$key]) { return [int]$opts[$key] }
  return $default
}

# ---- Outlook 进程存活探测（决定是否退出时关闭 Outlook）----
# COM 是单实例：若用户已开着 Outlook，我们复用它的实例，结束时绝不能 Quit/Logoff；
# 若是我们拉起的，则保持后台驻留（不 Quit），后续调用直接走单实例复用，更快。
$existingOutlook = [bool](Get-Process OUTLOOK -ErrorAction SilentlyContinue)

$ns = $null
$app = $null
try {
  $app = New-Object -ComObject Outlook.Application
  $ns = $app.GetNamespace('MAPI')

  switch ($Command) {
    'test' {
      $inbox = $ns.GetDefaultFolder(6)
      $cal = $ns.GetDefaultFolder(9)
      $result = @{ ok = $true; data = @{
        profile = $ns.DisplayName
        inboxName = $inbox.Name
        inboxCount = [int]$inbox.Items.Count
        calendarName = $cal.Name
        outlookVersion = $app.Version
      } }
    }
    'mail' {
      $limit = Get-Int 'limit' 10
      $days = Get-Int 'days' 7
      $inbox = $ns.GetDefaultFolder(6)
      $cutoff = (Get-Date).AddDays(-$days)
      $recent = $inbox.Items
      $recent.Sort('[ReceivedTime]', $true)  # 最新的在前

      $entries = New-Object System.Collections.ArrayList
      $i = 0
      foreach ($m in $recent) {
        if ($i -ge $limit) { break }
        $rt = [datetime]$m.ReceivedTime
        if ($rt -lt $cutoff) { break }  # 已按时间倒序，早于 cutoff 即止
        if ([int]$m.Class -ne 43) { continue }  # 43 = olMail (IPM.Note)；跳过会议/联系人/便签等
        $body = ''
        try { $body = [string]$m.Body } catch {}
        if (-not $body) { try { $body = [string]$m.BodyFirst } catch {}
          if ($body -and $body.Length -gt 2000) { $body = $body.Substring(0, 2000) } }
        [void]$entries.Add([pscustomobject]@{
          entryId = $m.EntryID
          subject = [string]$m.Subject
          from = [string]$m.SenderName
          fromEmail = [string]$m.SenderEmailAddress
          received = $m.ReceivedTime.ToString('o')
          unread = [bool]$m.UnRead
          hasAttach = [bool]($m.Attachments.Count -gt 0)
          body = $body
          html = $null
        })
        $i++
      }

      $result = @{ ok = $true; data = @{ count = $entries.Count; emails = $entries } }
    }
    'mail-one' {
      $entryId = [string]$opts['entryId']
      if (-not $entryId) { throw '缺少 entryId 参数' }
      try {
        $item = $ns.GetItemFromID($entryId)
        if ($null -eq $item) { throw '找不到该邮件' }
        $subject = [string]$item.Subject
        $body = [string]$item.Body
        $html = $null
        try {
          $h = [string]$item.HTMLBody
          if ($h) { $html = $h }
        } catch {}
      } catch {
        $result = @{ ok = $false; error = "读取邮件失败: $($_.Exception.Message)" }
        return
      }
      $result = @{ ok = $true; data = @{ subject = $subject; body = $body; html = $html } }
    }
    'events' {
      $days = Get-Int 'days' 7
      $cal = $ns.GetDefaultFolder(9)
      $now = Get-Date
      $end = $now.AddDays($days)
      $evts = $cal.Items
      $evts.Sort('[Start]', $false)  # 升序
      $list = New-Object System.Collections.ArrayList
      foreach ($e in $evts) {
        if ($e.Start -gt $end) { break }      # 已升序，超出范围即止
        if ([int]$e.Class -ne 26) { continue }  # 26 = olAppointment（不是 46，那是 olContactItem）
        if ($e.Start -lt $now) { continue }   # 跳过已开始的
        # IsOnlineMeeting/OnlineMeetingUrl 在 Outlook 2010 以下不存在，做版本容错
        $online = $false; $meetingUrl = ''
        try { $online = [bool]$e.IsOnlineMeeting } catch {}
        try { if ($online) { $meetingUrl = [string]$e.OnlineMeetingUrl } } catch {}
        [void]$list.Add([pscustomobject]@{
          subject = [string]$e.Subject
          start = $e.Start.ToString('o')
          end = $e.End.ToString('o')
          location = [string]$e.Location
          organizer = [string]$e.Organizer
          online = $online
          meetingUrl = $meetingUrl
        })
      }
      $result = @{ ok = $true; data = @{ count = $list.Count; events = $list } }
    }
    'watch' {
      # ---- 常驻轮询推送模式（已验证可用）----
      # 以启动时刻为基线（不推历史数据），每 interval 秒扫描一次 OST，
      # 发现新邮件/新日程就往 stdout 写一行 JSON（Node 端按行读取并 SSE 广播）。
      # 说明：曾尝试 COM 事件驱动（ItemAdd），但 Outlook 的 ItemAdd 是 COM 事件，
      #   PowerShell 的 Register-ObjectEvent 只能订阅 .NET 事件 → 不可行；
      #   C# 事件 sink 需要 PIA 16.0（本机仅有 GAC 15.0，无 Events 属性）→ 暂不可行。
      #   轮询 10s 在 POC 场景下开销可忽略（只读已打开的 OST，COM 单实例复用）。
      $intervalSec = Get-Int 'interval' 10
      $maxEmit = 20
      $inbox = $ns.GetDefaultFolder(6)
      $cal = $ns.GetDefaultFolder(9)
      $watchStart = Get-Date

      # 基线 1（邮件）：最新邮件的接收时间。
      # 新邮件到达时 ReceivedTime 一定 > 当前最新邮件时间（除非时钟回拨），
      # 所以用"最新邮件时间"做基线能精确捕捉增量，且不会重推历史。
      $lastMailTime = [datetime]::MinValue
      try {
        $tmp = $inbox.Items; $tmp.Sort('[ReceivedTime]', $true)
        if ($tmp.Count -gt 0) { $lastMailTime = [datetime]$tmp.Item(1).ReceivedTime }
      } catch {}

      # 基线 2（日程）：启动时刻。
      # 日程的 Start 是"未来时间"，不能用"最新日程时间"做基线
      # （否则 Start 早于最新日程的新日程会被误判为旧数据）。
      # 用启动时刻做基线：所有 Start > 启动时刻的日程都算"新增/更新"。
      # 代价：启动时会把已存在的未来日程也推一遍（一次性，可接受）。
      $lastEventTime = $watchStart

      Write-Output (@{ type='status'; message='watcher 已启动（每 {0}s 轮询，零网络）' -f $intervalSec; baselineMail=$lastMailTime.ToString('o'); baselineEvent=$lastEventTime.ToString('o'); intervalSec=$intervalSec } | ConvertTo-Json -Compress)

      while ($true) {
        Start-Sleep -Seconds $intervalSec
        # ---- 新邮件（降序遍历，遇到 <= 基线即止）----
        try {
          $items = $inbox.Items; $items.Sort('[ReceivedTime]', $true)
          if ($items.Count -gt 0) {
            $emitted = 0
            foreach ($m in $items) {
              $rt = [datetime]$m.ReceivedTime
              if ($rt -le $lastMailTime) { break }
              if ([int]$m.Class -ne 43) { continue }
              $lastMailTime = $rt
              $emitted++
              Write-Output (@{ type='mail'; subject=[string]$m.Subject; from=[string]$m.SenderName; fromEmail=[string]$m.SenderEmailAddress; received=$rt.ToString('o'); unread=[bool]$m.UnRead } | ConvertTo-Json -Compress)
              if ($emitted -ge $maxEmit) { break }
            }
          }
        } catch {}
        # ---- 新日程（降序遍历，遇到 <= 基线即止）----
        try {
          $citems = $cal.Items; $citems.Sort('[Start]', $true)
          if ($citems.Count -gt 0) {
            $emitted = 0
            foreach ($e in $citems) {
              $st = [datetime]$e.Start
              if ($st -le $lastEventTime) { break }
              if ([int]$e.Class -ne 26) { continue }
              $lastEventTime = $st
              $emitted++
              Write-Output (@{ type='event'; subject=[string]$e.Subject; start=$st.ToString('o'); end=([datetime]$e.End).ToString('o'); location=[string]$e.Location; organizer=[string]$e.Organizer } | ConvertTo-Json -Compress)
              if ($emitted -ge $maxEmit) { break }
            }
          }
        } catch {}
      }
    }
    default {
      $result = @{ ok = $false; error = "未知命令: $Command" }
    }
  }
  # 清理：不主动关闭 Outlook（避免杀掉用户正在用的实例，也避免反复开关 OST 产生文件锁冲突）
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ns) | Out-Null
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null
  [System.GC]::Collect() | Out-Null
} catch {
  $result = @{ ok = $false; error = "$($_.Exception.Message)" }
  try { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ns) | Out-Null; [System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null } catch {}
}

$json = $result | ConvertTo-Json -Depth 10 -Compress
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Output "done"
