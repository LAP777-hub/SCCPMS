import type { AuthResponse, User } from './auth';

const API_BASE_URL = 'http://localhost:8000/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = localStorage.getItem('access_token');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.message || error.detail || 'Request failed');
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE_URL);

// Auth API
export const authApi = {
  login: (username: string, password: string, role: string) =>
    api.post<AuthResponse>('/accounts/login/', { username, password, role }),
  
  register: (data: any) =>
    api.post('/accounts/register/', data),
  
  getCurrentUser: () =>
    api.get<User>('/accounts/me/'),
};

// Patients API
export const patientsApi = {
  list: () => api.get('/patients/'),
  create: (data: any) => api.post('/patients/', data),
  get: (id: number) => api.get(`/patients/${id}/`),
  update: (id: number, data: any) => api.put(`/patients/${id}/`, data),
  delete: (id: number) => api.delete(`/patients/${id}/`),
};

// Doctors API
export const doctorsApi = {
  list: () => api.get('/doctors/'),
  create: (data: any) => api.post('/doctors/', data),
  get: (id: number) => api.get(`/doctors/${id}/`),
  update: (id: number, data: any) => api.put(`/doctors/${id}/`, data),
  delete: (id: number) => api.delete(`/doctors/${id}/`),
};

// Appointments API
export const appointmentsApi = {
  list: () => api.get('/clinic/'),
  create: (data: any) => api.post('/clinic/', data),
  get: (id: number) => api.get(`/clinic/${id}/`),
  update: (id: number, data: any) => api.put(`/clinic/${id}/`, data),
  delete: (id: number) => api.delete(`/clinic/${id}/`),
};

// Medical Records API
export const medicalRecordsApi = {
  list: () => api.get('/medical-records/'),
  create: (data: any) => api.post('/medical-records/', data),
  get: (id: number) => api.get(`/medical-records/${id}/`),
  update: (id: number, data: any) => api.put(`/medical-records/${id}/`, data),
  delete: (id: number) => api.delete(`/medical-records/${id}/`),
};

// Notifications API
export const notificationsApi = {
  list: (unreadOnly?: boolean) => 
    api.get(`/notifications/?unread=${unreadOnly ? 'true' : 'false'}`),
  get: (id: number) => api.get(`/notifications/${id}/`),
  markAsRead: (id: number) => api.post('/notifications/mark-read/', { notification_id: id }),
  markAllAsRead: () => api.post('/notifications/mark-all-read/'),
  getPreferences: () => api.get('/notifications/preferences/'),
  updatePreferences: (data: any) => api.put('/notifications/preferences/', data),
};

// Reports API
export const reportsApi = {
  list: () => api.get('/reports/'),
  generate: (data: any) => api.post('/reports/generate/', data),
  download: (id: number) => {
    const token = localStorage.getItem('access_token');
    window.open(`${API_BASE_URL}/reports/${id}/download/?token=${token}`, '_blank');
  },
};
