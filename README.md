# AI-Based Dynamic Pricing Website for E-Commerce

A web prototype for e-commerce price recommendations. It uses a **Random Forest regression model** trained on historical pricing data uploaded as CSV, with a Flask API and React dashboard.

## Features

- Upload and validate historical pricing CSV data
- Clean missing/invalid rows and preprocess seasonal categories
- Train a regression model to estimate a target/recommended price
- Evaluate the model with validation MAE and R² when the dataset is large enough
- View current and recommended prices for imported products
- Enter demand, stock, season and previous sales to predict a price for a single product
- Dashboard charts for product performance, customer segments, demand/revenue and pricing trends
- Optional simulated DQN training environment retained for experimentation; it is separate from the uploaded-data regression workflow

## Dataset upload

Use the dashboard's **Upload CSV & Train** area. The CSV needs at least 5 valid rows and should contain:

Required columns:
- `demand`
- `stock`
- `season`
- `previous_sales`
- `recommended_price` or `target_price` (the target the model learns)

If no target column is present, `price` is used as the target. Common aliases such as `quantity_sold`, `inventory`, `historical_sales`, `current_price`, and `optimal_price` are accepted.

Optional columns:
- `product_name`
- `price` (current price shown beside the recommendation)
- `competitor_price`

A synthetic example file is included at [backend/sample_pricing_dataset.csv](backend/sample_pricing_dataset.csv). It is for testing only, not real business data. Uploaded CSV data and the fitted model are saved under `backend/uploads/` on the machine running Flask (this folder is git-ignored), and are restored after a backend restart.

## Windows setup

Requirements: Python 3.10, Node.js 18 LTS, and npm.

### Backend — first CMD window

```cmd
cd /d "%USERPROFILE%\Downloads\smart-dynamic-pricing-main\backend"
if not exist .venv\Scripts\python.exe py -3.10 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python enhanced_api.py
```

Backend API: http://localhost:5000/api

### Frontend — second CMD window

```cmd
cd /d "%USERPROFILE%\Downloads\smart-dynamic-pricing-main\smart-dynamic-pricing-main\frontend"
npm install
npm start
```

Dashboard: http://localhost:3000

Keep both terminals open. Upload a CSV in the dashboard to train the regression model before using the single-product price predictor.

## Main technologies

Python, Flask, pandas, NumPy, scikit-learn, React, TypeScript, Chart.js.
