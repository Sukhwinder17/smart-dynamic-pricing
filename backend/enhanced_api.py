#!/usr/bin/env python3
from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
import random
import time
import threading
import os
import json
import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from enhanced_env import MarketEnvironment
from enhanced_agent import DQNAgent
from human_baseline import HumanBaseline
from enhanced_reward_system import EnhancedRewardSystem

app = Flask(__name__)
CORS(app)

# ─── Globals ──────────────────────────────────────────────────────────────────
env = MarketEnvironment(num_products=5, num_customer_segments=3, time_periods=24, competitors=2)
state_size = env.state_size
action_size = env.action_size

agent    = DQNAgent(state_size, action_size)
baseline = HumanBaseline(env, strategy='combined')
reward_system = EnhancedRewardSystem(baseline_comparison=True)

training_status = {
    "isTraining": False,
    "currentEpisode": 0,
    "totalEpisodes": 0,
    "startTime": None,
    "endTime": None
}

training_results = {
    "finalReward": 0,
    "avgLast10": 0,
    "improvementOverBaseline": 0,
    "rewardHistory": [],
    "baselineHistory": []
}

training_thread = None

# Optional user-uploaded historical pricing data and its regression model.
pricing_dataset = None
dataset_products = []
pricing_model = None
dataset_summary = {}

DATA_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
DATASET_PATH = os.path.join(DATA_DIR, 'pricing_dataset.csv')
MODEL_PATH = os.path.join(DATA_DIR, 'pricing_model.joblib')
SUMMARY_PATH = os.path.join(DATA_DIR, 'dataset_summary.json')

def _restore_uploaded_model():
    global pricing_dataset, dataset_products, pricing_model, dataset_summary
    if not (os.path.exists(DATASET_PATH) and os.path.exists(MODEL_PATH)):
        return
    try:
        pricing_dataset = pd.read_csv(DATASET_PATH)
        pricing_model = joblib.load(MODEL_PATH)
        if os.path.exists(SUMMARY_PATH):
            with open(SUMMARY_PATH, 'r', encoding='utf-8') as summary_file:
                dataset_summary = json.load(summary_file)
        features = dataset_summary.get('features', ['demand', 'stock', 'season', 'previous_sales'])
        predictions = pricing_model.predict(pricing_dataset[features])
        names = pricing_dataset['product_name'] if 'product_name' in pricing_dataset else [f'Product {i + 1}' for i in range(len(pricing_dataset))]
        prices = pricing_dataset['price'] if 'price' in pricing_dataset else pricing_dataset['target_price']
        dataset_products = []
        for name, current, stock, predicted in zip(names, prices, pricing_dataset['stock'], predictions):
            current = float(current) if pd.notna(current) else float(predicted)
            predicted = max(0.01, float(predicted))
            dataset_products.append({
                'name': str(name), 'current_price': round(current, 2),
                'recommended_price': round(predicted, 2), 'stock': int(stock),
                'recommendation': 'Increase Price' if predicted > current * 1.03 else ('Decrease Price' if predicted < current * 0.97 else 'Maintain Price')
            })
    except Exception as exc:
        print('Could not restore saved pricing dataset/model:', exc)

_restore_uploaded_model()


# ─── Core Training Loop ───────────────────────────────────────────────────────
def train_agent(episodes=10, use_baseline=True, baseline_strategy='combined'):
    global training_status, training_results, env, agent, baseline, reward_system

    training_status.update({
        "isTraining": True,
        "currentEpisode": 0,
        "totalEpisodes": episodes,
        "startTime": time.time(),
        "endTime": None
    })

    reward_system.reset()
    agent.epsilon = 1.0
    agent.update_target_model()

    if baseline.strategy != baseline_strategy:
        baseline.strategy = baseline_strategy

    # Pre-generate seeds for reproducibility
    seeds = [random.randrange(2**32) for _ in range(episodes)]

    for ep in range(episodes):
        seed = seeds[ep]
        training_status["currentEpisode"] = ep + 1

        # 1) Baseline run
        if use_baseline:
            random.seed(seed)
            np.random.seed(seed)
            b_reward, _, _ = baseline.run_episode()
            reward_system.add_baseline_reward(b_reward)

        # 2) Agent run
        random.seed(seed)
        np.random.seed(seed)
        state = env.reset()
        total_reward = 0
        done = False

        while not done:
            action = agent.act(state)
            next_state, reward, done, _ = env.step(action)
            agent.remember(state, action, reward, next_state, done)
            state = next_state
            total_reward += reward
            if len(agent.memory) > agent.batch_size:
                agent.replay()

        reward_system.add_agent_reward(total_reward)

        if (ep + 1) % 10 == 0:
            agent.update_target_model()

        # Update results
        hist = reward_system.agent_rewards
        training_results.update({
            "rewardHistory": hist,
            "baselineHistory": reward_system.baseline_rewards,
            "finalReward": hist[-1],
            "avgLast10": float(np.mean(hist[-10:])),
            "improvementOverBaseline": reward_system.get_improvement_percentage()
        })

        time.sleep(0.1)

    training_status.update({
        "isTraining": False,
        "endTime": time.time()
    })
    agent.save("smart_pricing_model.h5")


