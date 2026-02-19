import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * 统一成功响应
 */
export function successResponse<T>(
  res: Response,
  data: T,
  message: string = 'Success',
  statusCode: number = 200
): Response {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
}

/**
 * 统一错误响应
 */
export function errorResponse(
  res: Response,
  message: string = 'An error occurred',
  statusCode: number = 500,
  error?: string
): Response {
  const response: ApiResponse = {
    success: false,
    message,
    error,
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginatedResponse<T>(
  res: Response,
  data: PaginatedResponse<T>,
  message: string = 'Success'
): Response {
  return successResponse(res, data, message);
}