import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { logout } from '../api/auth';

/**
 * Sign-out action (FB-02 spec §5): calls `POST /v1/auth/logout`, clears the
 * query cache (none of it belongs to the next visitor), and navigates to
 * `/login`. Logout failures (already-expired session) are ignored — the
 * outcome the user wants, being signed out, still happens.
 */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async function signOut() {
    await logout().catch(() => undefined);
    queryClient.clear();
    await navigate({ to: '/login' });
  };
}
