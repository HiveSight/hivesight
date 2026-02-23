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
  "strongly disagree": "#dc2626",
  disagree: "#ea580c",
  neutral: "#a3a3a3",
  agree: "#16a34a",
  "strongly agree": "#15803d",
};

export function LikertChart({ data }: LikertChartProps) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="hsla(35, 15%, 88%, 0.6)" />
          <XAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 12, fill: "hsl(30, 5%, 45%)" }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 12, fill: "hsl(30, 5%, 45%)" }}
          />
          <Tooltip
            formatter={(value, _name, props) => [
              `${value} (${(props.payload as LikertData).percentage.toFixed(1)}%)`,
              "Responses",
            ]}
            contentStyle={{
              borderRadius: "10px",
              border: "1px solid hsla(35, 15%, 88%, 0.8)",
              boxShadow: "0 4px 12px hsla(30, 30%, 20%, 0.08)",
              fontSize: "13px",
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
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
