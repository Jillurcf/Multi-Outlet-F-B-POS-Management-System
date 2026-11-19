import type { AuthUser, LoginResponse, Role } from '@pos/shared';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors/AppError';
import { userRepository } from '../repositories/user.repository';

interface AuthIdentity {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  outletId: string | null;
}

function toAuthUser(user: AuthIdentity): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    outletId: user.outletId
  };
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await userRepository.findByEmail(email);

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
    });

    return {
      token,
      user: toAuthUser(user)
    };
  },

  async getAuthUser(userId: string): Promise<AuthUser> {
    const user = await userRepository.findById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedError();
    }

    return toAuthUser(user);
  }
};
