// src/pages/Dashboard.tsx
import React, { useState, useEffect } from 'react'
import Header from '../components/Header'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import RevenueVsBaselineChart from '../components/RevenueVsBaselineChart'
import PriceDemandRevenueChart from '../components/PriceDemandRevenueChart'
import CustomerSegmentPie from '../components/CustomerSegmentPie'
import ProductPerformanceChart from '../components/ProductPerformanceChart'
import TimePricingChart from '../components/TimePricingChart'
import CustomerRetentionChart from '../components/CustomerRetentionChart'
import PriceSensitivityHeatmap from '../components/PriceSensitivityHeatmap'
import Button from '../components/Button'
import apiClient from '../api/apiClient'

//–– Types for local state ––
interface TrainingStatus {
  isTraining: boolean
  currentEpisode: number
  totalEpisodes: number
}
interface TrainingResults {
  finalReward: number
  avgLast10: number
  improvementOverBaseline: number
  rewardHistory: number[]
  baselineHistory: number[]
}
interface Product {
  name: string
  current_price: number
  stock: number
  recommended_price?: number
  recommendation?: string
}
interface Segment {
  name: string
  percentage: number
}
interface PdDatum {
  price: number
  demand: number
  revenue: number
}
interface TimeData {
  timeOfDay: string[]
  priceMultipliers: number[]
}
interface HeatmapDatum {
  product: string
  pricePoints: number[]
  demand: number[]
}

