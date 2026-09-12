export type ChartPoint = {
  x: number;
  y: number;
};

export type ResponseTimeChart = {
  linePath: string;
  areaPath: string;
  points: ChartPoint[];
};

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

export function createResponseTimeChart(
  responseTimes: number[],
  width = 400,
  height = 80,
  padding = 6,
): ResponseTimeChart {
  if (responseTimes.length === 0) {
    return { linePath: "", areaPath: "", points: [] };
  }

  const minimum = Math.min(...responseTimes);
  const maximum = Math.max(...responseTimes);
  const range = maximum - minimum;
  const drawableHeight = height - padding * 2;
  const points = responseTimes.map((responseTime, index) => {
    const x =
      responseTimes.length === 1
        ? width / 2
        : (index / (responseTimes.length - 1)) * width;
    const y =
      range === 0
        ? height / 2
        : padding + ((maximum - responseTime) / range) * drawableHeight;

    return {
      x: roundCoordinate(x),
      y: roundCoordinate(y),
    };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (!firstPoint || !lastPoint) {
    return { linePath: "", areaPath: "", points: [] };
  }

  return {
    linePath,
    areaPath: `${linePath} L${lastPoint.x} ${height} L${firstPoint.x} ${height} Z`,
    points,
  };
}
