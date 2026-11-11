// Package export genera los archivos descargables de los reportes (RF-12):
// CSV y XLSX. El XLSX se construye con la librería estándar (archive/zip +
// SpreadsheetML mínimo), sin dependencias externas.
package export

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// Table es una tabla genérica: encabezados + filas. Cada celda puede ser
// string, int, int64, uint, float64, bool, time.Time, *time.Time o nil.
type Table struct {
	Sheet   string
	Headers []string
	Rows    [][]interface{}
}

// cellText convierte una celda a texto (usado por CSV y por celdas de texto).
func cellText(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case uint:
		return strconv.FormatUint(uint64(x), 10)
	case float64:
		return strconv.FormatFloat(x, 'f', 2, 64)
	case bool:
		if x {
			return "Sí"
		}
		return "No"
	case time.Time:
		if x.Hour() == 0 && x.Minute() == 0 && x.Second() == 0 {
			return x.Format("2006-01-02")
		}
		return x.Format("2006-01-02 15:04")
	case *time.Time:
		if x == nil {
			return ""
		}
		return cellText(*x)
	case *int:
		if x == nil {
			return ""
		}
		return strconv.Itoa(*x)
	case *uint:
		if x == nil {
			return ""
		}
		return strconv.FormatUint(uint64(*x), 10)
	default:
		return fmt.Sprint(x)
	}
}

// WriteCSV escribe la tabla como CSV UTF-8 (con BOM para que Excel respete tildes).
func WriteCSV(w io.Writer, t Table) error {
	if _, err := w.Write([]byte("\xEF\xBB\xBF")); err != nil {
		return err
	}
	cw := csv.NewWriter(w)
	if err := cw.Write(t.Headers); err != nil {
		return err
	}
	for _, row := range t.Rows {
		rec := make([]string, len(row))
		for i, v := range row {
			rec[i] = cellText(v)
		}
		if err := cw.Write(rec); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

// columnName convierte un índice 0-based en letra de columna (0→A, 26→AA).
func columnName(i int) string {
	name := ""
	for i >= 0 {
		name = string(rune('A'+i%26)) + name
		i = i/26 - 1
	}
	return name
}

func escape(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

// numeric indica si la celda debe escribirse como número en el XLSX.
func numeric(v interface{}) (string, bool) {
	switch x := v.(type) {
	case int, int64, uint:
		return cellText(x), true
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64), true
	case *int:
		if x != nil {
			return strconv.Itoa(*x), true
		}
	}
	return "", false
}

// sheetName limpia el nombre de la hoja según las reglas de Excel.
func sheetName(s string) string {
	s = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`[]:*?/\`, r) {
			return '-'
		}
		return r
	}, s)
	if s == "" {
		s = "Reporte"
	}
	if len([]rune(s)) > 31 {
		s = string([]rune(s)[:31])
	}
	return s
}

// WriteXLSX escribe la tabla como libro de Excel de una hoja, con encabezado
// en negrita y celdas numéricas como números (sumables en Excel).
func WriteXLSX(w io.Writer, t Table) error {
	var sheet strings.Builder
	sheet.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	sheet.WriteString(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	sheet.WriteString(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`)
	sheet.WriteString(`<sheetData>`)

	writeRow := func(r int, cells []interface{}, header bool) {
		fmt.Fprintf(&sheet, `<row r="%d">`, r)
		for i, v := range cells {
			ref := fmt.Sprintf("%s%d", columnName(i), r)
			if !header {
				if num, ok := numeric(v); ok {
					fmt.Fprintf(&sheet, `<c r="%s"><v>%s</v></c>`, ref, num)
					continue
				}
			}
			style := ""
			if header {
				style = ` s="1"`
			}
			fmt.Fprintf(&sheet, `<c r="%s" t="inlineStr"%s><is><t xml:space="preserve">%s</t></is></c>`,
				ref, style, escape(cellText(v)))
		}
		sheet.WriteString(`</row>`)
	}

	headers := make([]interface{}, len(t.Headers))
	for i, h := range t.Headers {
		headers[i] = h
	}
	writeRow(1, headers, true)
	for i, row := range t.Rows {
		writeRow(i+2, row, false)
	}
	sheet.WriteString(`</sheetData></worksheet>`)

	files := []struct{ name, body string }{
		{"[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`},
		{"_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`},
		{"xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="` + escape(sheetName(t.Sheet)) + `" sheetId="1" r:id="rId1"/></sheets>
</workbook>`},
		{"xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`},
		{"xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`},
		{"xl/worksheets/sheet1.xml", sheet.String()},
	}

	zw := zip.NewWriter(w)
	for _, f := range files {
		fw, err := zw.Create(f.name)
		if err != nil {
			return err
		}
		if _, err := io.WriteString(fw, f.body); err != nil {
			return err
		}
	}
	return zw.Close()
}
