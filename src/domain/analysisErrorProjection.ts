/** Project an analysis error into a user-facing message. */
export const projectAnalysisError = (
  error: string,
): { readonly message: string } => ({
  message: `MACX configuration error: ${error}`,
});
