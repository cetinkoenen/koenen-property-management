type ErrorDetails = {
  message?: unknown;
  details?: unknown;
};

export function getErrorMessage(error: unknown, fallback = "Unbekannter Fehler"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error !== null) {
    const details = error as ErrorDetails;
    if (typeof details.message === "string" && details.message) return details.message;
    if (typeof details.details === "string" && details.details) return details.details;
  }
  return fallback;
}
