/**
 * Utilidades compartidas para la aplicación.
 * Contiene funciones para manejo de clases CSS, conversión de datos y formateo de códigos.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** 
 * Combina clases CSS de forma segura utilizando clsx y tailwind-merge.
 * Esto permite resolver conflictos de clases de Tailwind (ej: px-2 vs px-4).
 * @param inputs Lista de clases o condiciones de clases.
 * @returns String con las clases combinadas y optimizadas.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convierte diversos formatos de fecha a un objeto Date de JavaScript de forma segura.
 * Soporta: Firestore Timestamp, Date nativo, string, número, y formatos serializados.
 * @param value El valor a convertir.
 * @returns Un objeto Date o null si la conversión falla.
 */
export function toDateSafe(value: unknown): Date | null {
  if (value == null) return null
  
  // Caso: Objeto con método toDate (como los Timestamps de Firebase)
  if (typeof (value as { toDate?: () => Date }).toDate === "function")
    return (value as { toDate: () => Date }).toDate()
    
  // Caso: Ya es un objeto Date
  if (value instanceof Date) return value
  
  // Caso: Objeto serializado { seconds, nanoseconds } (común en exportaciones)
  const v = value as Record<string, unknown>
  const sec = (v.seconds ?? v._seconds) as number | undefined
  if (typeof sec === "number") {
    const nsec = (v.nanoseconds ?? v._nanoseconds) as number | undefined
    return new Date(sec * 1000 + (typeof nsec === "number" ? nsec / 1e6 : 0))
  }
  
  // Caso: String o número (timestamp en ms)
  const d = new Date(value as string | number)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parsea un monto económico que puede venir en diversos formatos (número o string).
 * Maneja el formato chileno: puntos para miles y coma para decimales.
 * @param value El valor numérico o string a parsear.
 * @returns El valor como número (float).
 */
export function parseMonto(value: unknown): number {
  if (value == null) return 0
  if (typeof value === "number" && !Number.isNaN(value)) return value
  
  const s = String(value).trim()
  if (!s) return 0
  
  // Limpieza de formato chileno (ej: 1.234,56 -> 1234.56)
  const sinMiles = s.replace(/\./g, "")
  const conDecimal = sinMiles.replace(",", ".")
  const n = parseFloat(conDecimal)
  
  return Number.isNaN(n) ? 0 : n
}

/** 
 * Obtiene el nombre completo del usuario formateado para mostrar en la UI o auditoría.
 * @param user Objeto de usuario con nombre y apellido.
 * @returns String con el nombre completo o "Desconocido".
 */
export function getDisplayName(user: { name?: string | null; lastName?: string | null } | null | undefined): string {
  if (!user) return "Desconocido"
  const full = `${user.name ?? ""} ${user.lastName ?? ""}`.trim()
  return full || "Desconocido"
}

/** 
 * Extrae el "Subtítulo" de un código de cuenta presupuestaria.
 * Ejemplo: "215-21-01-001" -> "21" (el segundo segmento).
 * @param codigo El código completo de la cuenta.
 * @returns El subtítulo o null si no se puede extraer.
 */
export function getSubtituloFromCodigoCuenta(codigo: string | undefined): string | null {
  if (!codigo || typeof codigo !== "string") return null
  const partes = codigo.trim().split("-")
  if (partes.length >= 2) return partes[1].trim() || null
  return null
}

/**
 * Desglosa un código de cuenta presupuestaria en sus componentes básicos.
 * @param codigo El código completo (ej: 215-23-03-004-000-000).
 * @returns Un objeto con subtítulo, ítem, asignación y subasignación.
 */
export function parseDesagregacionFromCodigoCuenta(codigo: string | undefined): {
  subtitulo: string
  item: string
  asignacion: string
  subasignacion: string
} {
  const empty = { subtitulo: "", item: "", asignacion: "", subasignacion: "" }
  if (!codigo || typeof codigo !== "string") return empty
  
  const partes = codigo.trim().split("-").map((p) => p.trim())
  
  return {
    subtitulo: partes.length >= 2 ? partes[1] : "",
    item: partes.length >= 3 ? partes[2] : "",
    asignacion: partes.length >= 4 ? partes[3] : "",
    subasignacion: partes.length >= 5 ? partes[4] : "",
  }
}
