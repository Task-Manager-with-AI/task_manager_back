export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// Augment Express Request to carry authenticated user payload
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roleId: number;
      };
    }
  }
}
