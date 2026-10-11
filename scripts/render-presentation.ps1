param([string]$InputFile, [string]$OutputDirectory, [switch]$CleanupOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($CleanupOnly) {
    try {
        $running = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
        for ($i = $running.Presentations.Count; $i -ge 1; $i--) {
            $candidate = $running.Presentations.Item($i)
            if ($candidate.FullName -eq $InputFile) { $candidate.Close() }
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($candidate)
        }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($running)
    } catch { }
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
    if ($script:textTotal -gt 300000) { throw 'Presentation text exceeds 300,000 characters.' }
    $blockIndex = $blocks.Count
    $blocks.Add([ordered]@{ text = $text; x = [double]$range.BoundLeft; y = [double]$range.BoundTop; w = [double]$range.BoundWidth; h = [double]$range.BoundHeight })
    $count = [int]$range.Words().Count
    for ($wordIndex = 1; $wordIndex -le $count -and $script:wordTotal -lt 40000; $wordIndex++) {
        $word = $range.Words($wordIndex, 1)
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
    $application = New-Object -ComObject PowerPoint.Application
    $ownedApplication = $application.Presentations.Count -eq 0
    $oldSecurity = $application.AutomationSecurity
    $oldAlerts = $application.DisplayAlerts
    $application.AutomationSecurity = 3
    $application.DisplayAlerts = 1
    # Read-only, no presentation window. Macros stay disabled for legacy PPT too.
    $presentation = $application.Presentations.Open($InputFile, -1, 0, 0)
    if ($presentation.Slides.Count -gt 150) { throw 'A maximum of 150 slides is supported.' }
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
    }
    $manifest = [ordered]@{ width = $width; height = $height; slides = $slides.ToArray(); renderer = 'Microsoft PowerPoint' }
    [IO.File]::WriteAllText((Join-Path $OutputDirectory 'manifest.json'), ($manifest | ConvertTo-Json -Depth 12 -Compress), [Text.UTF8Encoding]::new($false))
} catch {
    [Console]::Error.Write('PowerPoint could not read this presentation. Check that PowerPoint is installed and the file is not encrypted or damaged. ' + $_.Exception.Message)
    exit 1
} finally {
    if ($presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
    if ($application) {
        try { $application.AutomationSecurity = $oldSecurity; $application.DisplayAlerts = $oldAlerts } catch { }
        if ($ownedApplication -and $application.Presentations.Count -eq 0) { $application.Quit() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($application)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
