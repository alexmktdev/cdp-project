/**
 * Middleware de Next.js para el control de acceso y seguridad.
 *
 * SEGURIDAD — Este archivo es la primera línea de defensa en cada petición:
 *
 * 1. Control de acceso (autorización a nivel de ruta):
 *    - Rutas públicas: /, /login, /forgot-password. Sin cookie no se redirige a login.
 *    - Rutas protegidas: dashboard, cdp, configuracion, users, etc. Sin cookie "session"
 *      se redirige a /login?from=<ruta> para evitar acceso no autenticado.
 *    - Si hay sesión y el usuario entra a /login, se redirige a /dashboard para evitar
 *      pantallas de login innecesarias y fugas de contexto.
 *
 * 2. Validación de token en middleware:
 *    - Solo se comprueba FORMATO del token (longitud > 20 y contiene "."), no se verifica
 *      el JWT contra Firebase aquí (eso se hace en las APIs con Admin SDK). Objetivo:
 *      rechazar cookies corruptas o vacías y forzar re-login sin coste de una llamada a Firebase.
 *    - Si el formato es inválido en ruta protegida, se borra la cookie y se redirige a login.
 *
 * 3. Cabeceras de seguridad (OWASP):
 *    - X-Frame-Options: DENY — Mitiga clickjacking (que la app se cargue en un iframe malicioso).
 *    - X-Content-Type-Options: nosniff — Evita MIME sniffing (que el navegador interprete
 *      contenido como otro tipo y ejecute código).
 *    - Referrer-Policy — Limita qué información de la URL se envía en Referer al navegar.
 *    - Permissions-Policy — Desactiva acceso a cámara, micrófono, geolocalización, FLoC.
 *    - Content-Security-Policy (CSP) — Restringe orígenes de scripts, conexiones, frames,
 *      estilos, fuentes e imágenes; solo se permiten dominios necesarios para Firebase/Google.
 *    - Cache-Control / Pragma / Expires — Evitan que respuestas con datos sensibles se
 *      almacenen en caché del navegador o proxies.
 *    - CORS — Solo mismo origen; métodos GET, POST, OPTIONS; cabecera Content-Type.
 *
 * 4. Matcher: el middleware se ejecuta en todas las rutas excepto _next/static, _next/image
 *    y favicon.ico para no afectar rendimiento de estáticos.
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** 
 * Rutas públicas — Accesibles sin cookie de sesión.
 * No se exige autenticación; el middleware solo redirige a /dashboard si ya hay sesión.
 */
const publicRoutes = ["/", "/login", "/forgot-password"]

/** 
 * Prefijos de rutas protegidas — Requieren cookie "session" con valor.
 * Cualquier petición a una ruta que empiece por uno de estos prefijos sin cookie
 * resulta en redirect a /login con ?from=<pathname> para poder devolver al usuario tras el login.
 */
const protectedRoutes = [
  "/dashboard",
  "/profile",
  "/cdp",
  "/configuracion",
  "/ingresos",
  "/suministros",
  "/users",
  "/plan-anual-de-compras",
  "/companies",
  "/branches",
  "/settings",
  "/contracts",
]

