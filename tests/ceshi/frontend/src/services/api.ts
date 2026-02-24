import type { 
  ApiResponse, 
  PaginatedResponse, 
  Event, 
  Brand, 
  User, 
  Stats, 
  SearchFilters,
  Comment,
  Favorite
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class ApiService {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = localStorage.getItem('token');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || data.error || '请求失败',
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络错误',
      };
    }
  }

  // 认证相关
  async register(data: { username: string; email: string; password: string }) {
    return this.request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: { email: string; password: string }) {
    return this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout() {
    return this.request<void>('/auth/logout', { method: 'POST' });
  }

  async getCurrentUser() {
    return this.request<User>('/auth/profile');
  }

  async updateProfile(data: Partial<User>) {
    return this.request<User>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // 统计数据
  async getStats() {
    return this.request<Stats>('/events/stats');
  }

  // 事件相关
  async getEvents(params: SearchFilters = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => queryParams.append(key, String(v)));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });

    return this.request<PaginatedResponse<Event>>(`/events?${queryParams}`);
  }

  async getEventById(id: string) {
    return this.request<Event>(`/events/${id}`);
  }

  async createEvent(data: Partial<Event>) {
    return this.request<Event>('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEvent(id: string, data: Partial<Event>) {
    return this.request<Event>(`/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(id: string) {
    return this.request<void>(`/events/${id}`, { method: 'DELETE' });
  }

  async getMyEvents(status?: string) {
    const params = status ? `?status=${status}` : '';
    return this.request<PaginatedResponse<Event>>(`/my/events${params}`);
  }

  // 品牌相关
  async getBrands(params: { page?: number; limit?: number } = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    });

    return this.request<PaginatedResponse<Brand>>(`/brands?${queryParams}`);
  }

  async getBrandById(id: string) {
    return this.request<Brand>(`/brands/${id}`);
  }

  async getBrandEvents(id: string, type?: 'black' | 'red') {
    const params = type ? `?type=${type}` : '';
    return this.request<PaginatedResponse<Event>>(`/brands/${id}/events${params}`);
  }

  async getHotBrands(limit = 10) {
    return this.request<Brand[]>(`/brands/hot?limit=${limit}`);
  }

  async createBrand(data: Partial<Brand>) {
    return this.request<Brand>('/brands', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // 搜索相关
  async search(filters: SearchFilters) {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => queryParams.append(key, String(v)));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });

    return this.request<PaginatedResponse<Event>>(`/search?${queryParams}`);
  }

  async getSearchSuggestions(query: string) {
    return this.request<{ brands: string[]; keywords: string[] }>(
      `/search/suggestions?q=${encodeURIComponent(query)}`
    );
  }

  async getHotSearches() {
    return this.request<string[]>('/search/hot');
  }

  // 收藏相关
  async toggleFavorite(eventId: string) {
    return this.request<Favorite>(`/events/${eventId}/favorite`, {
      method: 'POST',
    });
  }

  async getFavorites() {
    return this.request<PaginatedResponse<Event>>('/favorites');
  }

  // 评论相关
  async getEventComments(eventId: string) {
    return this.request<Comment[]>(`/events/${eventId}/comments`);
  }

  async createComment(eventId: string, content: string, parentId?: string) {
    return this.request<Comment>(`/events/${eventId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parentId }),
    });
  }

  // 标签相关
  async getTags(type?: 'black' | 'red' | 'both') {
    const params = type ? `?type=${type}` : '';
    return this.request<any[]>(`/tags${params}`);
  }

  // 管理后台
  async getAdminStats() {
    return this.request<Stats>('/admin/dashboard');
  }

  async getPendingEvents() {
    return this.request<PaginatedResponse<Event>>('/admin/audit/pending');
  }

  async approveEvent(id: string) {
    return this.request<Event>(`/admin/audit/${id}/approve`, {
      method: 'PUT',
    });
  }

  async rejectEvent(id: string, reason: string) {
    return this.request<Event>(`/admin/audit/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  }
}

export const api = new ApiService();