"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface LikertData {
  name: string;
  value: number;
  percentage: number;
}

interface LikertChartProps {
  data: LikertData[];
}

const COLORS = {
  "strongly disagree": "#ef4444",
  disagree: "#f97316",
  neutral: "#a3a3a3",
  agree: "#22c55e",
  "strongly agree": "#16a34a",
};

export function LikertChart({ data }: LikertChartProps) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, "auto"]} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number, _name: string, props) => [
              `${value} (${props.payload.percentage.toFixed(1)}%)`,
              "Responses",
            ]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[entry.name as keyof typeof COLORS] || "#8884d8"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
