/**
 * Generación de PDF del Certificado de Disponibilidad Presupuestaria (CDP).
 * - Desde el 02/03/2026 (inclusive): se usa el formato IN4/2026 (Tipo A: Subt. 21-30, 32 y 33; Tipo B: Subt. 31).
 * - Antes del 02/03/2026: formato antiguo (párrafo único con decreto, memo, solicitante, ítem y firma fija).
 * Incluye logo, encabezado institucional, tabla de montos, firma del funcionario y pie de página.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/** Fecha límite: a partir de esta fecha (inclusive) se usa el formato nuevo IN4/2026 */
const FECHA_LIMITE_FORMATO_NUEVO = new Date(2026, 2, 2); // 02 de marzo de 2026, 0:00

/** Datos necesarios para generar el PDF del CDP (compatibles con Tipo A, Tipo B y formato antiguo) */
interface CDPData {
  cdpNumero: string;
  fecha: Date;
  memoNumero: string;
  fechaMemo: Date;
  nombreSolicitante: string;
  cargoSolicitante: string;
  destinoDisponibilidad: string;
  montoDisponibilidad: number;
  numeroItemPresupuestario: string;
  nombreItemPresupuestario: string;
  areaGestion: string;
  programa: string;
  subPrograma: string;

  // Formato antiguo (CDP antes del 02/03/2026): decreto alcaldicio
  
  decretoAlcaldicioNumero?: string;
  decretoAlcaldicioFecha?: string;
  // Campos IN4/2026
  tipoCDP?: "22-24-33" | "31";
  entidadNombre?: string;
  entidadID?: string;
  anioPresupuestario?: number;
  // Tipo A (Subtítulo 21 al 30, 32 y 33)
  montoTotalPresupuesto?: number;
  montoComprometidoFecha?: number;
  montoComprometidoActo?: number;
  saldoFinal?: number;
  // Tipo B (Subtítulo 31)
  nombreProyecto?: string;
  codigoBIP?: string;
  montoMaximoAnual?: number;
  compromisosFuturosAnio?: string;
  compromisosFuturosMonto?: number;
  // Funcionario emisor
  funcionarioNombre?: string;
  funcionarioTipo?: "titular" | "subrogante";
  funcionarioFirmaPath?: string;
}

/** Carga una imagen desde una ruta pública (logo o firma) y la devuelve como HTMLImageElement para incrustar en el PDF */
async function cargarImagen(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
}

/** Formatea un número como monto en pesos chilenos (ej: 1234567 → "$ 1.234.567") */
function formatearMonto(valor: number): string {
  return `$ ${valor.toLocaleString("es-CL")}`;
}

/** Formato "monto referencial de $X.- Impuesto incluido" para PDF antiguo */
function formatearMontoReferencialAntiguo(valor: number): string {
  return `monto referencial de $ ${valor.toLocaleString("es-CL")}.- Impuesto incluido`;
}

/** Devuelve el texto de imputación presupuestaria (código de cuenta) para el PDF */
function construirImputacion(data: CDPData): string {
  return data.numeroItemPresupuestario || "—";
}

/** Renderiza una línea con segmentos en normal/negrita. Última línea sin justificar; el resto se justifica repartiendo espacios. */
function renderJustifiedLineAntiguo(
  doc: jsPDF,
  segments: { text: string; bold: boolean }[],
  x: number,
  y: number,
  maxWidth: number,
  isLastLine: boolean,
  fontSize: number
) {
  doc.setFontSize(fontSize);
  if (isLastLine) {
    let currentX = x;
    for (const segment of segments) {
      doc.setFont("helvetica", segment.bold ? "bold" : "normal");
      doc.text(segment.text, currentX, y);
      currentX += doc.getTextWidth(segment.text);
    }
    return;
  }
  let totalTextWidth = 0;
  let numSpaces = 0;
  for (const segment of segments) {
    doc.setFont("helvetica", segment.bold ? "bold" : "normal");
    totalTextWidth += doc.getTextWidth(segment.text);
    numSpaces += (segment.text.match(/ /g) || []).length;
  }
  if (numSpaces === 0) {
    let currentX = x;
    for (const segment of segments) {
      doc.setFont("helvetica", segment.bold ? "bold" : "normal");
      doc.text(segment.text, currentX, y);
      currentX += doc.getTextWidth(segment.text);
    }
    return;
  }
  const extraSpacePerSpace = (maxWidth - totalTextWidth) / numSpaces;
  let currentX = x;
  for (const segment of segments) {
    doc.setFont("helvetica", segment.bold ? "bold" : "normal");
    const words = segment.text.split(" ");
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      doc.text(word, currentX, y);
      currentX += doc.getTextWidth(word);
      if (i < words.length - 1) currentX += doc.getTextWidth(" ") + extraSpacePerSpace;
    }
  }
}

