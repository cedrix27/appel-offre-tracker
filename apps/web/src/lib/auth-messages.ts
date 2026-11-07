import { isApiError } from "./api";

/** Message d'erreur des écrans d'authentification, selon le code puis le statut HTTP. */
export function authErrorMessage(e: unknown, context: "login" | "register" | "token" | "generic" = "generic"): string {
  if (!isApiError(e)) return "Une erreur inattendue est survenue.";
  switch (e.code) {
    case "EMAIL_NOT_VERIFIED":
      return "Votre adresse e-mail n'est pas encore vérifiée. Ouvrez le lien reçu par e-mail ou demandez-en un nouveau.";
    case "ACCOUNT_SUSPENDED":
      return "Ce compte est suspendu. Contactez SRC Digital pour le réactiver.";
  }
  if (e.statusCode === 0 || e.statusCode === 429 || e.statusCode >= 500) return e.message;
  if (context === "login" && e.statusCode === 401) return "Adresse e-mail ou mot de passe incorrect.";
  if (context === "register" && e.statusCode === 409) return "Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.";
  if (context === "token" && [400, 401, 404, 410].includes(e.statusCode))
    return "Ce lien est invalide, a expiré ou a déjà été utilisé.";
  return e.message;
}
