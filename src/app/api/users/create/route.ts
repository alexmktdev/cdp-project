/**
 * API para crear un nuevo usuario en la aplicación.
 *
 * SEGURIDAD:
 * - Autenticación: se exige cookie "session" con JWT. Sin cookie → 401.
 * - Verificación del token: getAdminAuth().verifyIdToken(sessionCookie) valida firma, expiración y emisor;
 *   devuelve decodedClaims.uid. Si el token es inválido o expirado, verifyIdToken lanza y se responde 500.
 * - Autorización (rol): se lee el documento users/{uid} en Firestore y se comprueba que role sea "sa" o "admin".
 *   Cualquier otro rol o usuario inexistente → 403 Forbidden. Así solo superadmin y admin pueden crear usuarios.
 * - Creación de usuarios: se usa Admin SDK (createUser + Firestore set) porque en firestore.rules
 *   la colección users tiene allow create: if false; así ningún cliente puede auto-registrarse ni crear docs en users.
 * - Validación de entrada: body debe tener email, password, name, lastName, role; si falta alguno → 400.
 * - Errores de Auth: email-already-exists → 409; invalid-password → 400; no exponer detalles internos en 500.
 */
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

/** POST: Crea usuario en Firebase Auth y en Firestore. Body: email, password, name, lastName, role. Requiere rol sa o admin. */
export async function POST(request: Request) {
  try {
    // SEGURIDAD: Sin cookie no hay identidad; rechazar antes de cualquier lógica.
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("session")?.value

    if (!sessionCookie) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    // SEGURIDAD: Verificación real del JWT (firma, expiración, emisor). Lanza si token inválido.
    const decodedClaims = await getAdminAuth().verifyIdToken(sessionCookie)
    const currentUserUid = decodedClaims.uid

    // SEGURIDAD: Autorización por rol — solo sa y admin pueden crear usuarios.
    const userDoc = await getAdminDb().collection("users").doc(currentUserUid).get()
    const userData = userDoc.data()

    if (!userData || !["sa", "admin"].includes(userData.role)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const { email, password, name, lastName, role } = await request.json()

    if (!email || !password || !name || !lastName || !role) {
      return new NextResponse("Missing fields", { status: 400 })
    }

    // Creación en Firebase Auth (Admin SDK; no está expuesta al cliente para usuarios arbitrarios).
    const userRecord = await getAdminAuth().createUser({
      email,
      password,
      emailVerified: true,
      disabled: false,
    })

    // Documento en Firestore; solo el backend puede escribir aquí por allow create: false en reglas.
    await getAdminDb().collection("users").doc(userRecord.uid).set({
      name,
      lastName,
      email,
      role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      lastConnection: FieldValue.serverTimestamp(),
    })

    return new NextResponse("User created successfully", { status: 201 })
  } catch (error) {
    console.error("Error creating user:", error)
    let errorMessage = "Internal Server Error"
    let statusCode = 500

    // SEGURIDAD: Mapear códigos de Firebase Auth a mensajes seguros; no exponer stack ni detalles internos.
    if (error && typeof error === "object" && "code" in error) {
      switch ((error as { code: string }).code) {
        case "auth/email-already-exists":
          errorMessage = "El correo ya está registrado."
          statusCode = 409
          break
        case "auth/invalid-password":
          errorMessage = "La contraseña debe tener al menos 6 caracteres."
          statusCode = 400
          break
      }
    }

    return new NextResponse(errorMessage, { status: statusCode })
  }
}
