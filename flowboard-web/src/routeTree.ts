import { indexRoute } from './routes/index';
import { loginRoute } from './routes/login';
import { rootRoute } from './routes/root';
import { signupRoute } from './routes/signup';

export const routeTree = rootRoute.addChildren([indexRoute, signupRoute, loginRoute]);
