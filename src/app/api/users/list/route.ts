/**
 * API para listar todos los usuarios de la aplicación.
 *
 * SEGURIDAD:
 * - Misma cadena que create: cookie → verifyIdToken → leer users/{uid}.role → solo si role in ["sa","admin"] continuar.
 * - Sin cookie → 401. Token inválido/expirado → verifyIdToken lanza → 500.
 * - Usar getAdminDb().collection("users").get() permite leer todos los documentos sin restricción de reglas;
 *   las reglas del cliente limitan quién puede leer qué, pero la API ya autorizó por rol en el paso anterior.
 * - No se exponen contraseñas ni tokens; solo datos de perfil y timestamps (createdAt, lastConnection).
 */
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

/** GET: Lista usuarios. Requiere cookie con JWT válido y rol sa o admin. */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("session")?.value

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let decodedClaims
    try {
      decodedClaims = await getAdminAuth().verifyIdToken(sessionCookie)
    } catch (verifyError: unknown) {
      const code = (verifyError as { code?: string })?.code
      if (code === "auth/id-token-expired") {
        return NextResponse.json(
          { error: "Token expirado", code: "id-token-expired" },
          { status: 401 }
        )
      }
      throw verifyError
    }
    const currentUserUid = decodedClaims.uid

    const userDoc = await getAdminDb().collection("users").doc(currentUserUid).get()
    const userData = userDoc.data()

    if (!userData || !["sa", "admin"].includes(userData.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const snapshot = await getAdminDb().collection("users").get()
    const users = snapshot.docs.map((d) => {
      const data = d.data()
      const createdAt = data.createdAt?.toMillis?.() ?? null
      const lastConnection = data.lastConnection?.toMillis?.() ?? null
      return { id: d.id, ...data, createdAt, lastConnection }
    })
    users.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

    return NextResponse.json(users)
  } catch (error) {
    console.error("Error listing users:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
