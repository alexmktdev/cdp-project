/**
 * Bitácora de movimientos de cuentas presupuestarias.
 * Este módulo se encarga de registrar en Firestore todas las acciones relevantes
 * realizadas sobre las cuentas presupuestarias para mantener una trazabilidad completa.
 */
import { db, serverTimestamp } from "@/lib/firebase"
import { collection, addDoc } from "firebase/firestore"

/** 
 * Tipos de acción que se pueden registrar en la bitácora.
 * Define las categorías de movimientos permitidos.
 */
export type TipoAccionBitacora =
  | "creacion"       // Cuando se crea una nueva cuenta
  | "edicion"        // Cuando se modifican datos básicos de una cuenta
  | "recalculo"      // Cuando se actualizan los saldos de la cuenta
  | "ajuste_cdp"     // Ajustes manuales relacionados con un CDP
  | "cdp_creado"     // Al emitir un nuevo Certificado de Disponibilidad Presupuestaria
  | "cdp_editado"    // Al modificar un CDP existente
  | "cdp_eliminado"  // Al anular o eliminar un CDP

/** 
 * Parámetros requeridos para registrar un movimiento en la bitácora.
 * Incluye información de la cuenta, la acción, los cambios y el usuario responsable.
 */
export interface ParamsRegistroBitacora {
  cuentaId: string               // ID único del documento de la cuenta en Firestore
  codigoCuenta: string           // Código presupuestario de la cuenta (ej: 21.01...)
  tipoAccion: TipoAccionBitacora // Categoría de la acción realizada
  descripcion: string            // Detalle descriptivo de lo que se hizo
  valorAnterior?: Record<string, unknown> // Estado previo de los datos (opcional)
  valorNuevo?: Record<string, unknown>    // Estado posterior de los datos (opcional)
  cdpId?: string                 // ID del CDP asociado (si aplica)
  cdpNumero?: string             // Número correlativo del CDP (si aplica)
  user: {                        // Información del usuario que realiza la acción
    name?: string | null
    lastName?: string | null
    email?: string | null
    uid?: string | null
  }
}

/** 
 * Función para añadir un nuevo registro a la colección 'bitacora_cuentas' en Firestore.
 * @param params Objeto con toda la información del movimiento a registrar.
 */
export async function registrarMovimientoCuenta(params: ParamsRegistroBitacora): Promise<void> {
  const {
    cuentaId,
    codigoCuenta,
    tipoAccion,
    descripcion,
    valorAnterior,
    valorNuevo,
    cdpId,
    cdpNumero,
    user,
  } = params

  // Determinar el nombre legible del usuario responsable
  const realizadoPor =
    user.name && user.lastName
      ? `${user.name} ${user.lastName}`.trim()
      : (user.email as string) || "Desconocido"

  // Inserción del documento en Firestore con marca de tiempo del servidor
  await addDoc(collection(db, "bitacora_cuentas"), {
    cuentaId,
    codigoCuenta,
    tipoAccion,
    descripcion,
    valorAnterior: valorAnterior ?? null,
    valorNuevo: valorNuevo ?? null,
    cdpId: cdpId ?? null,
    cdpNumero: cdpNumero ?? null,
    realizadoPor,
    realizadoPorUid: user.uid ?? null,
    fecha: serverTimestamp(), // Se usa el tiempo del servidor para consistencia
  })
}
