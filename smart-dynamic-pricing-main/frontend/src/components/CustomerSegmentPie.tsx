import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

type Segment = {
  name: string;
  percentage: number;
};

type CustomerSegmentPieProps = {
  data: Segment[];
};

const options: ChartOptions<'pie'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' },
    tooltip: {
      callbacks: {
        label: (context) => {
          const value = Number(context.parsed) || 0;
          return `${context.label}: ${value.toFixed(1)}%`;
        },
      },
    },
  },
};

const CustomerSegmentPie: React.FC<CustomerSegmentPieProps> = ({ data }) => {
  const chartData = {
    labels: data.map((segment) => segment.name),
    datasets: [
      {
        label: 'Customer segment share',
        data: data.map((segment) => segment.percentage),
        backgroundColor: [
          'rgba(54, 162, 235, 0.75)',
          'rgba(255, 99, 132, 0.75)',
          'rgba(255, 206, 86, 0.75)',
          'rgba(75, 192, 192, 0.75)',
          'rgba(153, 102, 255, 0.75)',
        ],
        borderWidth: 1,
      },
    ],
  };

  if (!data.length) {
    return <div className='flex h-64 items-center justify-center text-gray-500'>No customer segment data available</div>;
  }

  return (
    <div className='h-64 w-full'>
      <Pie data={chartData} options={options} />
    </div>
  );
};

export default CustomerSegmentPie;