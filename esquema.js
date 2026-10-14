/* Esquema del formulario de campo: define pasos y campos. El administrador maestro puede cambiar
   rótulos, ocultar campos, exigir/permitir «No aplica», cambiar opciones y agregar campos extra
   desde la página de Estadística; esos cambios se guardan en la central y se aplican sobre este esquema. */
(function (g) {
  'use strict';
  const CATS = [['CAÍDA / CORTES DE ARBOL','OTROS'],['CONTROL DE ABEJAS','OTROS'],['CONTROL DE AVISPAS','OTROS'],['CAÍDA DE CUERDAS','OTROS'],['CORTO CIRCUITO','INCENDIOS'],['COLAPSO DE ESTRUCTURAS','OTROS'],['CAPACITACIONES','OTROS'],['EXTRICACIÓN VEHICULAR','RESCATES'],['FUGA DE GAS NATURAL','OTROS'],['FUGA DE GAS GLP','MATERIALES PELIGROSOS'],['INCENDIO FORESTAL','INCENDIOS'],['INCENDIO ESTRUCTURAL','INCENDIOS'],['INCENDIO VEHICULAR','INCENDIOS'],['INUNDACIÓN','OTROS'],['LABORES DE PREVENCION O ACOMPAÑAMIENTO EN GESTION DEL RIESGO','OTROS'],['MATERIALES PELIGROSOS / DERRAMES','MATERIALES PELIGROSOS'],['PRIMEROS AUXILIOS','OTROS'],['RESCATE DE PERSONA / PARAPENTE','RESCATES'],['RESCATE DE ANIMAL','RESCATES'],['REUNIÓN EN LA ALCALDÍA','OTROS'],['REUNIONES DE SERVICIO SOCIAL','OTROS'],['SUMINISTROS DE AGUA','OTROS'],['VISITAS DE SEGURIDAD','INSPECCIONES DE SEGURIDAD']];
  const TIPOS = ['INCENDIOS','RESCATES','OTROS','MATERIALES PELIGROSOS','INSPECCIONES DE SEGURIDAD'];
  const VEH = ['B-1','B-2','B-3','B-4','T-1','L-1','L-2','L-3'];
  const SNIF = {
    tipo: [['SUP','Superficial'],['C','Copa'],['SUB','Subterráneo'],['M','Mixto'],['O','Otros'],['NS','No seleccionado']],
    causa: [['Q','Quemas fuera de control'],['D','Descuido y negligencia'],['A','Accidental'],['R','Reactivación de focos'],['I','Intencional'],['O','Otros'],['SID','Sin definir']],
    area: [['BND','Bosque Natural Denso'],['BP','Bosque plantado'],['BS','Bosque Seco'],['C','Cultivos'],['P','Páramos'],['BI','Bosque intervenido'],['R','Rastrojos'],['VS','Vegetación Seca'],['SBN_PST','Sabanas pastizales'],['PST_MNJ','Pastos manejados'],['CBR_SIN_DTR','Coberturas sin determinar'],['SP','Sabanas y pastizales'],['PM','Pastos mejorados']]
  };
  const YN = ['SI', 'NO'];
  const CANAL = ['Llamada telefónica','Radio','Personal en la estación','Policía o autoridad','Redes o WhatsApp','De oficio'];
  const PTIPO = ['Vivienda','Finca','Comercial','Agrícola','Vía pública','Lote baldío','Industrial','Otro'];
  const INST = [['dc','Defensa Civil'],['cr','Cruz Roja'],['pn','Policía Nacional'],['pcar','Policía de Carreteras'],['hosp','Hospitales']];
  const LISTAS = {
    les:  { max: 6,  cols: [['n','Nombre'],['d','Documento'],['e','Edad','number'],['t','Trasladado a'],['p','Trasladado por']], no: 'No hubo lesionados' },
    vimp: { max: 4,  cols: [['c','Conductor'],['d','Documento'],['v','Vehículo'],['col','Color'],['pl','Placa']], no: 'No hubo vehículos implicados' },
    acc:  { max: 57, cols: [['h','Hora','time'],['a','Acción realizada']], no: 'Sin acciones que registrar' }
  };
  const F = (p, l, t, x) => Object.assign({ p, l, t }, x || {});
  const STEPS = [
    { id: 'esencial', t: '1 · Lo esencial', f: [
      F('cat', 'Incidente o actividad', 'cat', { naOk: false }),
      F('fecha', 'Día del evento', 'date', { naOk: false }),
      F('lat', 'Ubicación (GPS)', 'gps'),
      F('dir', 'Dirección o lugar de referencia', 'text'),
      F('bar', 'Barrio, corregimiento o vereda', 'text'),
      F('zona', 'Zona', 'chip1', { o: ['URBANA', 'RURAL'] }) ] },
    { id: 'tiempos', t: '2 · Tiempos', f: [
      F('hora', 'Hora de la alerta', 'time', { naOk: false }),
      F('hsal', 'Salida de la estación', 'time'),
      F('hlle', 'Llegada al sitio', 'time'),
      F('hfin', 'Fin del servicio', 'time'),
      F('durmin', 'Duración del evento (minutos)', 'num', { hint: 'Se calcula con la hora de alerta y la de fin; puede cambiarla.' }) ] },
    { id: 'quepaso', t: '3 · Qué pasó', f: [
      F('desc', 'Descripción del evento', 'area', { naOk: false }),
      F('canal', 'Cómo se recibió el aviso', 'sel', { o: CANAL }),
      F('rep', 'Quién reportó', 'text'),
      F('area', 'Área afectada (hectáreas)', 'hec', { when: 'forest' }),
      F('veg', 'Vegetación afectada', 'text', { when: 'forest' }),
      F('inc.tipo', 'Tipo de incendio', 'selv', { o: SNIF.tipo, when: 'forest', naOk: false }),
      F('inc.causa', 'Causa del incendio', 'selv', { o: SNIF.causa, when: 'forest', naOk: false }),
      F('inc.areaTipo', 'Tipo de cobertura afectada', 'selv', { o: SNIF.area, when: 'forest', naOk: false }),
      F('inc.prot', '¿Es área protegida de orden nacional?', 'yn', { when: 'forest', naOk: false }),
      F('inc.protNom', 'Nombre del área protegida', 'text', { when: 'forest', whenp: ['inc.prot', 'SI'], naOk: false }) ] },
    { id: 'quien', t: '4 · Quién atendió', f: [
      F('pers', 'Personal que atendió', 'pers'),
      F('uni', 'N° de unidades que asistieron', 'num'),
      F('veh', 'Vehículo(s)', 'chipsN') ] },
    { id: 'fotos', t: '5 · Fotografías', f: [ F('fotos', 'Fotografías del evento', 'photos') ] },
    { id: 'r_prop', t: '6a · Reporte: propiedad', f: [
      F('rpt.prop.tipo', 'Tipo de propiedad', 'sel', { o: PTIPO }),
      F('rpt.prop.nom', 'Nombre del propietario', 'text'),
      F('rpt.prop.doc', 'Documento del propietario', 'text'),
      F('rpt.prop.tel', 'Teléfono de contacto', 'text') ] },
    { id: 'r_pc', t: '6b · Reporte: puesto de comando', f: [
      F('rpt.pc', 'Ubicación del puesto de comando', 'text'),
      F('rpt.pcid', 'Identificación del puesto', 'text'),
      F('rpt.ae', 'Área de espera', 'text'),
      F('rpt.acv', 'A.C.V.', 'text') ] },
    { id: 'r_eval', t: '6c · Reporte: evaluación inicial', f: [
      F('rpt.amen', 'Amenazas del incidente', 'area'),
      F('rpt.obj', 'Objetivos iniciales', 'area') ] },
    { id: 'r_esc', t: '6d · Reporte: la escena', f: [
      F('rpt.esc.alt', '¿Hubo alteración de la escena antes de llegar?', 'yn'),
      F('rpt.esc.altc', '¿Cómo se alteró?', 'text', { whenp: ['rpt.esc.alt', 'SI'] }),
      F('rpt.esc.prot', '¿Se protegió el área al llegar?', 'yn'),
      F('rpt.esc.protc', '¿Cómo?', 'text', { whenp: ['rpt.esc.prot', 'SI'] }),
      F('rpt.esc.int', '¿Intervino alguien antes de llegar?', 'yn'),
      F('rpt.esc.intc', '¿Quiénes?', 'text', { whenp: ['rpt.esc.int', 'SI'] }) ] },
    { id: 'r_inst', t: '6e · Reporte: instituciones que apoyaron', f: INST.map(([k, n]) => F('rpt.inst.' + k, n, 'pair', { hint: 'Unidades y vehículos que enviaron' })) },
    { id: 'r_les', t: '6f · Reporte: lesionados', f: [ F('rpt.les', 'Lesionados', 'list', { lista: 'les' }) ] },
    { id: 'r_vimp', t: '6g · Reporte: vehículos implicados', f: [ F('rpt.vimp', 'Vehículos implicados', 'list', { lista: 'vimp' }) ] },
    { id: 'r_acc', t: '6h · Reporte: resumen de las acciones', f: [ F('rpt.acc', 'Acciones realizadas', 'list', { lista: 'acc' }) ] },
    { id: 'r_cmd', t: '6i · Reporte: quién comandó', f: [
      F('rpt.cmd.n', 'Nombres y apellidos', 'text', { naOk: false }),
      F('rpt.cmd.g', 'Grado', 'text'),
      F('rpt.cmd.c', 'Cargo', 'text') ] },
    { id: 'r_obs', t: '6j · Reporte: observaciones adicionales', f: [ F('rpt.obs', 'Observaciones adicionales', 'area') ] }
  ];
  g.CBV_ESQ = { CATS, TIPOS, VEH, SNIF, YN, CANAL, PTIPO, INST, LISTAS, STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