/** Renderiza un párrafo con marcado **texto** en negrita, cortando líneas solo por palabras. Retorna la coordenada Y final. */
function renderTextWithBoldAntiguo(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  fontSize: number
): number {
  const segments: { text: string; bold: boolean }[] = [];
  let currentText = text;
  let match: RegExpMatchArray | null;
  while ((match = currentText.match(/\*\*(.*?)\*\*/)) !== null) {
    const idx = match.index!;
    if (idx > 0) {
      segments.push({ text: currentText.substring(0, idx), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    currentText = currentText.substring(idx + match[0].length);
  }
  if (currentText.length > 0) segments.push({ text: currentText, bold: false });

  const allLines: { segments: { text: string; bold: boolean }[]; isLast: boolean }[] = [];
  let currentLine = "";
  let currentLineSegments: { text: string; bold: boolean }[] = [];

  for (const segment of segments) {
    const words = segment.text.split(" ");
    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? " " : "");
      const testLine = currentLine + word;
      doc.setFont("helvetica", segment.bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      const testWidth = doc.getTextWidth(testLine);
      if (testWidth > maxWidth && currentLine.length > 0) {
        allLines.push({ segments: [...currentLineSegments], isLast: false });
        currentLine = word;
        currentLineSegments = [{ text: word, bold: segment.bold }];
      } else {
        currentLine = testLine;
        if (currentLineSegments.length > 0 && currentLineSegments[currentLineSegments.length - 1].bold === segment.bold) {
          currentLineSegments[currentLineSegments.length - 1].text += word;
        } else {
          currentLineSegments.push({ text: word, bold: segment.bold });
        }
      }
    }
  }
  if (currentLine.length > 0) {
    allLines.push({ segments: currentLineSegments, isLast: true });
  }

  let currentY = y;
  for (let i = 0; i < allLines.length; i++) {
    renderJustifiedLineAntiguo(doc, allLines[i].segments, x, currentY, maxWidth, allLines[i].isLast, fontSize);
    currentY += lineHeight;
  }
  return currentY;
}

/** Dibuja un párrafo con segmentos en normal/bold; opcional centrado y justificado. Evita letras sueltas al final/inicio de línea. Retorna la Y final. */
function drawMixedParagraph(
  doc: jsPDF,
  xStart: number,
  yStart: number,
  maxWidth: number,
  segments: { text: string; bold: boolean }[],
  lineHeight = 5,
  opts?: { center?: boolean; justify?: boolean; pageWidth?: number; fontSize?: number }
): number {
  const fullText = segments.map((s) => s.text).join("");
  let charIdx = 0;
  const boldRanges: [number, number][] = [];
  for (const s of segments) {
    if (s.bold) boldRanges.push([charIdx, charIdx + s.text.length]);
    charIdx += s.text.length;
  }
  const fontSize = opts?.fontSize ?? 10;
  doc.setFontSize(fontSize);
  doc.setFont("helvetica", "normal");
  let lines = doc.splitTextToSize(fullText, maxWidth);
  // Evitar letras sueltas al final de línea: mover " X" (espacio + una letra) al inicio de la siguiente
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/\s+([a-zA-Záéíóú])\s*$/);
    if (m) {
      lines[i] = lines[i].slice(0, -m[0].length);
      lines[i + 1] = m[0] + lines[i + 1];
    }
  }
  // Evitar letra suelta al inicio de línea: mover "X " al final de la anterior
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^([a-zA-Záéíóú])\s+/);
    if (m) {
      lines[i - 1] = lines[i - 1] + m[0];
      lines[i] = lines[i].slice(m[0].length);
    }
  }
  const center = opts?.center && opts?.pageWidth != null;
  const justify = opts?.justify;
  const lineHeightVal = lineHeight;
  let y = yStart;
  charIdx = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineStart = charIdx;
    const lineEnd = charIdx + line.length;
    const isLastLine = li === lines.length - 1;

    // Partes (normal/bold) de esta línea
    const parts: { text: string; bold: boolean }[] = [];
    let pos = lineStart;
    for (const [r0, r1] of boldRanges) {
      if (r1 <= lineStart || r0 >= lineEnd) continue;
      const segStart = Math.max(r0, lineStart);
      const segEnd = Math.min(r1, lineEnd);
      if (pos < segStart) parts.push({ text: fullText.slice(pos, segStart), bold: false });
      parts.push({ text: fullText.slice(segStart, segEnd), bold: true });
      pos = segEnd;
    }
    if (pos < lineEnd) parts.push({ text: fullText.slice(pos, lineEnd), bold: false });

    doc.setFontSize(fontSize);
    const spaceWidth = doc.getTextWidth(" ");

    if (justify && !isLastLine && line.trim().length > 0) {
      // Justificado: dividir en palabras con indicador bold y repartir espacio
      const words: { text: string; bold: boolean }[] = [];
      for (const p of parts) {
        const wlist = p.text.split(/\s+/).filter(Boolean);
        wlist.forEach((w) => words.push({ text: w, bold: p.bold }));
      }
      if (words.length === 0) {
        y += lineHeightVal;
        charIdx = lineEnd;
        continue;
      }
      doc.setFontSize(fontSize);
      let totalWordsWidth = 0;
      for (const w of words) {
        doc.setFont("helvetica", w.bold ? "bold" : "normal");
        totalWordsWidth += doc.getTextWidth(w.text);
      }
      const numGaps = words.length - 1;
      const totalSpacesWidth = numGaps * spaceWidth;
      const extraPerGap = numGaps > 0 ? (maxWidth - totalWordsWidth - totalSpacesWidth) / numGaps : 0;
      let x = xStart;
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        doc.setFont("helvetica", w.bold ? "bold" : "normal");
        doc.text(w.text, x, y);
        x += doc.getTextWidth(w.text);
        if (wi < words.length - 1) x += spaceWidth + Math.max(0, extraPerGap);
      }
    } else {
      // Sin justificar: dibujar partes seguidas (última línea o sin justify)
      doc.setFontSize(fontSize);
      let totalWidth = 0;
      for (const p of parts) {
        doc.setFont("helvetica", p.bold ? "bold" : "normal");
        totalWidth += doc.getTextWidth(p.text);
      }
      // Si hay justify, la última línea se alinea al bloque (xStart); si solo center, se centra en página
      const alinearAlBloque = justify;
      let x = !alinearAlBloque && center ? (opts!.pageWidth! - totalWidth) / 2 : xStart;
      for (const p of parts) {
        doc.setFont("helvetica", p.bold ? "bold" : "normal");
        doc.text(p.text, x, y);
        x += doc.getTextWidth(p.text);
      }
    }
    y += lineHeightVal;
    charIdx = lineEnd;
  }
  return y;
}

