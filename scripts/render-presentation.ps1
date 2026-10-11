param([string]$InputFile, [string]$OutputDirectory, [switch]$CleanupOnly, [switch]$ProbeOnly, [ValidateSet('auto', 'wps', 'powerpoint')][string]$Renderer = 'auto')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$available = @()
foreach ($engine in @(@{ id='wps'; label='WPS'; candidates=@('KWPP.Application', 'KWPP.Application.1', 'WPP.Application') }, @{ id='powerpoint'; label='Microsoft PowerPoint'; candidates=@('PowerPoint.Application') })) {
    foreach ($candidateId in $engine.candidates) {
        try { $registered = [Type]::GetTypeFromProgID($candidateId) } catch { $registered = $null }
        if ($registered) { $available += @{ id=$engine.id; label=$engine.label; progId=$candidateId }; break }
    }
}
if ($ProbeOnly) {
    [Console]::Out.Write((@{ available=($available.Count -gt 0); preferred=($available | Select-Object -First 1).id; renderers=@($available) } | ConvertTo-Json -Depth 4 -Compress))
    exit 0
}
if ($CleanupOnly) {
    foreach ($engine in $available) { try {
        $running = [Runtime.InteropServices.Marshal]::GetActiveObject($engine.progId)
        for ($i = $running.Presentations.Count; $i -ge 1; $i--) {
            $candidate = $running.Presentations.Item($i)
            if ($candidate.FullName -eq $InputFile) { $candidate.Close() }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($candidate)
        }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($running)
    } catch { } }
    exit 0
}
$application = $null
$presentation = $null
$ownedApplication = $false
$script:wordTotal = 0
$script:textTotal = 0
function Add-Text($range, $blocks, $words) {
    $text = ([string]$range.Text).Replace([char]13, [char]10).Replace([char]11, [char]10).Trim()
    if (-not $text) { return }
    $script:textTotal += $text.Length
    if ($script:textTotal -gt 300000) { throw 'PRESENTATION_TEXT_LIMIT:300000' }
    $blockIndex = $blocks.Count
    $blocks.Add([ordered]@{ text = $text; x = [double]$range.BoundLeft; y = [double]$range.BoundTop; w = [double]$range.BoundWidth; h = [double]$range.BoundHeight })
    # WPS 12 implements Characters(), but Words() raises NotImplementedException.
    $segments = $null
    if ($selectedEngine.id -eq 'wps') {
        $segments = [regex]::Matches([string]$range.Text, '[\p{IsCJKUnifiedIdeographs}]|[^\s\p{IsCJKUnifiedIdeographs}]+[ \t]*')
        $count = $segments.Count
    } else { $count = [int]$range.Words().Count }
    for ($wordIndex = 1; $wordIndex -le $count -and $script:wordTotal -lt 40000; $wordIndex++) {
        if ($segments) { $segment = $segments[$wordIndex - 1]; $word = $range.Characters($segment.Index + 1, $segment.Length) }
        else { $word = $range.Words($wordIndex, 1) }
        $wordText = [string]$word.Text
        if ($wordText.Trim() -and $word.BoundWidth -gt 0 -and $word.BoundHeight -gt 0) {
            $words.Add([ordered]@{ text = $wordText; block = $blockIndex; x = [double]$word.BoundLeft; y = [double]$word.BoundTop; w = [double]$word.BoundWidth; h = [double]$word.BoundHeight })
            $script:wordTotal++
        }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
}
function Read-Shape($shape, $blocks, $words) {
    if ($shape.Type -eq 6) {
        for ($index = 1; $index -le $shape.GroupItems.Count; $index++) {
            $child = $shape.GroupItems.Item($index)
            Read-Shape $child $blocks $words
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($child)
        }
    } elseif ($shape.HasTable -eq -1) {
        for ($row = 1; $row -le $shape.Table.Rows.Count; $row++) {
            for ($column = 1; $column -le $shape.Table.Columns.Count; $column++) {
                Add-Text $shape.Table.Cell($row, $column).Shape.TextFrame.TextRange $blocks $words
            }
        }
    } elseif ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
        $range = $shape.TextFrame.TextRange
        Add-Text $range $blocks $words
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($range)
    }
}
try {
    $choices = @($available | Where-Object { $Renderer -eq 'auto' -or $_.id -eq $Renderer })
    $selectedEngine = $null
    foreach ($engine in $choices) {
        try { $application = New-Object -ComObject $engine.progId; $selectedEngine = $engine; break } catch { }
    }
    if (-not $application) { throw 'NO_PRESENTATION_ENGINE: Install or repair WPS desktop Presentation or Microsoft PowerPoint.' }
    $ownedApplication = $application.Presentations.Count -eq 0
    # WPS exposes some Office properties as compatibility stubs. Do not depend on them.
    try { $oldSecurity = $application.AutomationSecurity; $hasSecurity=$true; $application.AutomationSecurity = 3 } catch { $hasSecurity=$false }
    try { $oldAlerts = $application.DisplayAlerts; $hasAlerts=$true; $application.DisplayAlerts = 1 } catch { $hasAlerts=$false }
    # Read-only, no presentation window. Input is checked before this helper opens it.
    $presentation = $application.Presentations.Open($InputFile, -1, 0, 0)
    if ($presentation.Slides.Count -gt 300) { throw ('PRESENTATION_SLIDE_LIMIT:300:' + $presentation.Slides.Count) }
    [Console]::Out.WriteLine('CLEVER_PROGRESS:' + (@{ page=0; total=$presentation.Slides.Count; renderer=$selectedEngine.label } | ConvertTo-Json -Compress))
    $width = [double]$presentation.PageSetup.SlideWidth
    $height = [double]$presentation.PageSetup.SlideHeight
    if ($width -le 0 -or $height -le 0) { throw 'Invalid slide dimensions.' }
    $scale = [Math]::Min(1600 / $width, 1600 / $height)
    $slides = [Collections.Generic.List[object]]::new()
    for ($page = 1; $page -le $presentation.Slides.Count; $page++) {
        $slide = $presentation.Slides.Item($page)
        $filename = "slide-$page.png"
        $slide.Export((Join-Path $OutputDirectory $filename), 'PNG', [int]($width * $scale), [int]($height * $scale))
        $blocks = [Collections.Generic.List[object]]::new()
        $words = [Collections.Generic.List[object]]::new()
        for ($index = 1; $index -le $slide.Shapes.Count; $index++) {
            $shape = $slide.Shapes.Item($index)
            Read-Shape $shape $blocks $words
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shape)
        }
        $slides.Add([ordered]@{ page = $page; image = $filename; texts = $blocks.ToArray(); words = $words.ToArray() })
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($slide)
        [Console]::Out.WriteLine('CLEVER_PROGRESS:' + (@{ page=$page; total=$presentation.Slides.Count; renderer=$selectedEngine.label } | ConvertTo-Json -Compress))
    }
    $manifest = [ordered]@{ width = $width; height = $height; slides = $slides.ToArray(); renderer = $selectedEngine.label; rendererId = $selectedEngine.id }
    [IO.File]::WriteAllText((Join-Path $OutputDirectory 'manifest.json'), ($manifest | ConvertTo-Json -Depth 12 -Compress), [Text.UTF8Encoding]::new($false))
} catch {
    if ($_.Exception.Message -like 'NO_PRESENTATION_ENGINE:*') { [Console]::Error.Write($_.Exception.Message) }
    else { [Console]::Error.Write('PRESENTATION_RENDER_FAILED: ' + $selectedEngine.label + ': ' + $_.Exception.Message) }
    exit 1
} finally {
    if ($presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
    if ($application) {
        if ($hasSecurity) { try { $application.AutomationSecurity = $oldSecurity } catch { } }
        if ($hasAlerts) { try { $application.DisplayAlerts = $oldAlerts } catch { } }
        if ($ownedApplication -and $application.Presentations.Count -eq 0) { $application.Quit() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($application)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