# ─── Helpers for static endpoints ─────────────────────────────────────────────
def _compute_price_demand(env):
    out = []
    for product in env.get_products():
        bp = product['base_price']
        pts = [bp * f for f in (0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3)]
        demand = [max(0, 100*(bp/p)**1.5) for p in pts]
        revenue = [p*d/100 for p,d in zip(pts,demand)]
        out.append((product, pts, demand, revenue))
    return out

def _compute_time_pricing():
    times = ['6 AM','8 AM','10 AM','12 PM','2 PM','4 PM','6 PM','8 PM','10 PM']
    mults = [0.85,0.9,0.95,1.0,1.05,1.1,1.15,1.1,1.0]
    return {"timeOfDay": times, "weekdays": ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], "priceMultipliers": mults}

def _compute_segment_data(env):
    segs = env.get_customer_segments()
    return [
        {
            "name": s['name'],
            "value": round(s['size']*100,1),
            "priceSensitivity": round(s['price_sensitivity'],2),
            "qualityPreference": round(s['quality_preference'],2)
        }
        for s in segs
    ]


# ─── API Endpoints ────────────────────────────────────────────────────────────
@app.route('/api/start_training', methods=['POST'])
def start_training():
    global training_thread
    data = request.json or {}
    episodes = int(data.get('episodes', 10))
    episodes = max(1, min(episodes, 1000))
    use_baseline = bool(data.get('useBaseline', True))
    baseline_strategy = data.get('baselineStrategy', 'combined')

    if training_thread and training_thread.is_alive():
        return jsonify({"success": False, "message": "Training already in progress"}), 400

    training_thread = threading.Thread(
        target=train_agent,
        args=(episodes, use_baseline, baseline_strategy),
        daemon=True
    )
    training_thread.start()
    return jsonify({"success": True, "message": f"Training started for {episodes} episodes"})


@app.route('/api/training_status', methods=['GET'])
def get_status():
    return jsonify(training_status)


@app.route('/api/training_results', methods=['GET'])
def get_results():
    return jsonify(training_results)


@app.route('/api/products', methods=['GET'])
def get_products():
    if dataset_products:
        return jsonify(dataset_products)
    prods = env.get_products()
    for p in prods:
        bp, cp = p['base_price'], p['current_price']
        p['recommendation'] = (
            'Increase Price' if cp < bp*0.9 else
            'Decrease Price' if cp > bp*1.1 else
            'Maintain Price'
        )
    return jsonify(prods)


@app.route('/api/customer_segments', methods=['GET'])
def get_customer_segments():
    return jsonify(env.get_customer_segments())


@app.route('/api/generate_sample_data', methods=['POST'])
def generate_sample_data():
    global env, pricing_dataset, dataset_products, pricing_model, dataset_summary
    pricing_dataset = None
    dataset_products = []
    pricing_model = None
    dataset_summary = {}
    for saved_path in (DATASET_PATH, MODEL_PATH, SUMMARY_PATH):
        if os.path.exists(saved_path):
            os.remove(saved_path)
    env = MarketEnvironment(num_products=5, num_customer_segments=3, time_periods=24, competitors=2)
    return jsonify({"products": env.get_products()})


