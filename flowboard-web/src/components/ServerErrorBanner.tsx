interface ServerErrorBannerProps {
  message: string | undefined;
}

/**
 * Server-rejected submissions (`email_taken`, `invalid_credentials`,
 * `429`, network failure) render here, above the form, in a live region
 * (FB-02 spec §5). The owning form clears it on `Escape`.
 */
export function ServerErrorBanner({ message }: ServerErrorBannerProps) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" aria-live="assertive" className="server-error-banner">
      {message}
    </p>
  );
}
