param([string]$ProjectDirectory)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$app = New-Object -ComObject PowerPoint.Application
$owned = $app.Presentations.Count -eq 0
$deck = $null
try {
    $deck = $app.Presentations.Add(0)
    $deck.PageSetup.SlideWidth = 960
    $deck.PageSetup.SlideHeight = 540
    $slide = $deck.Slides.Add(1, 12)
    $title = $slide.Shapes.AddTextbox(1, 45, 32, 860, 65)
    $title.TextFrame.TextRange.Text = 'PPT Reading Test'
    $title.TextFrame.TextRange.Font.Size = 36
    $title.TextFrame.TextRange.Font.Bold = -1
    $body = $slide.Shapes.AddTextbox(1, 45, 125, 420, 230)
    $body.TextFrame.TextRange.Text = "Self-attention uses queries, keys and values.`rAn assumption is a premise, not an observed conclusion."
    $body.TextFrame.TextRange.Font.Size = 24
    $body.TextFrame.TextRange.Font.Name = 'Arial'
    [void]$slide.Shapes.AddPicture((Join-Path $ProjectDirectory 'screenshots\clever-read-apple.png'), 0, -1, 500, 125, 400, 250)
    $footer = $slide.Shapes.AddTextbox(1, 45, 450, 860, 40)
    $footer.TextFrame.TextRange.Text = '<img src=x onerror=alert(1)> must remain text.'
    $footer.TextFrame.TextRange.Font.Size = 16
    $second = $deck.Slides.Add(2, 12)
    [void]$second.Shapes.AddPicture((Join-Path $ProjectDirectory 'screenshots\clever-read-apple-settings.png'), 0, -1, 60, 25, 840, 490)
    $deck.SaveAs((Join-Path $ProjectDirectory 'tests\fixtures\reading-test.pptx'), 24)
    $deck.SaveCopyAs((Join-Path $ProjectDirectory 'tests\fixtures\reading-test.ppt'), 1)
    $deck.Saved = -1
    [Console]::Out.Write('Created two-slide PPTX and legacy PPT fixtures.')
} finally {
    if ($deck) { $deck.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($deck) }
    if ($owned -and $app.Presentations.Count -eq 0) { $app.Quit() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