const Dashboard: React.FC = () => {
  //–– state hooks ––
  const [products, setProducts] = useState<Product[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [pdRaw, setPdRaw] = useState<HeatmapDatum[]>([])
  const [pdData, setPdData] = useState<PdDatum[]>([])
  const [timeData, setTimeData] = useState<TimeData>({
    timeOfDay: [],
    priceMultipliers: []
  })
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus>({
    isTraining: false,
    currentEpisode: 0,
    totalEpisodes: 0
  })
  const [trainingResults, setTrainingResults] = useState<TrainingResults>({
    finalReward: 0,
    avgLast10: 0,
    improvementOverBaseline: 0,
    rewardHistory: [],
    baselineHistory: []
  })
  const [episodesToRun, setEpisodesToRun] = useState<number>(100)
  const [datasetFile, setDatasetFile] = useState<File | null>(null)
  const [datasetBusy, setDatasetBusy] = useState(false)
  const [datasetMessage, setDatasetMessage] = useState('')
  const [datasetError, setDatasetError] = useState('')
  const [uploadedProducts, setUploadedProducts] = useState<any[]>([])
  const [priceFeatures, setPriceFeatures] = useState({ demand: '50', stock: '100', season: 'Summer', previous_sales: '40', competitor_price: '' })
  const [pricePrediction, setPricePrediction] = useState<number | null>(null)
  const [pricePredictionError, setPricePredictionError] = useState('')

  const handleRecommendPrice = async () => {
    setPricePredictionError(''); setPricePrediction(null)
    try {
      const payload: any = { demand: Number(priceFeatures.demand), stock: Number(priceFeatures.stock), season: priceFeatures.season, previous_sales: Number(priceFeatures.previous_sales) }
      if (priceFeatures.competitor_price.trim()) payload.competitor_price = Number(priceFeatures.competitor_price)
      const result = await apiClient.recommendPrice(payload)
      setPricePrediction(Number(result.recommended_price))
    } catch (err: any) {
      setPricePredictionError(err?.response?.data?.message || 'Could not predict price. Upload and train a CSV first.')
    }
  }

  const handleDatasetUpload = async () => {
    if (!datasetFile) { setDatasetError('Choose a CSV file first.'); return }
    setDatasetBusy(true); setDatasetError(''); setDatasetMessage('')
    try {
      const result = await apiClient.uploadDataset(datasetFile)
      setProducts(result.products || [])
      setUploadedProducts(result.products || [])
      setDatasetMessage(`${result.summary.rows_used} valid rows loaded. Regression model trained.`)
    } catch (err: any) {
      setDatasetError(err?.response?.data?.message || 'CSV upload failed. Check required columns and backend terminal.')
    } finally { setDatasetBusy(false) }
  }

  //–– load everything on mount ––
  useEffect(() => {
    async function loadAll() {
      try {
        const [
          prods,
          segsRaw,
          priceDemandRaw,
          timeRaw,
          statusRaw,
          resultsRaw
        ] = await Promise.all([
          apiClient.getProducts(),
          apiClient.getCustomerSegments(),
          apiClient.getPriceDemandData(),
          apiClient.getTimePricingData(),
          apiClient.getTrainingStatus(),
          apiClient.getTrainingResults()
        ])

        // products
        setProducts(prods)

        // segments → percentage
        setSegments(
          segsRaw.map((s: any) => ({
            name: s.name,
            percentage: (typeof s.size === 'number' ? s.size : 0) * 100
          }))
        )

        // price–demand–revenue raw
        setPdRaw(priceDemandRaw)

        // flatten first product into pdData
        if (priceDemandRaw.length > 0) {
          const first = priceDemandRaw[0]
          setPdData(
            first.pricePoints.map((p: number, i: number) => ({
              price: p,
              demand: first.demand[i],
              revenue: first.revenue[i]
            }))
          )
        }

        // time‐pricing
        setTimeData({
          timeOfDay: timeRaw.timeOfDay,
          priceMultipliers: timeRaw.priceMultipliers
        })

        // training status & results
        setTrainingStatus(statusRaw)
        setTrainingResults({
          finalReward: Number(resultsRaw.finalReward) || 0,
          avgLast10: Number(resultsRaw.avgLast10) || 0,
          improvementOverBaseline:
            Number(resultsRaw.improvementOverBaseline) || 0,
          rewardHistory: Array.isArray(resultsRaw.rewardHistory)
            ? resultsRaw.rewardHistory.map((v: any) => Number(v) || 0)
            : [],
          baselineHistory: Array.isArray(resultsRaw.baselineHistory)
            ? resultsRaw.baselineHistory.map((v: any) => Number(v) || 0)
            : []
        })
      } catch (e) {
        console.error('Error loading dashboard data:', e)
      }
    }
    loadAll()
  }, [])

  //–– poll training status every 2s when training ––
  useEffect(() => {
    if (!trainingStatus.isTraining) return
    const iv = setInterval(async () => {
      const statusRaw = await apiClient.getTrainingStatus()
      setTrainingStatus(statusRaw)
      if (statusRaw.isTraining) {
        const resultsRaw = await apiClient.getTrainingResults()
        setTrainingResults((r) => ({
          ...r,
          finalReward: Number(resultsRaw.finalReward) || 0,
          avgLast10: Number(resultsRaw.avgLast10) || 0,
          improvementOverBaseline:
            Number(resultsRaw.improvementOverBaseline) || 0,
          rewardHistory: Array.isArray(resultsRaw.rewardHistory)
            ? resultsRaw.rewardHistory.map((v: any) => Number(v) || 0)
            : [],
          baselineHistory: Array.isArray(resultsRaw.baselineHistory)
            ? resultsRaw.baselineHistory.map((v: any) => Number(v) || 0)
            : []
        }))
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [trainingStatus.isTraining])

  //–– start training handler ––
  const handleStart = async () => {
    await apiClient.startTraining({
      episodes: episodesToRun,
      useBaseline: true,
      baselineStrategy: 'combined'
    })
    const statusRaw = await apiClient.getTrainingStatus()
    setTrainingStatus(statusRaw)
  }

  const {
    finalReward,
    avgLast10,
    improvementOverBaseline,
    rewardHistory,
    baselineHistory
  } = trainingResults

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Smart Dynamic Pricing Dashboard" />

      <div className="container mx-auto p-4 space-y-6">
        <Card>
          <h2 className="text-lg font-semibold mb-2">Train Pricing Model with Your Dataset</h2>
          <p className="text-sm text-gray-600 mb-3">CSV columns: demand, stock, season, previous_sales, and price or recommended_price. Optional: product_name, competitor_price. Minimum 5 valid rows. <a className="text-blue-600 underline" href="https://raw.githubusercontent.com/Sukhwinder17/smart-dynamic-pricing/main/backend/sample_pricing_dataset.csv">Download sample CSV</a>.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="file" accept=".csv,text/csv" onChange={(e) => setDatasetFile(e.target.files?.[0] || null)} className="text-sm" />
            <Button onClick={handleDatasetUpload} disabled={datasetBusy || !datasetFile} variant="primary">
              {datasetBusy ? 'Training model...' : 'Upload CSV & Train'}
            </Button>
          </div>
          {datasetError && <p className="mt-3 text-sm text-red-600">{datasetError}</p>}
          {datasetMessage && <p className="mt-3 text-sm text-green-700">{datasetMessage}</p>}
          <div className="mt-5 border-t pt-4">
            <h3 className="font-semibold mb-3">Get a price recommendation</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <label className="text-xs text-gray-600">Demand<input type="number" min="0" value={priceFeatures.demand} onChange={(e) => setPriceFeatures({...priceFeatures, demand: e.target.value})} className="mt-1 w-full border rounded p-2 text-sm" /></label>
              <label className="text-xs text-gray-600">Stock<input type="number" min="0" value={priceFeatures.stock} onChange={(e) => setPriceFeatures({...priceFeatures, stock: e.target.value})} className="mt-1 w-full border rounded p-2 text-sm" /></label>
              <label className="text-xs text-gray-600">Season<input value={priceFeatures.season} onChange={(e) => setPriceFeatures({...priceFeatures, season: e.target.value})} className="mt-1 w-full border rounded p-2 text-sm" /></label>
              <label className="text-xs text-gray-600">Previous sales<input type="number" min="0" value={priceFeatures.previous_sales} onChange={(e) => setPriceFeatures({...priceFeatures, previous_sales: e.target.value})} className="mt-1 w-full border rounded p-2 text-sm" /></label>
              <label className="text-xs text-gray-600">Competitor price (optional)<input type="number" min="0" value={priceFeatures.competitor_price} onChange={(e) => setPriceFeatures({...priceFeatures, competitor_price: e.target.value})} className="mt-1 w-full border rounded p-2 text-sm" /></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={handleRecommendPrice} variant="secondary">Predict Recommended Price</Button>
              {pricePrediction !== null && <span className="font-semibold text-green-700">Recommended price: {pricePrediction.toFixed(2)} (dataset currency)</span>}
            </div>
            {pricePredictionError && <p className="mt-2 text-sm text-red-600">{pricePredictionError}</p>}
          </div>
          {uploadedProducts.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="text-left border-b"><th className="p-2">Product</th><th className="p-2">Current price</th><th className="p-2">Recommended</th><th className="p-2">Action</th></tr></thead>
                <tbody>{uploadedProducts.slice(0, 10).map((p, i) => (
                  <tr key={i} className="border-b"><td className="p-2">{p.name}</td><td className="p-2">{Number(p.current_price).toFixed(2)}</td><td className="p-2">{Number(p.recommended_price).toFixed(2)}</td><td className="p-2">{p.recommendation}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        {/* AI Training Control */}
        <Card>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Experimental DQN Simulation (Optional)</h2>
              {trainingStatus.isTraining ? (
                <p className="text-sm text-gray-600">
                  Episode {trainingStatus.currentEpisode} /{' '}
                  {trainingStatus.totalEpisodes}
                </p>
              ) : (
                <p className="text-sm text-gray-600">Not training</p>
              )}
            </div>
            <div className="mt-4 md:mt-0 flex items-center space-x-2">
              {!trainingStatus.isTraining && (
                <>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    value={episodesToRun}
                    onChange={(e) => setEpisodesToRun(+e.target.value)}
                    className="border px-2 py-1 rounded"
                  />
                  <Button onClick={handleStart} variant="primary">
                    Start
                  </Button>
                </>
              )}
            </div>
          </div>

          {trainingStatus.isTraining && (
            <div className="w-full h-2 bg-gray-200 rounded mt-3 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{
                  width: `${
                    (trainingStatus.currentEpisode /
                      trainingStatus.totalEpisodes) *
                    100
                  }%`
                }}
              />
            </div>
          )}

          {trainingStatus.isTraining && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <StatCard
                title="Final Reward"
                value={finalReward.toFixed(2)}
                trend={finalReward >= 0 ? 'up' : 'down'}
                trendValue={Math.abs(finalReward).toFixed(2)}
              />
              <StatCard
                title="Avg Last 10"
                value={avgLast10.toFixed(2)}
                trend={avgLast10 >= 0 ? 'up' : 'down'}
                trendValue={Math.abs(avgLast10).toFixed(2)}
              />
              <StatCard
                title="Improvement %"
                value={`${improvementOverBaseline.toFixed(2)}%`}
                trend={improvementOverBaseline >= 0 ? 'up' : 'down'}
                trendValue={`${Math.abs(
                  improvementOverBaseline
                ).toFixed(2)}%`}
              />
            </div>
          )}
        </Card>

        {/* Charts */}
        <Card>
          <h3 className="text-lg font-semibold mb-2">
            Revenue vs Baseline (Cumulative)
          </h3>
          <RevenueVsBaselineChart
            agentRewards={rewardHistory}
            baselineRewards={baselineHistory}
          />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold mb-2">
              Price–Demand–Revenue
            </h3>
            <PriceDemandRevenueChart data={pdData} />
          </Card>

          <Card>
            <h3 className="text-lg font-semibold mb-2">
              Customer Segments
            </h3>
            <CustomerSegmentPie data={segments} />
          </Card>

          <Card>
            <h3 className="text-lg font-semibold mb-2">
              Projected Revenue
            </h3>
            <ProductPerformanceChart products={products} />
          </Card>

          <Card>
            <h3 className="text-lg font-semibold mb-2">
              Time-Based Pricing
            </h3>
            <TimePricingChart data={timeData} />
          </Card>

          <Card className="lg:col-span-2">
            <h3 className="text-lg font-semibold mb-2">
              Customer Retention
            </h3>
            <CustomerRetentionChart
              data={{
                months: ['Jan','Feb','Mar','Apr','May','Jun'],
                retention: [95,92,88,90,93,95]
              }}
            />
          </Card>

          <Card className="lg:col-span-2">
            <h3 className="text-lg font-semibold mb-2">
              Price Sensitivity Heatmap
            </h3>
            <PriceSensitivityHeatmap data={pdRaw} />
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
