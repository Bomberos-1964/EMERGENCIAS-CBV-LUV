/* Generadores de archivos institucionales a partir de las plantillas originales.
   Requiere JSZip (global en el navegador, o pasado en Node). Todas las funciones devuelven Promise<Uint8Array>. */
(function (g) {
  'use strict';
  const CATS = ['CAÍDA / CORTES DE ARBOL','CONTROL DE ABEJAS','CONTROL DE AVISPAS','CAÍDA DE CUERDAS','CORTO CIRCUITO','COLAPSO DE ESTRUCTURAS','CAPACITACIONES','EXTRICACIÓN VEHICULAR','FUGA DE GAS NATURAL','FUGA DE GAS GLP','INCENDIO FORESTAL','INCENDIO ESTRUCTURAL','INCENDIO VEHICULAR','INUNDACIÓN','LABORES DE PREVENCION O ACOMPAÑAMIENTO EN GESTION DEL RIESGO','MATERIALES PELIGROSOS / DERRAMES','PRIMEROS AUXILIOS','RESCATE DE PERSONA / PARAPENTE','RESCATE DE ANIMAL','REUNIÓN EN LA ALCALDÍA','REUNIONES DE SERVICIO SOCIAL','SUMINISTROS DE AGUA','VISITAS DE SEGURIDAD'];
  const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

  const X = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colNum = c => { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569; };
  const dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  function durTxt(min) {
    if (min == null || isNaN(min)) return 'N/A';
    min = Math.round(min);
    if (min < 60) return min + ' MINUTOS';
    const h = Math.floor(min / 60), m = min % 60;
    return h + (h === 1 ? ' HORA' : ' HORAS') + (m ? ' Y ' + m + ' MINUTOS' : '');
  }
  const na = v => (v == null || String(v).trim() === '') ? 'N/A' : String(v);
  const durOf = r => r.dur_txt || durTxt(r.durmin);
  const coordOf = r => r.coord || ((r.lat != null && r.lat !== '' && r.lon != null && r.lon !== '') ? r.lat + ', ' + r.lon : '');
  const sortRows = rows => rows.slice().sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));

  const istr = (ref, s, txt) => `<c r="${ref}"${s != null ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${X(txt)}</t></is></c>`;
  const numc = (ref, s, v) => `<c r="${ref}"${s != null ? ` s="${s}"` : ''}><v>${v}</v></c>`;

  /* Reemplaza el contenido de una celda existente conservando su estilo. */
  function setCell(xml, ref, value) {
    const re = new RegExp('<c r="' + ref + '"((?: [a-z]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)');
    const m = xml.match(re);
    if (!m) throw new Error('Celda no encontrada ' + ref);
    const sm = m[1].match(/ s="(\d+)"/);
    const s = sm ? sm[1] : null;
    const cell = typeof value === 'number' ? numc(ref, s, value) : istr(ref, s, value);
    return xml.replace(re, () => cell);
  }

  /* Inserta la celda si no existe (conserva el orden de columnas) y escribe el valor; ignora vacíos. */
  function ensureCell(xml, ref) {
    if (new RegExp('<c r="' + ref + '"[ />]').test(xml)) return xml;
    const rn = ref.replace(/[A-Z]+/, ''), cn = colNum(ref.replace(/\d+/, ''));
    const re = new RegExp('<row r="' + rn + '"([^>]*?)(/>|>([\\s\\S]*?)</row>)');
    const m = xml.match(re); if (!m) return xml;
    const attrs = m[1].replace(/\/$/, ''), inner = m[3] || '';
    let pos = inner.length; const cre = /<c r="([A-Z]+)\d+"/g; let k;
    while ((k = cre.exec(inner))) { if (colNum(k[1]) > cn) { pos = k.index; break; } }
    const ni = inner.slice(0, pos) + '<c r="' + ref + '"/>' + inner.slice(pos);
    return xml.replace(re, () => '<row r="' + rn + '"' + attrs + '>' + ni + '</row>');
  }
  const put = (xml, ref, v) => (v == null || String(v).trim() === '') ? xml : setCell(ensureCell(xml, ref), ref, typeof v === 'number' ? v : String(v));
  const GRADOS = /^(sgt|sbt|sbtte|cbo|bro|tt|cpt|cap|may|cr|tc|st|sgto|cabo|bombero|teniente|sargento|capit[aá]n|subteniente)\.?$/i;
  const splitGrado = n => { const p = String(n || '').trim().split(/\s+/); if (p.length > 1 && GRADOS.test(p[0])) return [p[0].replace(/\.$/, '').toUpperCase(), p.slice(1).join(' ')]; return ['', String(n || '').trim()]; };

  async function load(JSZip, tpl) { return JSZip.loadAsync(tpl); }
  async function out(zip) { return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }); }
  async function forceCalc(zip) {
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace(/<calcPr([^>]*?)\/>/, (m, a) => a.includes('fullCalcOnLoad') ? m : `<calcPr${a} fullCalcOnLoad="1"/>`);
    zip.file('xl/workbook.xml', wb);
  }

  /* ---------- 1. REPORTE DE COMANDANCIA (CONSOLIDADO + DATOS) ---------- */
  async function comandancia(JSZip, tpl, { rows, titulo }) {
    rows = sortRows(rows);
    const zip = await load(JSZip, tpl);
    const cnt = {}; CATS.forEach(c => cnt[c] = 0);
    rows.forEach(r => { if (cnt[r.cat] != null) cnt[r.cat]++; });
    const total = CATS.reduce((a, c) => a + cnt[c], 0);

    // CONSOLIDADO
    let s1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
    s1 = setCell(s1, 'A2', titulo);
    const fre = '(?:<f[^>]*/>|<f[^>]*>[^<]*</f>)';
    CATS.forEach((c, i) => {
      const r = i + 4;
      s1 = s1.replace(new RegExp(`<c r="B${r}" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="B${r}" s="${s}"><f>COUNTIF(DATOS!$B:$B,$A${r})</f><v>${cnt[c]}</v></c>`);
      s1 = s1.replace(new RegExp(`<c r="C${r}" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="C${r}" s="${s}"><f>IF($B$27=0,0,B${r}/$B$27)</f><v>${total ? cnt[c] / total : 0}</v></c>`);
    });
    s1 = s1.replace(new RegExp(`<c r="B27" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="B27" s="${s}"><f>SUM(B4:B26)</f><v>${total}</v></c>`);
    s1 = s1.replace(new RegExp(`<c r="C27" s="(\\d+)">${fre}<v>[^<]*</v></c>`), (m, s) => `<c r="C27" s="${s}"><f>IF($B$27=0,0,B27/$B$27)</f><v>${total ? 1 : 0}</v></c>`);
    zip.file('xl/worksheets/sheet1.xml', s1);

    // actualizar la caché del gráfico (Excel la refresca al abrir)
    const chartPath = 'xl/charts/chart1.xml';
    if (zip.file(chartPath)) {
      let ch = await zip.file(chartPath).async('string');
      let k = 0;
      ch = ch.replace(/<c:numCache>[\s\S]*?<\/c:numCache>/g, m => {
        if (!/<c:pt idx="0">/.test(m)) return m;
        const pts = CATS.map((c, i) => `<c:pt idx="${i}"><c:v>${cnt[c]}</c:v></c:pt>`).join('');
        return m.replace(/<c:ptCount val="\d+"\/>[\s\S]*<\/c:numCache>/, `<c:ptCount val="${CATS.length}"/>${pts}</c:numCache>`);
      });
      zip.file(chartPath, ch);
    }

    // DATOS
    let s2 = await zip.file('xl/worksheets/sheet2.xml').async('string');
    const head = s2.slice(0, s2.indexOf('<row r="4"'));
    const tail = s2.slice(s2.indexOf('</sheetData>'));
    const multiYear = rows.length && rows[0].fecha.slice(0, 4) !== rows[rows.length - 1].fecha.slice(0, 4);
    const label = iso => MESES[+iso.slice(5, 7) - 1] + (multiYear ? ' ' + iso.slice(0, 4) : '');
    let body = '', n = 4, lastKey = rows.length ? rows[0].fecha.slice(0, 7) : null;
    let headFixed = head;
    if (rows.length) headFixed = setCell(head, 'A3', label(rows[0].fecha));
    const labelRow = (rn, txt) => `<row r="${rn}" spans="1:41" customFormat="1" ht="15.8" customHeight="1">` + istr('A' + rn, 51, txt) +
      ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(c => `<c r="${c}${rn}" s="${c === 'C' ? 53 : c === 'D' ? 54 : c === 'L' ? 55 : 52}"/>`).join('') + '</row>';
    rows.forEach(r => {
      const key = r.fecha.slice(0, 7);
      if (key !== lastKey) { body += labelRow(n, label(r.fecha)); n++; lastKey = key; }
      body += `<row r="${n}" spans="1:12" customFormat="1" ht="15.8" customHeight="1">` +
        istr('A' + n, 26, r.tipo || 'OTROS') + istr('B' + n, 26, r.cat) + `<c r="C${n}" s="40"/>` + numc('D' + n, 29, serial(r.fecha)) +
        istr('E' + n, 26, durOf(r)) + istr('F' + n, 26, na(r.dir)) + istr('G' + n, 26, na(r.bar)) + istr('H' + n, 26, na(r.desc)) + istr('I' + n, 26, na(r.area)) +
        (r.uni != null && r.uni !== '' ? numc('J' + n, 26, +r.uni) : istr('J' + n, 26, 'N/A')) + istr('K' + n, 26, na(r.veh)) + istr('L' + n, 26, na(coordOf(r))) + '</row>';
      n++;
    });
    const last = n - 1;
    body += `<row r="${n}" spans="1:12" ht="41.45" thickBot="1">` + istr('A' + n, 21, 'TOTAL \nEMERGENCIAS Y ACTIVIDADES') +
      `<c r="B${n}" s="22"><f>COUNTA(B3:B${last})</f><v>${rows.length}</v></c><c r="C${n}" s="22"/>` +
      ['D', 'E', 'F'].map(c => `<c r="${c}${n}" s="23"/>`).join('') + `<c r="G${n}" s="24"/>` + ['H', 'I', 'J', 'K'].map(c => `<c r="${c}${n}" s="23"/>`).join('') + `<c r="L${n}" s="25"/></row>`;
    let t2 = tail.replace('B3:B358', `B3:B${last}`).replace('B359:B1048576', `B${n}:B1048576`).replace('C3:C358', `C3:C${last}`);
    let h2 = headFixed.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:AO${n}"/>`).replace(/<selection pane="bottomLeft"[^>]*\/>/, '<selection pane="bottomLeft" activeCell="B4" sqref="B4"/>');
    zip.file('xl/worksheets/sheet2.xml', h2 + body + t2);
    await forceCalc(zip);
    return out(zip);
  }

  /* ---------- 2. REGISTRO DE ACTIVIDADES ---------- */
  async function actividades(JSZip, tpl, { rows, titulo }) {
    rows = sortRows(rows);
    const zip = await load(JSZip, tpl);
    let st = await zip.file('xl/styles.xml').async('string');
    const m = st.match(/<cellXfs count="(\d+)">/);
    const dateXf = +m[1];
    st = st.replace(m[0], `<cellXfs count="${dateXf + 1}">`).replace('</cellXfs>', '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>');
    zip.file('xl/styles.xml', st);
    let s = await zip.file('xl/worksheets/sheet1.xml').async('string');
    s = setCell(s, 'A1', titulo);
    const head = s.slice(0, s.indexOf('<row r="3"'));
    let tail = s.slice(s.indexOf('</sheetData>')).replace(/<sortState[\s\S]*?<\/sortState>/, '');
    let body = '';
    rows.forEach((r, i) => {
      const n = i + 3;
      body += `<row r="${n}" spans="1:10">` + istr('A' + n, 2, r.tipo || 'OTROS') + istr('B' + n, 2, r.cat) + numc('C' + n, dateXf, serial(r.fecha)) + istr('D' + n, 2, durOf(r)) +
        istr('E' + n, 2, na(r.dir)) + istr('F' + n, 2, na(r.bar)) + istr('G' + n, 2, na(r.desc)) + istr('H' + n, 2, na(r.area)) +
        (r.uni != null && r.uni !== '' ? numc('I' + n, 2, +r.uni) : istr('I' + n, 2, 'N/A')) + istr('J' + n, 2, na(r.veh)) + '</row>';
    });
    const last = Math.max(rows.length + 2, 3);
    const h = head.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:J${last}"/>`);
    zip.file('xl/worksheets/sheet1.xml', h + body + tail);
    return out(zip);
  }

  /* ---------- 3. REPORTE DE EMERGENCIAS (un incidente, datos conocidos) ---------- */
  async function reporteEmergencia(JSZip, tpl, r) {
    const zip = await load(JSZip, tpl);
    let s = await zip.file('xl/worksheets/sheet1.xml').async('string');
    const seq = String((r.id || '').split('-').pop() || '').padStart(6, '0').slice(-6);
    ['B', 'C', 'D', 'E', 'F', 'G'].forEach((c, i) => { s = setCell(s, c + '8', seq[i]); });
    if (r.fecha) { s = setCell(s, 'K9', r.fecha.slice(8, 10)); s = setCell(s, 'L9', r.fecha.slice(5, 7)); s = setCell(s, 'M9', r.fecha.slice(2, 4)); }
    if (r.hora) s = setCell(s, 'N9', r.hora);
    s = setCell(s, 'F19', r.cat);
    if (r.hora) s = setCell(s, 'F20', r.hora);
    const maq = { 'T-1': 'B21', 'B-2': 'C21', 'B-3': 'D21', 'B-4': 'E21', 'L-1': 'F21', 'L-2': 'G21', 'L-3': 'H21' };
    const lab = { B21: 'T1', C21: 'B2', D21: 'B3', E21: 'B4', F21: 'L1', G21: 'L2', H21: 'L3' };
    const vs = String(r.veh || '').split(/[,/;]+/).map(x => x.trim().toUpperCase().replace(/\s+/g, '').replace(/^([A-Z])(\d)$/, '$1-$2')).filter(Boolean);
    const fuera = [];
    vs.forEach(v => { if (maq[v]) s = setCell(s, maq[v], lab[maq[v]] + '✓'); else fuera.push(v); });
    s = setCell(s, 'J21', na(r.dir));
    s = setCell(s, 'B22', na(r.bar));
    s = setCell(s, 'J23', 'VALLE DEL CAUCA');
    s = setCell(s, 'N23', 'LA UNIÓN');
    const lat = r.lat != null && r.lat !== '' ? String(r.lat) : '', lon = r.lon != null && r.lon !== '' ? String(r.lon) : '';
    if (lat) s = setCell(s, 'I24', lat);
    if (lon) s = setCell(s, 'M24', lon);
    if (!lat && r.coord) s = setCell(s, 'I24', r.coord);
    const rp = r.rpt || {};
    const wrap = (txt, n, max) => { const out = ['', '', '', '']; let li = 0, over = false; String(txt || '').split(/\s+/).filter(Boolean).forEach(w => { if (over) return; if ((out[li] + ' ' + w).trim().length > n) { li++; if (li >= max) { over = true; return; } } out[li] = (out[li] + ' ' + w).trim(); }); return { out, over }; };
    const d = wrap(r.desc, 62, 2);
    s = put(s, 'I30', d.out[0]); s = put(s, 'I31', d.out[1] + (d.over ? ' (ver observaciones)' : ''));
    // 1. propiedad
    const prop = rp.prop || {};
    const pm = { 'Vivienda': 'J12', 'Finca': 'J13', 'Comercial': 'J14', 'Agrícola': 'J15', 'Vía pública': 'N12', 'Lote baldío': 'N13', 'Industrial': 'N14', 'Otro': 'N15' };
    if (pm[prop.tipo]) s = put(s, pm[prop.tipo], 'X');
    s = put(s, 'I16', prop.nom); s = put(s, 'I17', prop.doc); s = put(s, 'M17', prop.tel);
    // 2. incidente
    s = put(s, 'N20', r.hlle);
    if (rp.zona === 'URBANA') s = put(s, 'D23', 'X'); if (rp.zona === 'RURAL') s = put(s, 'G23', 'X');
    s = put(s, 'G25', rp.pc); s = put(s, 'G26', rp.pcid); s = put(s, 'G27', rp.ae); s = put(s, 'G28', rp.acv);
    // 3. evaluación inicial
    const am = wrap(rp.amen, 62, 3), ob = wrap(rp.obj, 62, 3);
    ['I32', 'I33', 'I34'].forEach((c, i) => { s = put(s, c, am.out[i]); });
    ['I35', 'I36', 'I37'].forEach((c, i) => { s = put(s, c, ob.out[i]); });
    const esc = rp.esc || {};
    [['alt', 38, 40], ['prot', 41, 43], ['int', 44, 46]].forEach(([k, row, rowT]) => {
      if (esc[k] === 'SI') s = put(s, 'L' + row, 'X'); if (esc[k] === 'NO') s = put(s, 'O' + row, 'X');
      s = put(s, 'H' + rowT, esc[k + 'c']);
    });
    // 4. instituciones
    const ins = rp.inst || {};
    [['dc', 'F49', 'I49'], ['cr', 'F50', 'I50'], ['pn', 'F51', 'I51'], ['pcar', 'L49', 'N49'], ['hosp', 'L50', 'N50']].forEach(([k, cu, cv]) => {
      const v = ins[k] || []; if (v[0] !== '' && v[0] != null) s = put(s, cu, +v[0]); if (v[1] !== '' && v[1] != null) s = put(s, cv, +v[1]);
    });
    // 5. lesionados (hasta 6)
    (rp.les || []).slice(0, 6).forEach((x, i) => { const n = 54 + i; s = put(s, 'A' + n, x.n); s = put(s, 'H' + n, x.d); s = put(s, 'J' + n, x.e === '' || x.e == null ? '' : +x.e); s = put(s, 'K' + n, x.t); s = put(s, 'M' + n, x.p); });
    // 6. vehículos implicados (hasta 4)
    (rp.vimp || []).slice(0, 4).forEach((x, i) => { const n = 3 + i; s = put(s, 'P' + n, x.c); s = put(s, 'Q' + n, x.d); s = put(s, 'R' + n, x.v); s = put(s, 'T' + n, x.col); s = put(s, 'U' + n, x.pl); });
    // 9. resumen de acciones (hasta 57 filas)
    (rp.acc || []).slice(0, 57).forEach((x, i) => { const n = 3 + i; s = put(s, 'V' + n, x.h); s = put(s, 'X' + n, x.a); });
    // 10. unidad que comandó
    const cm = rp.cmd || {}; s = put(s, 'AD4', cm.n); s = put(s, 'AG4', cm.g); s = put(s, 'AH4', cm.c);
    // 11. unidades que intervinieron (12 nombres, dos columnas)
    (r.pers || []).slice(0, 12).forEach((nom, i) => { const row = 7 + (i >> 1), [g, n2] = splitGrado(nom); if (i % 2 === 0) { s = put(s, 'AD' + row, n2); s = put(s, 'AG' + row, g); } else { s = put(s, 'AH' + row, n2); s = put(s, 'AK' + row, g); } });
    // 12. observaciones
    const obs = [];
    if (rp.obs) obs.push(rp.obs);
    if (d.over) obs.push('Descripción: ' + r.desc);
    obs.push(`Duración: ${durOf(r)}. Unidades que asistieron: ${na(r.uni)}. Vehículos: ${na(r.veh)}.`);
    if (r.hsal) obs.push('Salida de estación: ' + r.hsal + '.');
    if (r.hfin) obs.push('Fin del servicio: ' + r.hfin + '.');
    if (r.area) obs.push('Área afectada: ' + r.area + (r.veg ? ' (' + r.veg + ')' : '') + '.');
    if (fuera.length) obs.push('Otros vehículos: ' + fuera.join(', '));
    if (!(rp.les || []).length && r.lesionados) obs.push('Lesionados: ' + r.lesionados + (r.trasladado ? ' (trasladado a ' + r.trasladado + ')' : ''));
    if (r.canal) obs.push('Aviso recibido por: ' + r.canal + (r.rep ? ' (' + r.rep + ')' : '') + '.');
    if (!r.rpt) obs.push('Datos completados desde el registro ' + (r.id || '') + '. Faltan los demás campos del formato.');
    const chunk = []; obs.join(' ').match(/.{1,70}(\s|$)/g).forEach(x => chunk.push(x.trim()));
    ['AD15', 'AD16', 'AD17', 'AD18', 'AD19', 'AD20'].forEach((ref, i) => { if (chunk[i]) s = setCell(s, ref, chunk[i]); });
    zip.file('xl/worksheets/sheet1.xml', s);
    await forceCalc(zip);
    return out(zip);
  }

  /* ---------- 4. REGISTRO FOTOGRÁFICO (plantilla Word) ---------- */
  async function fotografico(JSZip, tpl, { titulo, fotos }) {
    // fotos: [{data: Uint8Array JPEG, w, h, desc}]
    const zip = await load(JSZip, tpl);
    let d = await zip.file('word/document.xml').async('string');
    const b0 = d.indexOf('<w:body>') + 8, b1 = d.lastIndexOf('</w:body>');
    const body = d.slice(b0, b1);
    const tok = /<(\/?)w:(tbl|p|sectPr)\b([^>]*?)(\/?)>/g;
    const items = []; const stack = []; let start = 0, m;
    while ((m = tok.exec(body))) {
      const [, close, name, , selfc] = m;
      if (!close && !selfc) { if (!stack.length) start = m.index; stack.push(name); }
      else if (close) { stack.pop(); if (!stack.length) items.push({ name, s: start, e: m.index + m[0].length }); }
      else if (selfc && !stack.length) items.push({ name, s: m.index, e: m.index + m[0].length });
    }
    const sect = items.find(i => i.name === 'sectPr');
    const tblIdx = items.map((it, i) => it.name === 'tbl' ? i : -1).filter(i => i >= 0);
    const pages = Math.max(1, Math.ceil(fotos.length / 3));
    if (pages > tblIdx.length) throw new Error('Máximo ' + tblIdx.length * 3 + ' fotografías por archivo');
    // grupos: cada tabla con los elementos que le siguen hasta la siguiente tabla
    let parts = [];
    for (let p = 0; p < pages; p++) {
      const a = tblIdx[p], z = (tblIdx[p + 1] != null ? tblIdx[p + 1] : items.indexOf(sect));
      let seg = items.slice(a, z).map(it => body.slice(it.s, it.e)).join('');
      if (p === pages - 1) seg = seg.replace(/<w:br w:type="page"\/>/g, '');
      parts.push(seg);
    }
    let nb = parts.join('') + '<w:p/>' + body.slice(sect.s, sect.e);
    // título (solo la primera página lo trae en la plantilla)
    nb = nb.replace(/(<w:p\b(?:(?!<\/w:p>)[\s\S])*?)<w:t[^>]*>REGISTRO DE ACTIVIDADES[\s\S]*?<\/w:p>/, (mm, pre) => mm);
    nb = nb.replace(/<w:t(?: [^>]*)?>REGISTRO DE ACTIVIDADES DEL MES DE:?<\/w:t>/, `<w:t xml:space="preserve">${X(titulo)}</w:t>`);
    if (nb.indexOf(X(titulo)) < 0) {
      // el texto del título está repartido en varias corridas: reemplazar todo el párrafo
      nb = nb.replace(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?REGISTRO(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, pm => {
        const ppr = (pm.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
        const rpr = (pm.match(/<w:r\b[^>]*>(<w:rPr>[\s\S]*?<\/w:rPr>)/) || ['', ''])[1];
        return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${X(titulo)}</w:t></w:r></w:p>`;
      });
    }
    // cajas de texto (solo la rama moderna mc:Choice)
    const boxes = [[4940300, 2802467], [2362200, 2726055], [2324100, 2726266]];
    let rels = await zip.file('word/_rels/document.xml.rels').async('string');
    let fi = 0, bi = 0, docId = 5000;
    nb = nb.replace(/<mc:Choice Requires="wps">[\s\S]*?<\/mc:Choice>/g, ch => ch.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/, () => {
      const idx = fi++, box = boxes[bi++ % 3], f = fotos[idx];
      if (!f) return '<w:txbxContent><w:p/></w:txbxContent>';
      const name = 'media/foto' + (idx + 1) + '.jpeg', rid = 'rIdFoto' + (idx + 1);
      zip.file('word/' + name, f.data);
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${name}"/></Relationships>`);
      const maxW = box[0] - 182880, maxH = box[1] - 91440 - 520000;
      const sc = Math.min(maxW / f.w, maxH / f.h); const W = Math.round(f.w * sc), H = Math.round(f.h * sc);
      const cap = X(f.desc || '');
      return '<w:txbxContent><w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
        `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${W}" cy="${H}"/><wp:docPr id="${docId++}" name="Foto ${idx + 1}" descr="${cap}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="foto${idx + 1}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
        `<w:p><w:pPr><w:spacing w:before="40" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">${cap}</w:t></w:r></w:p></w:txbxContent>`;
    }));
    zip.file('word/_rels/document.xml.rels', rels);
    zip.file('word/document.xml', d.slice(0, b0) + nb + d.slice(b1));
    return out(zip);
  }

  /* ---------- 5. ESTADÍSTICA (libro nuevo con el estilo de la Comandancia) ---------- */
  const COLS = n => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  async function estadistica(JSZip, { titulo, subtitulo, rows, comparar, meses }) {
    // rows: registros del periodo. comparar: {anios:[...], datos:{cat:{anio:n}}, totales:{anio:n}} (opcional)
    rows = sortRows(rows);
    const zip = new JSZip();
    const sheets = [];
    // estilos: 0 normal,1 encabezado,2 texto borde,3 entero borde,4 % borde,5 titulo,6 fecha borde,7 total texto,8 total entero,9 total %,10 subtitulo,11 texto sin borde,12 variación
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="+0.0%;-0.0%;0.0%"/></numFmts>' +
      '<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF1F2A44"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Arial"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B2E6B"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF4"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF8A93A6"/></left><right style="thin"><color rgb="FF8A93A6"/></right><top style="thin"><color rgb="FF8A93A6"/></top><bottom style="thin"><color rgb="FF8A93A6"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="3" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf></cellXfs></styleSheet>';
    const cell = (c, r, o) => {
      const ref = COLS(c) + r;
      if (o == null) return '';
      if (typeof o !== 'object') o = { v: o };
      const s = o.s != null ? ` s="${o.s}"` : '';
      if (o.f) return `<c r="${ref}"${s}><f>${X(o.f)}</f><v>${o.v == null ? 0 : o.v}</v></c>`;
      if (typeof o.v === 'number') return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
      if (o.v === '' || o.v == null) return `<c r="${ref}"${s}/>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${X(o.v)}</t></is></c>`;
    };
    function sheet(name, grid, widths, opts = {}) {
      let sd = '';
      grid.forEach((row, i) => { if (!row) return; const r = i + 1; const ht = row._ht ? ` ht="${row._ht}" customHeight="1"` : ''; sd += `<row r="${r}"${ht}>` + row.map((o, c) => cell(c, r, o)).join('') + '</row>'; });
      const cols = '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
      const pane = opts.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${opts.freeze}" topLeftCell="A${opts.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
      const merges = opts.merges ? `<mergeCells count="${opts.merges.length}">${opts.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      sheets.push({ name, xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetFormatPr defaultRowHeight="14"/>${cols}<sheetData>${sd}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToHeight="0"/></worksheet>` });
    }
    const cnt = {}; CATS.forEach(c => cnt[c] = 0); rows.forEach(r => { if (cnt[r.cat] != null) cnt[r.cat]++; });
    const total = rows.length;

    // RESUMEN
    const topCats = CATS.map(c => [c, cnt[c]]).sort((a, b) => b[1] - a[1]).filter(x => x[1] > 0).slice(0, 5);
    const resumen = [[{ v: titulo, s: 5 }], [{ v: subtitulo, s: 10 }], [], [{ v: 'Total de emergencias y actividades', s: 7 }, { v: total, s: 8 }]];
    resumen.push([{ v: 'Categorías con registros', s: 7 }, { v: CATS.filter(c => cnt[c] > 0).length, s: 8 }]);
    if (rows.length) resumen.push([{ v: 'Primer registro', s: 7 }, { v: serial(rows[0].fecha), s: 6 }], [{ v: 'Último registro', s: 7 }, { v: serial(rows[rows.length - 1].fecha), s: 6 }]);
    resumen.push([], [{ v: 'Principales categorías', s: 1 }, { v: 'Cantidad', s: 1 }, { v: '% incidencia', s: 1 }]);
    topCats.forEach(([c, q]) => resumen.push([{ v: c, s: 2 }, { v: q, s: 3 }, { v: total ? q / total : 0, s: 4 }]));
    sheet('RESUMEN', resumen, [62, 14, 14]);

    // POR CATEGORÍA
    const pc = [[{ v: titulo, s: 5 }], [{ v: subtitulo, s: 10 }], [], [{ v: 'EMERGENCIAS', s: 1 }, { v: 'CANTIDAD', s: 1 }, { v: '% INCIDENCIA', s: 1 }]];
    CATS.forEach((c, i) => { const r = i + 5; pc.push([{ v: c, s: 2 }, { v: cnt[c], s: 3 }, { f: `IF($B$${CATS.length + 5}=0,0,B${r}/$B$${CATS.length + 5})`, v: total ? cnt[c] / total : 0, s: 4 }]); });
    pc.push([{ v: 'TOTAL', s: 7 }, { f: `SUM(B5:B${CATS.length + 4})`, v: total, s: 8 }, { f: `IF(B${CATS.length + 5}=0,0,B${CATS.length + 5}/B${CATS.length + 5})`, v: total ? 1 : 0, s: 9 }]);
    sheet('POR CATEGORÍA', pc, [62, 14, 14], { freeze: 4 });

    // POR MES
    const mm = {}; rows.forEach(r => { const k = r.fecha.slice(0, 7); mm[k] = (mm[k] || 0) + 1; });
    const keys = Object.keys(mm).sort();
    const pm = [[{ v: titulo, s: 5 }], [{ v: subtitulo, s: 10 }], [], [{ v: 'MES', s: 1 }, { v: 'TOTAL', s: 1 }]];
    keys.forEach(k => pm.push([{ v: MESES[+k.slice(5)-1] + ' ' + k.slice(0, 4), s: 2 }, { v: mm[k], s: 3 }]));
    pm.push([{ v: 'TOTAL', s: 7 }, { f: `SUM(B5:B${keys.length + 4})`, v: total, s: 8 }]);
    sheet('POR MES', pm, [28, 14], { freeze: 4 });

    // COMPARATIVO
    if (comparar && comparar.anios && comparar.anios.length) {
      const an = comparar.anios;
      const hd = [{ v: 'CATEGORÍA', s: 1 }].concat(an.map(a => ({ v: String(a), s: 1 })));
      if (an.length >= 2) hd.push({ v: 'VARIACIÓN ' + an[an.length - 2] + '→' + an[an.length - 1], s: 1 });
      const cp = [[{ v: titulo + ' · comparativo por año', s: 5 }], [{ v: comparar.nota || subtitulo, s: 10 }], [], hd];
      CATS.forEach((c, i) => {
        const r = i + 5; const row = [{ v: c, s: 2 }].concat(an.map(a => ({ v: (comparar.datos[c] || {})[a] || 0, s: 3 })));
        if (an.length >= 2) { const pa = COLS(an.length - 1), pb = COLS(an.length); const a0 = row[an.length - 1].v, b0 = row[an.length].v; row.push({ f: `IF(${pa}${r}=0,0,(${pb}${r}-${pa}${r})/${pa}${r})`, v: a0 ? (b0 - a0) / a0 : 0, s: 12 }); }
        cp.push(row);
      });
      const tr = [{ v: 'TOTAL', s: 7 }].concat(an.map((a, k) => ({ f: `SUM(${COLS(k + 1)}5:${COLS(k + 1)}${CATS.length + 4})`, v: comparar.totales[a] || 0, s: 8 })));
      if (an.length >= 2) { const a0 = comparar.totales[an[an.length - 2]] || 0, b0 = comparar.totales[an[an.length - 1]] || 0; const pa = COLS(an.length - 1), pb = COLS(an.length), r = CATS.length + 5; tr.push({ f: `IF(${pa}${r}=0,0,(${pb}${r}-${pa}${r})/${pa}${r})`, v: a0 ? (b0 - a0) / a0 : 0, s: 12 }); }
      cp.push(tr);
      sheet('COMPARATIVO', cp, [62].concat(an.map(() => 12)).concat([18]), { freeze: 4 });
    }

    // DATOS
    const dt = [[{ v: 'TIPO DE INCIDENTE', s: 1 }, { v: 'INCIDENTES Y ACTIVIDADES', s: 1 }, { v: 'DÍA DEL EVENTO', s: 1 }, { v: 'DURACIÓN DEL EVENTO', s: 1 }, { v: 'DIRECCIÓN O LUGAR DE REFERENCIA', s: 1 }, { v: 'BARRIO CORREGIMIENTO O VEREDA', s: 1 }, { v: 'DESCRIPCIÓN DEL EVENTO', s: 1 }, { v: 'AREA AFECTADA', s: 1 }, { v: 'N° DE UNIDADES QUE ASISTIERON', s: 1 }, { v: 'VEHÍCULO', s: 1 }, { v: 'COORDENADAS', s: 1 }]];
    rows.forEach(r => dt.push([{ v: r.tipo || 'OTROS', s: 2 }, { v: r.cat, s: 2 }, { v: serial(r.fecha), s: 6 }, { v: durOf(r), s: 2 }, { v: na(r.dir), s: 2 }, { v: na(r.bar), s: 2 }, { v: na(r.desc), s: 2 }, { v: na(r.area), s: 2 }, (r.uni != null && r.uni !== '') ? { v: +r.uni, s: 3 } : { v: 'N/A', s: 2 }, { v: na(r.veh), s: 2 }, { v: na(coordOf(r)), s: 2 }]));
    sheet('DATOS', dt, [22, 44, 14, 20, 34, 26, 60, 16, 14, 16, 26], { freeze: 1 });

    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${X(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', styles);
    sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, s.xml));
    return out(zip);
  }

  g.GEN = { CATS, MESES, durTxt, dmy, comandancia, actividades, reporteEmergencia, fotografico, estadistica };
})(typeof window !== 'undefined' ? window : globalThis);
