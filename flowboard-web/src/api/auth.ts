import type {
  AuthResponse,
  LoginRequest,
  MePatch,
  MeResponse,
  SignupRequest,
  User,
} from '@flowboard/shared';
import { request } from './client';

export function signup(body: SignupRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function login(body: LoginRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logout(): Promise<void> {
  return request<void>('/v1/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('/v1/me', { method: 'GET' });
}

export function patchMe(body: MePatch): Promise<User> {
  return request<User>('/v1/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
