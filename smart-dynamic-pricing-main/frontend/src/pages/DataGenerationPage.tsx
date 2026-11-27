import React, { useEffect, useState } from 'react';
import apiClient from '../api/apiClient';
import Button from '../components/Button';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

type UploadSummary = {
  rows_received: number;
  rows_used: number;
  features: string[];
  validation_mae: number | null;
  validation_r2: number | null;
};

const DataGenerationPage: React.FC<{ onDataGenerated: () => void }> = ({ onDataGenerated }) => {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [dataExists, setDataExists] = useState(false);

  useEffect(() => {
    apiClient.getProducts()
      .then((products: any[]) => setDataExists(Array.isArray(products) && products.length > 0))
      .catch(() => undefined);
  }, []);

  const handleUpload = async () => {
    if (!file) {
      setError('Select a CSV file first.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiClient.uploadDataset(file);
      setSummary(result.summary);
      setMessage(result.message || 'Dataset uploaded and model trained.');
      setDataExists(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload failed. Check the CSV columns and backend terminal.');
    } finally {
      setBusy(false);
    }
  };

  const handleSampleData = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.generateSampleData();
      setMessage('Demo data generated.');
      setDataExists(true);
      setSummary(null);
    } catch {
      setError('Could not generate sample data. Check that the backend is running.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full shadow-lg">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">AI-Based Dynamic Pricing for E-Commerce</h1>
          <p className="text-gray-600 mb-6">
            Upload historical sales data to train a regression model and estimate suitable product prices,
            or use generated demo data to explore the dashboard.
          </p>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-5">
            <h2 className="font-semibold text-blue-900 mb-2">Upload historical dataset (CSV)</h2>
            <p className="text-sm text-blue-800 mb-3">
              Required columns: demand, stock, season, previous_sales, and price or recommended_price.
              Optional: product_name and competitor_price. At least 5 valid rows; maximum 10 MB.
              <a className="ml-1 text-blue-600 underline" href="https://raw.githubusercontent.com/Sukhwinder17/smart-dynamic-pricing/main/backend/sample_pricing_dataset.csv">Download sample CSV</a>
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-700 mb-3"
            />
            {file && <p className="text-sm text-gray-600 mb-3">Selected: {file.name}</p>}
            <Button onClick={handleUpload} disabled={busy || !file} variant="primary">
              {busy ? <span className="flex items-center"><LoadingSpinner size="small" /><span className="ml-2">Processing CSV...</span></span> : 'Upload CSV & Train Regression Model'}
            </Button>
          </div>

          <div className="mb-5">
            <p className="text-sm text-gray-600 mb-3">No dataset? Generate sample products for a demo.</p>
            <Button onClick={handleSampleData} disabled={busy} variant="secondary">
              Generate Sample Data
            </Button>
          </div>

          {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
          {message && <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-green-700">{message}</div>}
          {summary && (
            <div className="mb-5 rounded bg-gray-50 p-4 text-sm text-gray-700">
              <p><strong>Rows:</strong> {summary.rows_used} usable / {summary.rows_received} uploaded</p>
              <p><strong>Features:</strong> {summary.features.join(', ')}</p>
              <p><strong>Validation MAE:</strong> {summary.validation_mae == null ? 'Dataset too small for holdout evaluation' : summary.validation_mae}</p>
              <p><strong>Validation R²:</strong> {summary.validation_r2 == null ? 'Not available' : summary.validation_r2}</p>
            </div>
          )}

          {dataExists && (
            <Button onClick={onDataGenerated} variant="primary" size="large">
              Continue to Dashboard
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};

export default DataGenerationPage;
