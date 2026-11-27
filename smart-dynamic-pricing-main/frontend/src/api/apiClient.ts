// src/api/apiClient.ts
import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// 1) Create a shared axios instance
const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,  
  headers: {
    'Content-Type': 'application/json',
  },
});

// 2) Centralized error handling
http.interceptors.response.use(
  res => res,
  (err: AxiosError) => {
    console.error('[API ERROR]', err.config?.url, err.response?.status, err.message);
    // You can show a toast here, or propagate a custom error type
    return Promise.reject(err);
  }
);

const apiClient = {
  // Products
  getProducts: () => http.get('/products').then(r => r.data),

  // Customer segments (raw)
  getCustomerSegments: () => http.get('/customer_segments').then(r => r.data),

  // Customer segment data for charts
  getCustomerSegmentData: () => http.get('/customer_segment_data').then(r => r.data),

  // Price–Demand–Revenue curves
  getPriceDemandData: () => http.get('/price_demand_data').then(r => r.data),

  // Time‑based pricing multipliers
  getTimePricingData: () => http.get('/time_pricing_data').then(r => r.data),

  // Generate a fresh random sample
  generateSampleData: () => http.post('/generate_sample_data').then(r => r.data),

  // Upload historical pricing CSV and train regression model
  uploadDataset: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post('/upload_dataset', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    }).then(r => r.data);
  },

  // Get dataset import status
  getDatasetStatus: () => http.get('/dataset_status').then(r => r.data),

  // Predict a recommended price for a single product
  recommendPrice: (features: {
    demand: number; stock: number; season: string; previous_sales: number; competitor_price?: number;
  }) => http.post('/recommend_price', features).then(r => r.data),

  // === Training ===
  getTrainingStatus: () => http.get('/training_status').then(r => r.data),
  getTrainingResults: () => http.get('/training_results').then(r => r.data),
  getBaselineComparison: () => http.get('/baseline_comparison').then(r => r.data),

  startTraining: (opts: {
    episodes: number;
    useBaseline: boolean;
    baselineStrategy: string;
  }) => http.post('/start_training', opts).then(r => r.data),
};

export default apiClient;
