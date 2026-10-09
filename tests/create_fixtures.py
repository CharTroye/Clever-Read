"""Create small, deterministic documents for the browser import checks."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

base = Path(__file__).parent / 'fixtures'
base.mkdir(exist_ok=True)
paragraphs = [
    ('Heading1', 'Word 导入测试'),
    ('', '自注意力是一种让同一序列中的元素互相参考的机制。这里的解释应结合当前文档语境。'),
    ('', 'We assume independent and identically distributed samples. This assumption does not prove that real data satisfy it.'),
    ('', '<img src=x onerror=alert(1)> 这段必须显示为文本，不能执行。'),
]
body = ''.join(f'<w:p>{"<w:pPr><w:pStyle w:val=" + chr(34) + style + chr(34) + "/></w:pPr>" if style else ""}<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>' for style, text in paragraphs)
xml = f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table cell: contextual evidence.</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
with ZipFile(base / 'reading-test.docx', 'w', ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml', xml)

def write_pdf(filename, pages):
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', None, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    kids = []
    for lines in pages:
        page_id = len(objects) + 1
        stream_id = page_id + 1
        kids.append(f'{page_id} 0 R')
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>'.encode())
        stream = b'BT /F1 16 Tf 50 720 Td 24 TL\n'
        for i, line in enumerate(lines):
            if i: stream += b'T*\n'
            safe = line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
            stream += f'({safe}) Tj\n'.encode('ascii')
        stream += b'ET'
        objects.append(f'<< /Length {len(stream)} >>\nstream\n'.encode() + stream + b'\nendstream')
    objects[1] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode()
    data = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(data)
    data += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
    for offset in offsets[1:]: data += f'{offset:010d} 00000 n \n'.encode()
    data += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
    (base / filename).write_bytes(data)

write_pdf('reading-test.pdf', [
    ['PDF Reading Test', 'Self-attention uses queries, keys and values.', 'We assume independent and identically distributed samples.'],
    ['Evidence on page two', 'The assumption is a premise, not an observed conclusion.', 'Attention weights alone do not prove causality.'],
])
write_pdf('scan-only.pdf', [[]])
(base / 'notes.txt').write_text('文本导入测试\n\n过拟合可能让模型在新数据上的表现变差。\n\n这段话的结论依赖数据和验证方法。', encoding='utf-8')
print('Created PDF, DOCX and text fixtures in', base)
