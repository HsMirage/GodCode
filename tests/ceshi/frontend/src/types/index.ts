export type EventType = 'black' | 'red';
export type EventStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'user' | 'admin' | 'super_admin';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  role: UserRole;
  status: 'active' | 'banned';
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  englishName?: string;
  logo?: string;
  country: string;
  industry: string;
  description?: string;
  blackCount: number;
  redCount: number;
  createdAt: string;
}

export interface Event {
  id: string;
  brandId: string;
  brand: Brand;
  userId: string;
  user: User;
  type: EventType;
  title: string;
  content: string;
  eventDate: string;
  eventLocation?: string;
  affectedCountry: string;
  severity: number; // 1-5
  sourceUrls: string[];
  status: EventStatus;
  rejectReason?: string;
  viewCount: number;
  tags: Tag[];
  images: EventImage[];
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  type: 'black' | 'red' | 'both';
  usageCount: number;
}

export interface EventImage {
  id: string;
  eventId: string;
  imageUrl: string;
  sortOrder: number;
}

export interface Comment {
  id: string;
  eventId: string;
  userId: string;
  user: User;
  parentId?: string;
  content: string;
  status: 'approved' | 'pending' | 'rejected';
  createdAt: string;
  replies?: Comment[];
}

export interface Favorite {
  id: string;
  userId: string;
  eventId: string;
  createdAt: string;
}

export interface Stats {
  totalBrands: number;
  totalBlackEvents: number;
  totalRedEvents: number;
  totalUsers: number;
  pendingEvents: number;
}

export interface SearchFilters {
  keyword?: string;
  type?: EventType | 'all';
  brandIds?: string[];
  startDate?: string;
  endDate?: string;
  countries?: string[];
  industries?: string[];
  tags?: string[];
  page?: number;
  limit?: number;
  sort?: 'latest' | 'hot' | 'severity';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}