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
  /* hora siempre como HH:mm (24 h), venga como venga */
  const h24 = v => {
    if (v == null || v === '') return '';
    if (v instanceof Date) return String(v.getUTCHours()).padStart(2, '0') + ':' + String(v.getUTCMinutes()).padStart(2, '0');
    if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
    const t = String(v); let m = /(?:^|T)(\d{1,2}):(\d{2})/.exec(t);
    return m ? String(+m[1]).padStart(2, '0') + ':' + m[2] : t;
  };
  const dmsTxt = (v, pos, neg) => { const a = Math.abs(+v); let g = Math.floor(a); const mf = (a - g) * 60; let m = Math.floor(mf); let sec = Math.round((mf - m) * 600) / 10; if (sec >= 60) { sec = 0; m++; } if (m >= 60) { m = 0; g++; } return g + '°' + String(m).padStart(2, '0') + "'" + (sec < 10 ? '0' : '') + sec.toFixed(1) + '"' + (+v < 0 ? neg : pos); };
  const gmsLat = v => (v === '' || v == null || !isFinite(+v)) ? '' : dmsTxt(+v, 'N', 'S');
  const gmsLon = v => (v === '' || v == null || !isFinite(+v)) ? '' : dmsTxt(+v, 'E', 'W');
  const na = v => (v == null || String(v).trim() === '') ? 'N/A' : String(v);
  const durOf = r => r.dur_txt || durTxt(r.durmin);
  /* Listas del formato de cargue masivo de incendios forestales (SNIF) */
  const SNIF_TIPO = { C: 'Copa', O: 'Otros', SUP: 'Superficial', M: 'Mixto', SUB: 'Subterráneo', NS: 'No seleccionado' };
  const SNIF_CAUSA = { Q: 'Quemas fuera de control', D: 'Descuido y negligencia', A: 'Accidental', R: 'Reactivación de focos', O: 'Otros', I: 'Intencional', SID: 'Sin definir' };
  const SNIF_AREA = { BND: 'Bosque Natural Denso', BP: 'Bosque plantado', BS: 'Bosque Seco', C: 'Cultivos', P: 'Páramos', BI: 'Bosque intervenido', R: 'Rastrojos', VS: 'Vegetación Seca', SBN_PST: 'Sabanas pastizales', PST_MNJ: 'Pastos manejados', CBR_SIN_DTR: 'Coberturas sin determinar', SP: 'Sabanas y pastizales', PM: 'Pastos mejorados' };
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
    if (r.hora) s = setCell(s, 'N9', h24(r.hora));
    s = setCell(s, 'F19', r.cat);
    if (r.hora) s = setCell(s, 'F20', h24(r.hora));
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
    if (lat) s = setCell(s, 'I24', gmsLat(lat) || lat);
    if (lon) s = setCell(s, 'M24', gmsLon(lon) || lon);
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
    s = put(s, 'N20', h24(r.hlle));
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
    (rp.acc || []).slice(0, 57).forEach((x, i) => { const n = 3 + i; s = put(s, 'V' + n, h24(x.h)); s = put(s, 'X' + n, x.a); });
    // 10. unidad que comandó
    const cm = rp.cmd || {}; s = put(s, 'AD4', cm.n); s = put(s, 'AG4', cm.g); s = put(s, 'AH4', cm.c);
    // 11. unidades que intervinieron (12 nombres, dos columnas)
    (r.pers || []).slice(0, 12).forEach((nom, i) => { const row = 7 + (i >> 1), [g, n2] = splitGrado(nom); if (i % 2 === 0) { s = put(s, 'AD' + row, n2); s = put(s, 'AG' + row, g); } else { s = put(s, 'AH' + row, n2); s = put(s, 'AK' + row, g); } });
    // 12. observaciones
    const obs = [];
    if (rp.obs) obs.push(rp.obs);
    if (d.over) obs.push('Descripción: ' + r.desc);
    obs.push(`Duración: ${durOf(r)}. Unidades que asistieron: ${na(r.uni)}. Vehículos: ${na(r.veh)}.`);
    if (r.hsal) obs.push('Salida de estación: ' + h24(r.hsal) + ' h.');
    if (r.hfin) obs.push('Fin del servicio: ' + h24(r.hfin) + ' h.');
    if (r.area) obs.push('Área afectada: ' + r.area + (r.veg ? ' (' + r.veg + ')' : '') + '.');
    if (r.inc && (r.inc.tipo || r.inc.causa || r.inc.areaTipo)) { const i = r.inc; obs.push('Incendio forestal: tipo ' + (SNIF_TIPO[i.tipo] || na(i.tipo)) + ', causa ' + (SNIF_CAUSA[i.causa] || na(i.causa)) + ', cobertura ' + (SNIF_AREA[i.areaTipo] || na(i.areaTipo)) + '. Área protegida de orden nacional: ' + na(i.prot) + (i.protNom ? ' (' + i.protNom + ')' : '') + '.'); }
    if (r.extraTxt) obs.push(r.extraTxt);
    if (fuera.length) obs.push('Otros vehículos: ' + fuera.join(', '));
    if (!(rp.les || []).length && r.lesionados) obs.push('Lesionados: ' + r.lesionados + (r.trasladado ? ' (trasladado a ' + r.trasladado + ')' : ''));
    if (r.canal) obs.push('Aviso recibido por: ' + r.canal + (r.rep ? ' (' + r.rep + ')' : '') + '.');
    if (!r.rpt) obs.push('Datos completados desde el registro ' + (r.id || '') + '. Faltan los demás campos del formato.');
    const chunk = []; obs.join(' ').match(/.{1,70}(\s|$)/g).forEach(x => chunk.push(x.trim()));
    ['AD15', 'AD16', 'AD17', 'AD18', 'AD19', 'AD20'].forEach((ref, i) => { if (chunk[i]) s = setCell(s, ref, chunk[i]); });
    // 7. organización del incidente (SCI) dentro de los recuadros del formato
    let dr = await zip.file('xl/drawings/drawing1.xml').async('string');
    dr = organigrama(dr, rp.sci || {}, rp.cmd || {}, r);
    // 14. registro fotográfico
    const fotos = (r.fotos || []).filter(f => f && f.data);
    if (fotos.length) s = await fotosReporte(zip, s, dr, fotos, r);
    else zip.file('xl/drawings/drawing1.xml', dr);
    zip.file('xl/worksheets/sheet1.xml', s);
    await forceCalc(zip);
    return out(zip);
  }

  /* texto dentro de un recuadro (forma) del dibujo, por nombre */
  function textoForma(dr, nombre, lineas) {
    const i = dr.indexOf('name="' + nombre + '"'); if (i < 0) return dr;
    const a = dr.indexOf('<xdr:txBody>', i), b = dr.indexOf('</xdr:txBody>', a); if (a < 0 || b < 0) return dr;
    const ps = lineas.filter(l => l && l.t).map(l => `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="es-CO" sz="${l.sz || 700}"${l.b ? ' b="1"' : ''}/><a:t>${X(l.t)}</a:t></a:r></a:p>`).join('') || '<a:p><a:endParaRPr lang="es-CO" sz="700"/></a:p>';
    const body = '<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" lIns="18000" tIns="18000" rIns="18000" bIns="18000" rtlCol="0" anchor="ctr"/><a:lstStyle/>' + ps;
    return dr.slice(0, a) + body + dr.slice(b);
  }
  function organigrama(dr, sci, cmd, r) {
    const noAct = /no se activ/i;
    const nom = k => { const v = sci[k]; return v && !noAct.test(v) ? v : ''; };
    const rol = (t, k) => [{ t, b: 1, sz: 650 }, { t: nom(k) || (k === 'ci' ? (sci.ci || cmd.n || '') : 'No activado'), sz: 750 }];
    dr = textoForma(dr, '3 Rectángulo', rol('COMANDANTE DEL INCIDENTE', 'ci'));
    dr = textoForma(dr, '8 Rectángulo', rol('Oficial de seguridad', 'seg'));
    dr = textoForma(dr, '9 Rectángulo', rol('Oficial de información pública', 'inf'));
    dr = textoForma(dr, '10 Rectángulo', rol('Oficial de enlace', 'enl'));
    const grupos = (sci.grupos || []).filter(g => g && g.u);
    const ops = rol('JEFE DE OPERACIONES', 'ops');
    grupos.slice(0, 6).forEach(g => ops.push({ t: g.u + ': ' + (g.f || '') + (g.n ? ' (' + g.n + ')' : ''), sz: 600 }));
    dr = textoForma(dr, '60 Rectángulo', ops);
    dr = textoForma(dr, '61 Rectángulo', rol('JEFE DE PLANIFICACIÓN', 'pla'));
    dr = textoForma(dr, '62 Rectángulo', rol('JEFE DE LOGÍSTICA', 'log'));
    dr = textoForma(dr, '63 Rectángulo', rol('JEFE DE ADMON. Y FINANZAS', 'adm'));
    return dr;
  }

  /* geometría de la hoja (ancho de columnas y alto de filas) para ubicar fotos */
  function geom(s) {
    const cw = {}; let m; const re = /<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g;
    while ((m = re.exec(s))) for (let c = +m[1]; c <= Math.min(+m[2], 80); c++) cw[c] = Math.round(+m[3] * 7 * 9525);
    return cw;
  }
  const ROW_EMU = Math.round(14.95 * 12700);
  const picAnchor = (id, rid, col, colOff, row, rowOff, W, H, name) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from><xdr:ext cx="${W}" cy="${H}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${X(name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  const fit = (f, maxW, maxH) => { const sc = Math.min(maxW / f.w, maxH / f.h); return [Math.round(f.w * sc), Math.round(f.h * sc)]; };

  async function fotosReporte(zip, s, dr, fotos, r) {
    const cw = geom(s);
    const x0 = 30, wTot = [30, 31, 32, 33, 34, 35, 36, 37].reduce((a, c) => a + (cw[c] || 0), 0);   // columnas AD..AK
    const slotW = Math.floor(wTot / 2) - 60000, maxH = 14 * ROW_EMU - 40000;
    const colAt = px => { let c = x0, acc = 0; while (c < 37 && acc + cw[c] <= px) { acc += cw[c]; c++; } return [c - 1, px - acc]; };   // índice base 0
    let rels = await zip.file('xl/drawings/_rels/drawing1.xml.rels').async('string');
    let ct = await zip.file('[Content_Types].xml').async('string');
    if (!/Extension="jpeg"/.test(ct)) ct = ct.replace('<Default Extension="png"', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png"');
    let anchors = '', id = 900;
    const quedan = [];
    fotos.forEach((f, i) => {
      const n = i + 1;
      if (i >= 4) { quedan.push(f); return; }
      const col = i % 2, fila = i >> 1, [W, H] = fit(f, slotW, maxH);
      const px = col * (Math.floor(wTot / 2)) + Math.floor((slotW - W) / 2) + 30000;
      const [c, off] = colAt(px);
      const row0 = 26 + fila * 16;                 // base 0: fila 27 y fila 43
      const name = 'media/repfoto' + n + '.jpeg', rid = 'rIdRf' + n;
      zip.file('xl/' + name, f.data);
      rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../${name}"/></Relationships>`);
      anchors += picAnchor(id++, rid, c, off, row0, 20000, W, H, 'Foto ' + n);
      const capRow = row0 + 2 + Math.ceil((H + 20000) / ROW_EMU), capCell = (col ? 'AH' : 'AD') + capRow;
      if (capRow <= 59) { try { s = put(s, capCell, n + '. ' + String(f.desc || '').slice(0, 60)); } catch (e) { /* sin leyenda */ } }
    });
    dr = dr.replace('</xdr:wsDr>', anchors + '</xdr:wsDr>');
    zip.file('xl/drawings/drawing1.xml', dr);
    zip.file('xl/drawings/_rels/drawing1.xml.rels', rels);
    if (quedan.length) ct = await hojaFotos(zip, ct, quedan, 5, r);
    zip.file('[Content_Types].xml', ct);
    return s;
  }

  /* hoja adicional con el resto de las fotografías (2 por fila, 3 filas por página) */
  async function hojaFotos(zip, ct, fotos, desde, r) {
    let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    const colW = 48, cwE = Math.round(colW * 7 * 9525), rowPhoto = 200, rowCap = 18;   // puntos
    let anchors = '', rows = `<row r="1" ht="22" customHeight="1"><c r="A1" t="inlineStr"><is><t>${X('REGISTRO FOTOGRÁFICO DEL INCIDENTE · ' + (r.id || ''))}</t></is></c></row>`;
    const maxW = cwE - 120000, maxH = Math.round(rowPhoto * 12700) - 60000;
    const brks = [];
    fotos.forEach((f, i) => {
      const k = i >> 1, col = i % 2, rp = 2 + k * 2, n = desde + i;
      if (col === 0) { rows += `<row r="${rp}" ht="${rowPhoto}" customHeight="1"/><row r="${rp + 1}" ht="${rowCap}" customHeight="1">__CAP${rp + 1}__</row>`; if (k > 0 && k % 3 === 0) brks.push(rp - 1); }
      const [W, H] = fit(f, maxW, maxH);
      const name = 'media/repfoto' + n + '.jpeg', rid = 'rIdRf' + n;
      zip.file('xl/' + name, f.data);
      rels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../${name}"/>`;
      anchors += picAnchor(950 + i, rid, col, Math.floor((cwE - W) / 2), rp - 1, 30000, W, H, 'Foto ' + n);
      const cap = `<c r="${col ? 'B' : 'A'}${rp + 1}" t="inlineStr"><is><t xml:space="preserve">${X(n + '. ' + String(f.desc || '').slice(0, 70))}</t></is></c>`;
      rows = rows.replace('__CAP' + (rp + 1) + '__', cap + (col ? '' : '__CAP' + (rp + 1) + '__'));
    });
    rows = rows.replace(/__CAP\d+__/g, '');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><cols><col min="1" max="2" width="${colW}" customWidth="1"/></cols><sheetData>${rows}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToHeight="0"/>${brks.length ? '<rowBreaks count="' + brks.length + '" manualBreakCount="' + brks.length + '">' + brks.map(b => `<brk id="${b}" max="16383" man="1"/>`).join('') + '</rowBreaks>' : ''}<drawing r:id="rId1"/></worksheet>`;
    zip.file('xl/worksheets/sheet3.xml', sheet);
    zip.file('xl/worksheets/_rels/sheet3.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/></Relationships>');
    zip.file('xl/drawings/drawing2.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + anchors + '</xdr:wsDr>');
    zip.file('xl/drawings/_rels/drawing2.xml.rels', rels + '</Relationships>');
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace('</sheets>', '<sheet name="FOTOS ADICIONALES" sheetId="9" r:id="rId9"/></sheets>');
    zip.file('xl/workbook.xml', wb);
    let wr = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    wr = wr.replace('</Relationships>', '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>');
    zip.file('xl/_rels/workbook.xml.rels', wr);
    return ct.replace('</Types>', '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }


  /* ---------- Reporte de Emergencias listo para imprimir (misma estructura del formato) ---------- */
  function reporteHTML(r, o) {
    o = o || {};
    const E = x => X(x == null ? '' : x), v = x => (x == null || x === '' ? '' : E(x));
    const rp = r.rpt || {}, sci = rp.sci || {}, prop = rp.prop || {}, esc = rp.esc || {}, ins = rp.inst || {}, cmd = rp.cmd || {};
    const noAct = /no se activ/i, nm = k => (sci[k] && !noAct.test(sci[k]) ? sci[k] : 'No activado');
    const seq = String((r.id || '').split('-').pop() || '').padStart(6, '0').slice(-6);
    const f = r.fecha || '';
    const row = (a, b) => `<tr><th>${a}</th><td colspan="3">${b}</td></tr>`;
    const chk = (c, t) => `<span class="ck">${c ? '☒' : '☐'} ${E(t)}</span>`;
    const insV = k => { const a = ins[k] || []; return (a[0] || a[0] === 0 ? a[0] : '') + ' unid. / ' + (a[1] || a[1] === 0 ? a[1] : '') + ' veh.'; };
    const vehs = String(r.veh || '').split(/[,/;]+/).map(x => x.trim()).filter(Boolean);
    const pers = (r.pers || []).slice(0, 24);
    const lat = gmsLat(r.lat), lon = gmsLon(r.lon);
    const acc = (rp.acc || []).slice().sort((a, b) => h24(a.h).localeCompare(h24(b.h)));
    const fotos = o.fotos || r.fotos || [];
    const css = `@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:10.5px/1.3 Arial,Helvetica,sans-serif;color:#000;margin:0}h1,h2{margin:0}.hd{display:grid;grid-template-columns:80px 1fr 80px;align-items:center;border:1.5px solid #000;padding:4px}.hd img{max-height:64px;max-width:76px}.hd .t{text-align:center;font-weight:700;font-size:13px}table{border-collapse:collapse;width:100%;margin-top:4px;page-break-inside:avoid}th,td{border:1px solid #000;padding:3px 5px;vertical-align:top;text-align:left}th{background:#eee;width:23%;font-weight:700}.sec{background:#222;color:#fff;font-weight:700;text-align:center;padding:3px;margin-top:6px;border:1px solid #000;page-break-after:avoid}.ck{margin-right:12px;white-space:nowrap}.org{display:grid;gap:6px;justify-items:center;border:1px solid #000;padding:6px;margin-top:4px;page-break-inside:avoid}.bx{border:1.5px solid #000;padding:4px 8px;text-align:center;min-width:130px}.bx b{display:block;font-size:9px}.row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}.ph{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}.ph figure{margin:0;border:1px solid #000;padding:4px;text-align:center;page-break-inside:avoid}.ph img{max-width:100%;max-height:230px}.ph figcaption{font-size:9.5px}.sign{height:46px}`;
    const gr = (sci.grupos || []).map(g => `<div class="bx"><b>Unidad ${E(g.u)}</b>${E(g.f || '')}${g.n ? '<br>' + E(g.n) : ''}</div>`).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de Emergencias ${E(r.id)}</title><style>${css}</style></head><body>
<div class="hd">${o.logo1 ? `<img src="${o.logo1}" alt="">` : '<span></span>'}<div class="t">CUERPO DE BOMBEROS VOLUNTARIOS<br>LA UNION - VALLE DEL CAUCA<br><br>REPORTE DE EMERGENCIAS</div>${o.logo2 ? `<img src="${o.logo2}" alt="">` : '<span></span>'}</div>
<table><tr><th>INCIDENTE N°</th><td style="font-size:15px;font-weight:700;letter-spacing:.35em">${E(seq)}</td><th>Fecha y hora de elaboración</th><td>${E(f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(2, 4) : '')} · ${E(h24(r.hora))} h</td></tr></table>
<div class="sec">1. DATOS DE LA PROPIEDAD</div>
<table><tr><th>Tipo de propiedad</th><td colspan="3">${['Vivienda', 'Finca', 'Comercial', 'Agrícola', 'Vía pública', 'Lote baldío', 'Industrial', 'Otro'].map(t => chk(prop.tipo === t, t)).join('')}</td></tr>${row('Nombre del propietario', v(prop.nom))}<tr><th>Documento de identidad</th><td>${v(prop.doc)}</td><th>N° de contacto</th><td>${v(prop.tel)}</td></tr></table>
<div class="sec">2. DATOS DEL INCIDENTE</div>
<table><tr><th>Tipo de incidente</th><td colspan="3"><b>${E(r.cat)}</b></td></tr><tr><th>Hora de reporte</th><td>${E(h24(r.hora))} h</td><th>Hora de llegada al sitio</th><td>${E(h24(r.hlle))}${r.hlle ? ' h' : ''}</td></tr>
<tr><th>Máquinas</th><td colspan="3">${['T-1', 'B-2', 'B-3', 'B-4', 'L-1', 'L-2', 'L-3'].map(m => chk(vehs.some(x => x.toUpperCase().replace(/\s+/g, '').replace(/^([A-Z])(\d)$/, '$1-$2') === m), m)).join('')} ${E(vehs.filter(x => !/^[TBL][- ]?\d$/i.test(x)).join(', '))}</td></tr>
<tr><th>Dirección</th><td colspan="3">${v(r.dir)}</td></tr><tr><th>Barrio / vereda</th><td colspan="3">${v(r.bar) || 'N/A'}</td></tr>
<tr><th>Zona</th><td>${chk(rp.zona === 'URBANA', 'URBANA')}${chk(rp.zona === 'RURAL', 'RURAL')}</td><th>Departamento / municipio</th><td>VALLE DEL CAUCA · LA UNIÓN</td></tr>
<tr><th>Coordenadas</th><td colspan="3">Latitud: <b>${E(lat)}</b> &nbsp; Longitud: <b>${E(lon)}</b></td></tr>
${row('Ubicación del puesto de comando', v(rp.pc))}${row('Identificación del puesto de comando', v(rp.pcid))}${row('Ubicación del área de espera', v(rp.ae))}${row('Ubicación del A.C.V.', v(rp.acv))}</table>
<div class="sec">3. EVALUACIÓN INICIAL DEL INCIDENTE</div>
<table>${row('Descripción del incidente', v(r.desc))}${row('Amenazas del incidente', v(rp.amen))}${row('Objetivos iniciales', v(rp.obj))}
<tr><th>Hubo alteración en la escena antes de la llegada de bomberos</th><td>${chk(esc.alt === 'SI', 'SI')}${chk(esc.alt === 'NO', 'NO')}</td><th>Cómo se alteró</th><td>${v(esc.altc)}</td></tr>
<tr><th>Se realizó protección del área luego del arribo</th><td>${chk(esc.prot === 'SI', 'SI')}${chk(esc.prot === 'NO', 'NO')}</td><th>Cómo se realizó</th><td>${v(esc.protc)}</td></tr>
<tr><th>Hubo personas que intervinieron antes de la llegada de bomberos</th><td>${chk(esc.int === 'SI', 'SI')}${chk(esc.int === 'NO', 'NO')}</td><th>Quiénes intervinieron</th><td>${v(esc.intc)}</td></tr></table>
<div class="sec">4. INSTITUCIONES QUE INTERVIENEN Y APOYAN EN EL INCIDENTE</div>
<table><tr><th>Defensa Civil</th><td>${insV('dc')}</td><th>Policía Carreteras</th><td>${insV('pcar')}</td></tr><tr><th>Cruz Roja</th><td>${insV('cr')}</td><th>Hospitales</th><td>${insV('hosp')}</td></tr><tr><th>Policía Nacional</th><td>${insV('pn')}</td><th></th><td></td></tr></table>
<div class="sec">5. INFORMACIÓN DE LESIONADOS EN EL INCIDENTE</div>
<table><tr><th>Nombre</th><th>Doc. identidad</th><th>Edad</th><th>Trasladado a / por</th></tr>${(rp.les || []).map(x => `<tr><td>${v(x.n)}</td><td>${v(x.d)}</td><td>${v(x.e)}</td><td>${v(x.t)}${x.p ? ' · ' + v(x.p) : ''}</td></tr>`).join('') || '<tr><td colspan="4">N/A</td></tr>'}</table>
<div class="sec">6. INFORMACIÓN DE VEHÍCULOS IMPLICADOS</div>
<table><tr><th>Conductor</th><th>Doc. identidad</th><th>Vehículo</th><th>Color / placa</th></tr>${(rp.vimp || []).map(x => `<tr><td>${v(x.c)}</td><td>${v(x.d)}</td><td>${v(x.v)}</td><td>${v(x.col)} ${v(x.pl)}</td></tr>`).join('') || '<tr><td colspan="4">N/A</td></tr>'}</table>
<div class="sec">7. ORGANIZACIÓN DEL INCIDENTE (SCI)</div>
<div class="org"><div class="bx"><b>COMANDANTE DEL INCIDENTE</b>${E(sci.ci || cmd.n || '')}</div>
<div class="row"><div class="bx"><b>Oficial de seguridad</b>${E(nm('seg'))}</div><div class="bx"><b>Oficial de información pública</b>${E(nm('inf'))}</div><div class="bx"><b>Oficial de enlace</b>${E(nm('enl'))}</div></div>
<div class="row"><div class="bx"><b>JEFE DE OPERACIONES</b>${E(nm('ops'))}</div><div class="bx"><b>JEFE DE PLANIFICACIÓN</b>${E(nm('pla'))}</div><div class="bx"><b>JEFE DE LOGÍSTICA</b>${E(nm('log'))}</div><div class="bx"><b>JEFE DE ADMON. Y FINANZAS</b>${E(nm('adm'))}</div></div>
${gr ? `<div><b>Función de cada unidad</b></div><div class="row">${gr}</div>` : ''}</div>
<div class="sec">8. BOSQUEJO O CROQUIS DEL LUGAR DEL INCIDENTE</div><table><tr><td style="height:110px"></td></tr></table>
<div class="sec">9. RESUMEN DE LAS ACCIONES</div>
<table><tr><th style="width:12%">HORA (24 h)</th><th>ACCIÓN REALIZADA</th></tr>${acc.map(x => `<tr><td>${E(h24(x.h))}</td><td>${v(x.a)}</td></tr>`).join('') || '<tr><td colspan="2">N/A</td></tr>'}</table>
<div class="sec">10. UNIDAD QUE COMANDÓ EL INCIDENTE</div>
<table><tr><th>Nombres y apellidos</th><th>Grado</th><th>Cargo</th><th>Firma</th></tr><tr><td>${v(cmd.n)}</td><td>${v(cmd.g)}</td><td>${v(cmd.c)}</td><td class="sign"></td></tr></table>
<div class="sec">11. UNIDADES QUE INTERVINIERON EN EL INCIDENTE</div>
<table><tr><td>${pers.map(p => E(p)).join('</td><td>').replace(/(<td>[^]*?){0}/, '')}</td></tr></table>
<div class="sec">12. OBSERVACIONES ADICIONALES (LEGALES, DISCIPLINARIAS, NORMATIVAS O DE REQUERIMIENTOS Y NECESIDADES)</div>
<table><tr><td>${v(rp.obs)}<br>Duración: ${E(durOf(r))}. Unidades que asistieron: ${E(na(r.uni))}. Vehículos: ${E(na(r.veh))}.${r.hsal ? ' Salida de estación: ' + E(h24(r.hsal)) + ' h.' : ''}${r.hfin ? ' Fin del servicio: ' + E(h24(r.hfin)) + ' h.' : ''}${r.area ? ' Área afectada: ' + E(r.area) + '.' : ''} ${E(r.extraTxt || '')}</td></tr></table>
<div class="sec">13. RECEPCIÓN Y APROBACIÓN DEL INFORME</div>
<table><tr><th>Guardia que recibe el informe</th><th>Grado</th><th>Estado en que recibe</th><th>Firma</th></tr><tr><td class="sign"></td><td></td><td>${chk(false, 'COMPLETO')}${chk(false, 'INCOMPLETO')}</td><td></td></tr></table>
${fotos.length ? `<div class="sec" style="page-break-before:always">14. REGISTRO FOTOGRÁFICO DEL INCIDENTE</div><div class="ph">${fotos.map((p, i) => `<figure><img src="${p.src}" alt="Fotografía ${i + 1}"><figcaption>${i + 1}. ${E(p.desc || '')}</figcaption></figure>`).join('')}</div>` : '<div class="sec">14. REGISTRO FOTOGRÁFICO DEL INCIDENTE</div><table><tr><td>Sin fotografías.</td></tr></table>'}
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body></html>`;
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


  /* ---------- 5. FORMATO CARGUE MASIVO INCENDIOS FORESTALES (SNIF) ---------- */
  function dms(v) {
    const a = Math.abs(+v); let g = Math.floor(a); const mf = (a - g) * 60; let m = Math.floor(mf); let sec = Math.round((mf - m) * 60 * 100) / 100;
    if (sec >= 60) { sec = 0; m += 1; } if (m >= 60) { m = 0; g += 1; }
    return { g, m, s: sec };
  }
  const horaNum = h => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? (+m[1] * 60 + +m[2]) / 1440 : null; };
  /* items: [{id?, vereda, prot, protNom, fini, hini, ffin, hfin, tipo, causa, areaTipo, area, obs, lat, lon, latg.. (opcional, ya en grados/minutos/segundos)}] */
  async function incendiosSNIF(JSZip, tpl, { items, depto, municipio, lonNegativa }) {
    const zip = await load(JSZip, tpl);
    let s = await zip.file('xl/worksheets/sheet1.xml').async('string');
    // estilos por columna tomados de la fila 10 de la plantilla
    const r10 = s.match(/<row r="10"[^>]*>([\s\S]*?)<\/row>/);
    const st = {};
    if (r10) { const re = /<c r="([A-Z]+)10"(?: s="(\d+)")?/g; let m; while ((m = re.exec(r10[1]))) st[m[1]] = m[2] != null ? m[2] : null; }
    const S = c => (st[c] != null ? st[c] : null);
    const rows = [];
    let maxId = 0; items.forEach(it => { if (it.id && +it.id > maxId) maxId = +it.id; });
    items.forEach((it, i) => {
      const n = 10 + i, id = it.id ? +it.id : ++maxId, c = [];
      const txt = (col, v) => { if (v != null && String(v).trim() !== '') c.push(istr(col + n, S(col), v)); else c.push(`<c r="${col}${n}"${S(col) != null ? ` s="${S(col)}"` : ''}/>`); };
      const num = (col, v) => { if (v != null && v !== '' && !isNaN(+v)) c.push(numc(col + n, S(col), +v)); else c.push(`<c r="${col}${n}"${S(col) != null ? ` s="${S(col)}"` : ''}/>`); };
      c.push(numc('A' + n, S('A'), id));
      txt('B', it.depto || depto || 'VALLE DEL CAUCA'); txt('C', it.mun || municipio || 'LA UNIÓN'); txt('D', it.vereda);
      txt('E', it.prot === 'SI' || it.prot === 'S' ? 'SI' : 'NO'); txt('F', it.prot === 'SI' || it.prot === 'S' ? it.protNom : '');
      const dt = (col, iso) => { if (/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) c.push(numc(col + n, S(col), serial(iso))); else txt(col, ''); };
      const hr = (col, h) => { const f = horaNum(h); if (f != null) c.push(numc(col + n, S(col), f)); else txt(col, '—'); };
      dt('G', it.fini); hr('H', it.hini); dt('I', it.ffin || it.fini); hr('J', it.hfin);
      const tipo = SNIF_TIPO[it.tipo] ? it.tipo : 'SUP', causa = SNIF_CAUSA[it.causa] ? it.causa : 'SID', at = SNIF_AREA[it.areaTipo] ? it.areaTipo : 'CBR_SIN_DTR';
      txt('K', tipo); txt('L', SNIF_TIPO[tipo]); txt('M', causa); txt('N', SNIF_CAUSA[causa]); txt('O', at);
      num('P', it.area); txt('Q', it.obs);
      let la = null, lo = null;
      if (it.latg != null && it.latg !== '') { la = { g: it.latg, m: it.latm, s: it.lats }; lo = { g: it.long, m: it.lonm, s: it.lons }; }
      else if (it.lat != null && it.lat !== '' && it.lon != null && it.lon !== '' && !isNaN(+it.lat) && !isNaN(+it.lon)) { la = dms(it.lat); lo = dms(it.lon); if (lonNegativa && +it.lon < 0) lo.g = -lo.g; }
      if (la) { num('R', la.g); num('S', la.m); num('T', la.s); num('U', lo.g); num('V', lo.m); num('W', lo.s); } else { ['R', 'S', 'T', 'U', 'V', 'W'].forEach(col => txt(col, '')); }
      rows.push(`<row r="${n}" spans="1:23">${c.join('')}</row>`);
    });
    s = s.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r) => (+r >= 10 ? '' : m));
    s = s.replace('</sheetData>', rows.join('') + '</sheetData>');
    const last = Math.max(10, 9 + items.length);
    s = s.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:W${last}"/>`);
    s = s.replace(/<sheetView tabSelected="1" topLeftCell="[^"]*"/, '<sheetView tabSelected="1"').replace(/<selection [^>]*\/>/, '<selection activeCell="A10" sqref="A10"/>');
    zip.file('xl/worksheets/sheet1.xml', s);
    return out(zip);
  }

  g.GEN = { reporteHTML, h24, gmsLat, gmsLon, dmsTxt, CATS, MESES, durTxt, dmy, comandancia, actividades, reporteEmergencia, fotografico, estadistica, incendiosSNIF, SNIF_TIPO, SNIF_CAUSA, SNIF_AREA, dms };
})(typeof window !== 'undefined' ? window : globalThis);
