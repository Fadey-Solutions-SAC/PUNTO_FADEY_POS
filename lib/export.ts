function escapePdf(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
}

export function simplePdf(title: string, lines: string[]) {
  const content = ["BT", "/F1 16 Tf", "40 800 Td", `(${escapePdf(title)}) Tj`, "/F1 10 Tf"]
  lines.slice(0, 70).forEach((line, index) => {
    content.push(index === 0 ? "0 -24 Td" : "0 -14 Td", `(${escapePdf(line)}) Tj`)
  })
  content.push("ET")
  const stream = content.join("\n")
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ]
  let body = "%PDF-1.4\n"
  const offsets = [0]
  for (const object of objects) {
    offsets.push(body.length)
    body += `${object}\n`
  }
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, "0")} 00000 n \n`
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return body
}

export function excelXml(headers: string[], rows: string[][]) {
  const cell = (value: string) => `<Cell><Data ss:Type="String">${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</Data></Cell>`
  const row = (values: string[]) => `<Row>${values.map(cell).join("")}</Row>`
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Informe"><Table>
${row(headers)}
${rows.map(row).join("\n")}
</Table></Worksheet></Workbook>`
}