/**
 * Función principal del middleware.
 * Se ejecuta en cada petición que coincida con el matcher configurado al final.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  /* 
   * SEGURIDAD API: Las rutas /api/* siempre reciben las cabeceras de seguridad.
   * No se comprueba aquí la cookie para las APIs; cada ruta API que lo necesite
   * lee la cookie y verifica el token con Firebase Admin (verifyIdToken).
   * OPTIONS: respuesta 204 para preflight CORS sin procesar cuerpo.
   */
  if (pathname.startsWith("/api")) {
    if (request.method === "OPTIONS") {
      const res = new NextResponse(null, { status: 204 })
      return addSecurityHeaders(res, request)
    }
    return addSecurityHeaders(NextResponse.next(), request)
  }

  // SEGURIDAD: Toda decisión de redirección se basa en la presencia de la cookie "session".
  // No se confía en localStorage ni en estado del cliente; la cookie es la fuente de verdad en el servidor.
  const sessionCookie = request.cookies.get("session")
  const hasSession = sessionCookie && sessionCookie.value

  /* 
   * Raíz (/): con sesión → dashboard; sin sesión → login.
   * Evita exponer contenido público en / que pueda confundir o permitir enlaces directos no deseados.
   */
  if (pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = hasSession ? "/dashboard" : "/login"
    return addSecurityHeaders(NextResponse.redirect(url), request)
  }

  /* 
   * SEGURIDAD: Usuario ya autenticado no debe ver /login ni /forgot-password.
   * Redirigir a /dashboard reduce superficie de ataque y evita que se reutilice
   * la pantalla de login con sesión activa (p. ej. en otra pestaña).
   */
  if (publicRoutes.includes(pathname) && pathname !== "/" && hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return addSecurityHeaders(NextResponse.redirect(url), request)
  }

  /* 
   * SEGURIDAD: Sin cookie = no autenticado. Cualquier acceso a ruta protegida se deniega
   * y se guarda la ruta en ?from= para redirección post-login (mejor UX y mismo origen;
   * la validación de "from" en el cliente evita open redirect).
   */
  if (!hasSession) {
    const isProtected = protectedRoutes.some((route) => pathname.startsWith(route))

    if (isProtected) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("from", pathname)
      return addSecurityHeaders(NextResponse.redirect(url), request)
    }

    return addSecurityHeaders(NextResponse.next(), request)
  }

  /* 
   * SEGURIDAD: Validación de formato del token solo en rutas protegidas.
   * - Objetivo: detectar cookies vacías, truncadas o manipuladas sin llamar a Firebase.
   * - Si falla: se borra la cookie (response.cookies.delete) y redirect a /login para
   *   que el usuario obtenga una sesión nueva. No se deja cookie inválida en el cliente.
   */
  try {
    if (hasSession && isProtectedRoute(pathname)) {
      const tokenValid = isValidToken(sessionCookie.value)
      if (!tokenValid) {
        // Si el token no es válido, se borra la cookie y se redirige al login
        const response = addSecurityHeaders(
          NextResponse.redirect(new URL("/login", request.url)),
          request,
        )
        response.cookies.delete("session")
        return response
      }
    }
  } catch (error) {
    console.error("Error al verificar el token:", error)
    const response = addSecurityHeaders(
      NextResponse.redirect(new URL("/login", request.url)),
      request,
    )
    response.cookies.delete("session")
    return response
  }

  // Si todo está correcto, se permite el paso a la siguiente etapa
  return addSecurityHeaders(NextResponse.next(), request)
}

/** 
 * Determina si una ruta específica está dentro de la lista de rutas protegidas.
 */
function isProtectedRoute(pathname: string): boolean {
  return protectedRoutes.some((route) => pathname.startsWith(route))
}

/** 
 * SEGURIDAD: Validación solo de FORMATO (longitud y punto tipo JWT).
 * No se hace verifyIdToken aquí porque el middleware debe ser rápido y no depende de
 * red a Firebase. La verificación real del JWT (firma, expiración, emisor) se hace
 * en las rutas API con getAdminAuth().verifyIdToken().
 */
function isValidToken(token: string): boolean {
  try {
    return Boolean(token && token.length > 20 && token.includes("."))
  } catch (error) {
    console.error("Error al validar token:", error)
    return false
  }
}

/** 
 * SEGURIDAD OWASP: Cabeceras aplicadas a TODAS las respuestas (páginas y API).
 * - X-Frame-Options DENY: impide que la app se cargue en iframe (ataques clickjacking).
 * - X-Content-Type-Options nosniff: el navegador no infiere MIME; reduce XSS vía tipos incorrectos.
 * - Referrer-Policy: limita qué se envía en Referer (privacidad y evitar fugas de URLs sensibles).
 * - Permissions-Policy: desactiva APIs del navegador no usadas (cámara, micrófono, geolocation, FLoC).
 * - CSP: whitelist estricta de orígenes para scripts, connect, frame, style, font, img; form-action y base-uri 'self'.
 * - Cache-Control/Pragma/Expires: no almacenar respuestas sensibles en caché.
 * - CORS: solo mismo origen (origin === nextUrl.origin); métodos y cabeceras limitados.
 */
function addSecurityHeaders(
  response: NextResponse,
  request?: NextRequest,
): NextResponse {
  // Evita que el sitio sea cargado en iframes (Anti-clickjacking)
  response.headers.set("X-Frame-Options", "DENY")
  
  // Evita que el navegador intente adivinar el tipo de contenido (MIME sniffing)
  response.headers.set("X-Content-Type-Options", "nosniff")
  
  // Controla cuánta información de referencia se envía al navegar
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  
  // Restringe el acceso a APIs del navegador (cámara, micro, etc.)
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  )
  
  // Content Security Policy (CSP): Define qué recursos externos se pueden cargar
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.google.com",
      "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com wss://*.firebaseio.com https://*.firebaseio.com",
      "frame-src 'self' https://*.firebaseapp.com https://*.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  )
  
  // Desactiva el almacenamiento en caché para datos sensibles
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")

  // Configuración básica de CORS para el mismo origen
  if (request) {
    const origin = request.headers.get("origin")
    const allowedOrigin = request.nextUrl.origin
    if (origin === allowedOrigin) {
      response.headers.set("Access-Control-Allow-Origin", origin)
    }
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type")
    response.headers.set("Access-Control-Max-Age", "86400")
  }
  return response
}

/** 
 * Configuración del matcher para el middleware.
 * Define en qué rutas se debe ejecutar. Excluye archivos estáticos y favicon.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
