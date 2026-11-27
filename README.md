# Smart Dynamic Pricing System

AI-powered dynamic pricing dashboard using a Flask API, TensorFlow DQN agent, and React.

## Project layout

The repository contains the backend at `backend/` and the runnable React app at `smart-dynamic-pricing-main/frontend/`.

## Windows setup

Requirements:
- Python 3.10 (TensorFlow 2.11 is not compatible with newer Python versions such as 3.11/3.12)
- Node.js 18 LTS and npm

### 1. Start the backend

Open Command Prompt and run:

```cmd
cd /d "%USERPROFILE%\Downloads\smart-dynamic-pricing-main\backend"
py -3.10 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python enhanced_api.py
```

The API runs at `http://localhost:5000`. Keep this terminal open.

If you already created the virtual environment, skip the `py -3.10 -m venv .venv` line. Activate it and install requirements again if needed.

### 2. Start the frontend

Open a **second** Command Prompt window:

```cmd
cd /d "%USERPROFILE%\Downloads\smart-dynamic-pricing-main\smart-dynamic-pricing-main\frontend"
npm install
npm start
```

The dashboard opens at `http://localhost:3000`. Keep this terminal open too.

The frontend's API client defaults to `http://localhost:5000/api`, so no environment file is required for local development.

## Troubleshooting

- If `py -3.10` is not found, install Python 3.10 and enable the Python Launcher.
- If the frontend says port 3000 is busy, accept the prompt to use another port.
- If the backend reports a missing Python package, make sure the backend virtual environment is activated and run `pip install -r requirements.txt` from the backend folder.
- Do not run `npm install` from the repository root; run it inside `smart-dynamic-pricing-main/frontend`.

## Features

- Dueling Double DQN pricing agent
- Simulated products, customer segments, competitors, and time-of-day demand
- Flask endpoints for training, products, segments, pricing curves, and baseline comparisons
- React dashboard with charts and training controls

## License

MIT License. See [LICENSE](LICENSE).