/** Genera el PDF en formato antiguo (CDP con fecha anterior al 02/03/2026): párrafo único, decreto alcaldicio, memo, solicitante, ítem y firma fija. */
async function generarPDFCDPAntiguo(data: CDPData): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margenIzq = 20;
  const margenDer = 20;
  const anchoUtil = pageWidth - margenIzq - margenDer;

  const decretoNumero = data.decretoAlcaldicioNumero ?? "N°6.447/2025";
  const decretoFecha = data.decretoAlcaldicioFecha ?? "13 de Noviembre de 2025";
  const anio = data.fecha.getFullYear();
  const fechaMemoTexto = format(data.fechaMemo, "d 'de' MMMM 'de' yyyy", { locale: es });
  const memoDisplay =
    data.memoNumero.trim().toUpperCase().startsWith("N°") || data.memoNumero.trim().startsWith("Nº")
      ? data.memoNumero.trim()
      : `N°${data.memoNumero.trim()}`;
  const montoFormateado = data.montoDisponibilidad.toLocaleString("es-CL");
  const montoFraseBold = `monto referencial de $ ${montoFormateado}.- Impuesto incluido`;

  // Logo derecha
  try {
    const logoImg = await cargarImagen("/logo.png");
    doc.addImage(logoImg, "PNG", pageWidth - margenDer - 50, 8, 50, 15);
  } catch {
    // ignorar
  }

  // Encabezado izquierda
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text("República de Chile", margenIzq, 15);
  doc.text("Provincia de Curicó", margenIzq, 19);
  doc.text("Ilustre Municipalidad de Molina", margenIzq, 23);
  doc.setFont("helvetica", "bold");
  doc.text("Dirección de Administración y Finanzas", margenIzq, 27);

  // Título más abajo (centrado, negrita, subrayado)
  const tituloY = 48;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const numeroCdp = data.cdpNumero.replace(/^\s+|\s+$/g, "");
  const titulo = `CERTIFICADO DE DISPONIBILIDAD PRESUPUESTARIA N° ${numeroCdp}`;
  doc.text(titulo, pageWidth / 2, tituloY, { align: "center" });
  const tituloW = doc.getTextWidth(titulo);
  doc.setDrawColor(0, 0, 0);
  doc.line(pageWidth / 2 - tituloW / 2, tituloY + 2, pageWidth / 2 + tituloW / 2, tituloY + 2);

  // Párrafos con **negrita** y corte por palabras (sin partir "incluido" ni "por")
  const parrafoFontSize = 12;
  const lineHeightParrafo = 6;
  let y = tituloY + 22;
  doc.setFontSize(parrafoFontSize);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);

  const parrafo1 =
    `De conformidad al presupuesto aprobado para este Municipio para el año ${anio}, mediante decreto alcaldicio ${decretoNumero} de fecha ${decretoFecha} certifico que, a la fecha del presente documento, esta institución cuenta con el presupuesto disponible, para el financiamiento de los bienes y servicios a contratar de acuerdo con el memo **${memoDisplay}** de **fecha ${fechaMemoTexto}**, de ${data.cargoSolicitante}, ${data.nombreSolicitante}, solicitando disponibilidad Presupuestaria para el Financiamiento de ${data.destinoDisponibilidad}, por un **${montoFraseBold}**.`;

  y = renderTextWithBoldAntiguo(doc, parrafo1, margenIzq, y, anchoUtil, lineHeightParrafo, parrafoFontSize);
  y += 10;

  const parrafo2 =
    `Ítem Presupuestario **N° ${data.numeroItemPresupuestario}**, ${data.nombreItemPresupuestario}, Área de Gestión: ${data.areaGestion}, Programa: ${data.programa}, Sub-Programa: ${data.subPrograma} por un **${montoFraseBold}**,`;

  y = renderTextWithBoldAntiguo(doc, parrafo2, margenIzq, y, anchoUtil, lineHeightParrafo, parrafoFontSize);
  y += 20;

  // Firma más abajo para que no se monte sobre el párrafo
  const firmaPath = "/firma.png";
  let firmaImg: HTMLImageElement | null = null;
  const maxFirmaW = 80;
  const maxFirmaH = 45;
  let firmaW = maxFirmaW;
  let firmaH = maxFirmaH;
  try {
    firmaImg = await cargarImagen(firmaPath);
    const imgRatio = firmaImg.naturalWidth / firmaImg.naturalHeight;
    firmaW = maxFirmaW;
    firmaH = firmaW / imgRatio;
    if (firmaH > maxFirmaH) {
      firmaH = maxFirmaH;
      firmaW = firmaH * imgRatio;
    }
  } catch {
    // ignorar
  }
  // "En Molina a ..." fijo a 1 cm sobre el logo; firma con buena distancia al párrafo (48 pt)
  const logoFooterTop = pageHeight - 23 - 18;
  const unCmPt = 28.35;
  const yEnMolina = logoFooterTop - unCmPt;
  const yFirma = yEnMolina - 20;
  const separacionFirma = 48;
  const yFirmaFinal = Math.min(Math.max(y + separacionFirma, yFirma), yEnMolina - 20);

  if (firmaImg) {
    doc.addImage(
      firmaImg,
      "PNG",
      pageWidth / 2 - firmaW / 2,
      yFirmaFinal - firmaH + 10,
      firmaW,
      firmaH
    );
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("ALEJANDRO ROJAS PINTO", pageWidth / 2, yFirmaFinal, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("DIRECTOR DE ADMINISTRACIÓN Y FINANZAS", pageWidth / 2, yFirmaFinal + 5, { align: "center" });
  doc.text("ILUSTRE MUNICIPALIDAD DE MOLINA", pageWidth / 2, yFirmaFinal + 10, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(
    `En Molina a ${format(data.fecha, "d 'de' MMMM 'de' yyyy", { locale: es })}`,
    margenIzq,
    yEnMolina
  );

  // Pie de página (logo a 1 cm bajo "En Molina a ...")
  try {
    const footerLogo = await cargarImagen("/logoMolina.png");
    doc.addImage(footerLogo, "PNG", margenIzq, pageHeight - 23, 18, 18);
  } catch {
    // ignorar
  }
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Ilustre Municipalidad de Molina", margenIzq + 22, pageHeight - 19);
  doc.text("Dirección de Administración y Finanzas", margenIzq + 22, pageHeight - 15);
  doc.text("Yerbas Buenas N° 1389", margenIzq + 22, pageHeight - 11);
  doc.text("www.molina.cl", pageWidth - margenDer, pageHeight - 13, { align: "right" });

  return doc;
}

/** Genera el PDF del CDP según la fecha: formato antiguo o IN4/2026 (Tipo A o B). Incluye encabezado, datos, tabla y firma. */
export const generarPDFCDP = async (data: CDPData) => {
  const fechaSolo = new Date(
    data.fecha.getFullYear(),
    data.fecha.getMonth(),
    data.fecha.getDate()
  );
  if (fechaSolo < FECHA_LIMITE_FORMATO_NUEVO) {
    return await generarPDFCDPAntiguo(data);
  }

  const tipo = data.tipoCDP || "22-24-33";
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margenIzq = 20;
  const margenDer = 20;
  const anchoUtil = pageWidth - margenIzq - margenDer;

  // ===== LOGO =====
  try {
    const logoImg = await cargarImagen("/logo.png");
    doc.addImage(logoImg, "PNG", pageWidth - margenDer - 50, 8, 50, 15);
  } catch (error) {
    console.error("Error al cargar el logo:", error);
  }

  // ===== ENCABEZADO INSTITUCIONAL =====
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text("República de Chile", margenIzq, 15);
  doc.text("Provincia de Curicó", margenIzq, 19);
  doc.text("Ilustre Municipalidad de Molina", margenIzq, 23);
  doc.setFont("helvetica", "bold");
  doc.text("Dirección de Administración y Finanzas", margenIzq, 27);

  // ===== TÍTULO (sin subrayado, según Anexo Único) =====
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("CERTIFICADO DE DISPONIBILIDAD PRESUPUESTARIA", pageWidth / 2, 42, { align: "center" });

  // N° (izquierda, según Anexo Único — "N°" en negrita, número en normal)
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("N°", margenIzq, 50);
  const nroW = doc.getTextWidth("N°");
  doc.setFont("helvetica", "normal");
  doc.text(` ${data.cdpNumero}`, margenIzq + nroW, 50);

  // ===== DATOS DE LA ENTIDAD =====
  let y = 60;
  doc.setFontSize(10);

  doc.setFont("helvetica", "bold");
  const lbl1 = "NOMBRE DE LA ENTIDAD (Servicio): ";
  doc.text(lbl1, margenIzq, y);
  const lbl1W = doc.getTextWidth(lbl1);
  doc.setFont("helvetica", "normal");
  doc.text(data.entidadNombre || "—", margenIzq + lbl1W, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  const lbl2 = "IDENTIFICADOR CODIFICADOR DEL ESTADO (ID): ";
  doc.text(lbl2, margenIzq, y);
  const lbl2W = doc.getTextWidth(lbl2);
  doc.setFont("helvetica", "normal");
  doc.text(data.entidadID || "—", margenIzq + lbl2W, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  const lbl3 = "FECHA DE EMISIÓN: ";
  doc.text(lbl3, margenIzq, y);
  const lbl3W = doc.getTextWidth(lbl3);
  doc.setFont("helvetica", "normal");
  doc.text(
    format(data.fecha, "dd 'de' MMMM 'de' yyyy", { locale: es }),
    margenIzq + lbl3W,
    y
  );
  y += 10;

  // ===== TEXTO DE CERTIFICACIÓN =====
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const textoCert =
    tipo === "22-24-33"
      ? "Quien suscribe certifica que se cuenta con recursos para financiar el (proyecto, iniciativa, programa, servicios o bienes) que indica, según el siguiente detalle:"
      : "Quien suscribe certifica que se cuenta con recursos para financiar el (estudio, programa o proyecto) que indica, según el siguiente detalle:";
  const lineasCert = doc.splitTextToSize(textoCert, anchoUtil);
  doc.text(lineasCert, margenIzq, y);
  y += lineasCert.length * 5 + 6;

  // ===== TABLA DE DETALLE =====
  const imputacion = construirImputacion(data);
  const anio = String(data.anioPresupuestario || data.fecha.getFullYear());
  let cuerpoTabla: string[][];

  if (tipo === "22-24-33") {
    // Tipo A: Subtítulo 21 al 30, 32 y 33
    cuerpoTabla = [
      ["Imputación presupuestaria (resumen)", imputacion],
      ["Año ejercicio presupuestario", anio],
      [
        "Monto total contemplado en el presupuesto",
        formatearMonto(data.montoTotalPresupuesto ?? 0),
      ],
      [
        "Monto comprometido a la fecha",
        formatearMonto(data.montoComprometidoFecha ?? 0),
      ],
      [
        "Monto comprometido por el acto administrativo",
        formatearMonto(data.montoComprometidoActo ?? data.montoDisponibilidad ?? 0),
      ],
      ["Saldo final", formatearMonto(data.saldoFinal ?? 0)],
    ];
  } else {
    // Tipo B: Subtítulo 31 — Nombre, Código BIP/INI, imputación, año, monto máximo, compromisos futuros, comprometido a la fecha, por el acto, saldo final
    cuerpoTabla = [
      ["Nombre", data.nombreProyecto || "—"],
      ["Código (BIP o INI, según corresponda)", data.codigoBIP || "—"],
      ["Imputación presupuestaria (resumen)", imputacion],
      ["Año ejercicio presupuestario", anio],
      [
        "Monto máximo para el presente año",
        formatearMonto(data.montoMaximoAnual ?? 0),
      ],
      [
        `Monto máximo de los compromisos futuros${
          data.compromisosFuturosAnio ? `, año/s ${data.compromisosFuturosAnio}` : ", año/s"
        }`,
        formatearMonto(data.compromisosFuturosMonto ?? 0),
      ],
      [
        "Monto comprometido a la fecha",
        formatearMonto(data.montoComprometidoFecha ?? 0),
      ],
      [
        "Monto comprometido por el acto administrativo",
        formatearMonto(data.montoComprometidoActo ?? data.montoDisponibilidad ?? 0),
      ],
      ["Saldo final", formatearMonto(data.saldoFinal ?? 0)],
    ];
  }

  autoTable(doc, {
    startY: y,
    body: cuerpoTabla,
    theme: "grid",
    styles: {
      fontSize: tipo === "31" ? 9 : 10,
      cellPadding: tipo === "31" ? 2 : 3,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: "normal", cellWidth: tipo === "31" ? 105 : 110 },
      1: { fontStyle: "normal" },
    },
    margin: { left: margenIzq, right: margenDer },
    didParseCell: (hookData: any) => {
      hookData.cell.styles.fillColor = [255, 255, 255];
    },
  });

  y = (doc as any).lastAutoTable.finalY + (tipo === "31" ? 5 : 8);

  // ===== INFORMACIÓN ADICIONAL (recuadro compacto para no chocar con firma) =====
  const yInfoStart = y;

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text("Información adicional (opcional):", margenIzq + 4, y + 4);
  y += 10;

  doc.setFont("helvetica", "normal");

  const fechaMemoTexto = format(data.fechaMemo, "dd 'de' MMMM 'de' yyyy", {
    locale: es,
  });
  const lineasInfo = [
    `Memo N° ${data.memoNumero}, fecha ${fechaMemoTexto}`,
    `Solicitante: ${data.nombreSolicitante}, ${data.cargoSolicitante}`,
    `Destino: ${data.destinoDisponibilidad}`,
    `Área: ${data.areaGestion} | Programa: ${data.programa} | Sub: ${data.subPrograma}`,
  ];

  for (const linea of lineasInfo) {
    const wrapped = doc.splitTextToSize(linea, anchoUtil - 8);
    doc.text(wrapped, margenIzq + 4, y);
    y += wrapped.length * 3.5 + 1;
  }
  y += 2;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(margenIzq, yInfoStart, anchoUtil, y - yInfoStart);

  /* Firma del funcionario emisor: carga imagen, ajusta tamaño y la dibuja centrada */
  const firmaPath = data.funcionarioFirmaPath || "/firma.png";
  let firmaImg: HTMLImageElement | null = null;
  const maxFirmaW = 80;
  const maxFirmaH = 45;
  let firmaW = maxFirmaW;
  let firmaH = maxFirmaH;

  try {
    firmaImg = await cargarImagen(firmaPath);
    const imgRatio = firmaImg.naturalWidth / firmaImg.naturalHeight;
    firmaW = maxFirmaW;
    firmaH = firmaW / imgRatio;
    if (firmaH > maxFirmaH) {
      firmaH = maxFirmaH;
      firmaW = firmaH * imgRatio;
    }
  } catch (error) {
    console.error("Error al cargar la firma:", error);
  }

  const yFirmaMinimo = y + firmaH + 5;
  const yFirmaMaximo = pageHeight - 48;
  const yFirma = Math.min(Math.max(yFirmaMinimo, pageHeight - 75), yFirmaMaximo);

  if (firmaImg) {
    doc.addImage(
      firmaImg,
      "PNG",
      pageWidth / 2 - firmaW / 2,
      yFirma - firmaH + 10,
      firmaW,
      firmaH
    );
  }

  const nombreFuncionario = (data.funcionarioNombre || "Alejandro Rojas Pinto").toUpperCase();
  const cargoFuncionario =
    data.funcionarioTipo === "subrogante"
      ? "DIRECTOR(S) DE ADMINISTRACIÓN Y FINANZAS"
      : "DIRECTOR DE ADMINISTRACIÓN Y FINANZAS";

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(nombreFuncionario, pageWidth / 2, yFirma, {
    align: "center",
  });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(cargoFuncionario, pageWidth / 2, yFirma + 5, { align: "center" });
  doc.text("ILUSTRE MUNICIPALIDAD DE MOLINA", pageWidth / 2, yFirma + 10, {
    align: "center",
  });

  // Fecha al final
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(
    `En Molina a ${format(data.fecha, "dd 'de' MMMM 'de' yyyy", { locale: es })}`,
    margenIzq,
    yFirma + 20
  );

  // ===== PIE DE PÁGINA =====
  // Logo posicionado correctamente dentro del margen inferior (18mm alto, base a 5mm del borde)
  try {
    const footerLogo = await cargarImagen("/logoMolina.png");
    doc.addImage(footerLogo, "PNG", margenIzq, pageHeight - 23, 18, 18);
  } catch (error) {
    console.error("Error al cargar logo del footer:", error);
  }

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Ilustre Municipalidad de Molina", margenIzq + 22, pageHeight - 19);
  doc.text("Dirección de Administración y Finanzas", margenIzq + 22, pageHeight - 15);
  doc.text("Yerbas Buenas N° 1389", margenIzq + 22, pageHeight - 11);
  doc.text("www.molina.cl", pageWidth - margenDer, pageHeight - 13, {
    align: "right",
  });

  return doc;
};

/** Genera el PDF del CDP y lo descarga en el navegador con nombre tipo CDP_00001_2026.pdf */
export const descargarPDFCDP = async (data: CDPData) => {
  const doc = await generarPDFCDP(data);
  doc.save(`CDP_${data.cdpNumero.replace(/\//g, "_")}.pdf`);
};

/** Genera el PDF del CDP y lo abre en una nueva pestaña del navegador (sin descargar archivo) */
export const abrirPDFCDP = async (data: CDPData) => {
  const doc = await generarPDFCDP(data);
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
};
