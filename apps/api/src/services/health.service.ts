import { ServiceUnavailableError } from '../errors/AppError';
import { healthRepository } from '../repositories/health.repository';

export interface HealthStatus {
  status: 'ok';
  service: 'pos-api';
  database: 'up';
  timestamp: string;
}

export const healthService = {
  async getStatus(): Promise<HealthStatus> {
    const databaseUp = await healthRepository.checkDatabase();

    if (!databaseUp) {
      throw new ServiceUnavailableError('Database is unavailable');
    }

    return {
      status: 'ok',
      service: 'pos-api',
      database: 'up',
      timestamp: new Date().toISOString()
    };
  }
};