@app.route('/api/baseline_comparison', methods=['GET'])
def baseline_comp():
    return jsonify(reward_system.get_reward_history())


@app.route('/api/price_demand_data', methods=['GET'])
def price_demand_data():
    out = []
    for p, pts, dm, rv in _compute_price_demand(env):
        out.append({
            "product": p['name'],
            "pricePoints": [round(x,2) for x in pts],
            "demand": [round(x,2) for x in dm],
            "revenue": [round(x,2) for x in rv]
        })
    return jsonify(out)


@app.route('/api/time_pricing_data', methods=['GET'])
def time_pricing_data():
    return jsonify(_compute_time_pricing())


@app.route('/api/customer_segment_data', methods=['GET'])
def customer_segment_data():
    return jsonify(_compute_segment_data(env))



# ─── Dataset upload and regression pricing ────────────────────────────────────
@app.route('/api/upload_dataset', methods=['POST'])
def upload_dataset():
    global pricing_dataset, dataset_products, pricing_model, dataset_summary

    file = request.files.get('file')
    if file is None or not file.filename:
        return jsonify({"success": False, "message": "Choose a CSV file to upload."}), 400
    if not file.filename.lower().endswith('.csv'):
        return jsonify({"success": False, "message": "Please upload a .csv file."}), 400
    if request.content_length and request.content_length > 10 * 1024 * 1024:
        return jsonify({"success": False, "message": "CSV must be smaller than 10 MB."}), 413

    try:
        df = pd.read_csv(file, encoding='utf-8-sig')
    except Exception as exc:
        return jsonify({"success": False, "message": "Could not read CSV: " + str(exc)}), 400

    # Accept common column names while storing one consistent schema.
    aliases = {
        'product_name': ['product_name', 'name', 'product'],
        'price': ['price', 'current_price', 'selling_price'],
        'target_price': ['recommended_price', 'target_price', 'optimal_price'],
        'demand': ['demand', 'quantity_sold', 'sales', 'units_sold'],
        'stock': ['stock', 'stock_quantity', 'inventory', 'inventory_level'],
        'season': ['season', 'seasonality', 'season_name'],
        'previous_sales': ['previous_sales', 'historical_sales', 'sales_previous_period', 'units_sold_previous'],
        'competitor_price': ['competitor_price', 'competition_price']
    }
    df.columns = [str(col).strip().lower().replace(' ', '_') for col in df.columns]
    normalized = pd.DataFrame(index=df.index)
    for canonical, options in aliases.items():
        found = next((name for name in options if name in df.columns), None)
        if found:
            normalized[canonical] = df[found]

    if 'target_price' not in normalized and 'price' in normalized:
        normalized['target_price'] = normalized['price']
    required = ['demand', 'stock', 'season', 'previous_sales', 'target_price']
    missing = [col for col in required if col not in normalized.columns]
    if missing:
        return jsonify({
            "success": False,
            "message": "Missing required columns: " + ", ".join(missing),
            "required_columns": required
        }), 400

    for col in ['demand', 'stock', 'previous_sales', 'target_price', 'price', 'competitor_price']:
        if col in normalized:
            normalized[col] = pd.to_numeric(normalized[col], errors='coerce')
    normalized['season'] = normalized['season'].astype(str).str.strip()
    normalized = normalized.replace([np.inf, -np.inf], np.nan)
    normalized = normalized.dropna(subset=required)
    normalized = normalized[(normalized['target_price'] > 0) & (normalized['stock'] >= 0) & (normalized['demand'] >= 0) & (normalized['previous_sales'] >= 0)]
    if len(normalized) < 5:
        return jsonify({"success": False, "message": "Need at least 5 valid rows after cleaning. Check missing values and numeric columns."}), 400

    feature_cols = ['demand', 'stock', 'season', 'previous_sales']
    numeric_cols = ['demand', 'stock', 'previous_sales']
    categorical_cols = ['season']
    if 'competitor_price' in normalized.columns and normalized['competitor_price'].notna().any():
        normalized['competitor_price'] = normalized['competitor_price'].fillna(normalized['competitor_price'].median())
        feature_cols.append('competitor_price')
        numeric_cols.append('competitor_price')

    try:
        preprocessor = ColumnTransformer([
            ('numeric', 'passthrough', numeric_cols),
            ('season', OneHotEncoder(handle_unknown='ignore'), categorical_cols)
        ])
        model = Pipeline([
            ('preprocess', preprocessor),
            ('regressor', RandomForestRegressor(n_estimators=150, random_state=42, min_samples_leaf=1))
        ])
        X = normalized[feature_cols]
        y = normalized['target_price'].astype(float)

        validation_mae = None
        validation_r2 = None
        if len(normalized) >= 10:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            validation_model = Pipeline([
                ('preprocess', ColumnTransformer([
                    ('numeric', 'passthrough', numeric_cols),
                    ('season', OneHotEncoder(handle_unknown='ignore'), categorical_cols)
                ])),
                ('regressor', RandomForestRegressor(n_estimators=150, random_state=42))
            ])
            validation_model.fit(X_train, y_train)
            validation_predictions = validation_model.predict(X_test)
            validation_mae = round(float(mean_absolute_error(y_test, validation_predictions)), 2)
            if len(y_test) >= 2:
                validation_r2 = round(float(r2_score(y_test, validation_predictions)), 3)

        model.fit(X, y)
        predictions = model.predict(X)
    except Exception as exc:
        return jsonify({"success": False, "message": "Could not train pricing model: " + str(exc)}), 400

    names = normalized['product_name'] if 'product_name' in normalized else pd.Series(['Product ' + str(i + 1) for i in range(len(normalized))], index=normalized.index)
    current_prices = normalized['price'] if 'price' in normalized else normalized['target_price']
    stock_values = normalized['stock']
    built_products = []
    for name, current, stock, recommended in zip(names, current_prices, stock_values, predictions):
        current = float(current) if pd.notna(current) else float(recommended)
        recommended = max(0.01, float(recommended))
        built_products.append({
            "name": str(name),
            "current_price": round(current, 2),
            "recommended_price": round(recommended, 2),
            "stock": int(stock),
            "recommendation": "Increase Price" if recommended > current * 1.03 else ("Decrease Price" if recommended < current * 0.97 else "Maintain Price")
        })

    dataset_summary = {
        "rows_received": int(len(df)),
        "rows_used": int(len(normalized)),
        "features": feature_cols,
        "target": "target_price",
        "validation_mae": validation_mae,
        "validation_r2": validation_r2
    }
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        normalized.to_csv(DATASET_PATH, index=False)
        joblib.dump(model, MODEL_PATH)
        with open(SUMMARY_PATH, 'w', encoding='utf-8') as summary_file:
            json.dump(dataset_summary, summary_file)
    except Exception as exc:
        return jsonify({"success": False, "message": "Model trained but could not save it: " + str(exc)}), 500

    pricing_dataset = normalized
    dataset_products = built_products
    pricing_model = model
    return jsonify({
        "success": True,
        "message": "CSV cleaned and regression model trained; model saved locally.",
        "summary": dataset_summary,
        "products": built_products[:100]
    })


