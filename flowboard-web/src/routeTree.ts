import { authenticatedLayoutRoute } from './routes/authenticated';
import { boardRoute } from './routes/boards.$boardId';
import { indexRoute } from './routes/index';
import { loginRoute } from './routes/login';
import { rootRoute } from './routes/root';
import { signupRoute } from './routes/signup';

export const routeTree = rootRoute.addChildren([
  authenticatedLayoutRoute.addChildren([indexRoute, boardRoute]),
  signupRoute,
  loginRoute,
]);