@app.route('/api/dataset_status', methods=['GET'])
def get_dataset_status():
    return jsonify({"uploaded": pricing_dataset is not None, "summary": dataset_summary})


@app.route('/api/recommend_price', methods=['POST'])
def recommend_price():
    if pricing_model is None:
        return jsonify({"success": False, "message": "Upload a training CSV first."}), 400
    data = request.get_json(silent=True) or {}
    required = ['demand', 'stock', 'season', 'previous_sales']
    missing = [key for key in required if key not in data or data[key] in (None, '')]
    if missing:
        return jsonify({"success": False, "message": "Missing fields: " + ", ".join(missing)}), 400
    try:
        row = {
            'demand': float(data['demand']),
            'stock': float(data['stock']),
            'season': str(data['season']),
            'previous_sales': float(data['previous_sales'])
        }
        if 'competitor_price' in dataset_summary['features']:
            row['competitor_price'] = float(data.get('competitor_price', pricing_dataset['competitor_price'].median()))
        prediction = max(0.01, float(pricing_model.predict(pd.DataFrame([row]))[0]))
        return jsonify({"success": True, "recommended_price": round(prediction, 2), "currency": "same as dataset"})
    except (TypeError, ValueError) as exc:
        return jsonify({"success": False, "message": "Feature values must be valid numbers."}), 400



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
