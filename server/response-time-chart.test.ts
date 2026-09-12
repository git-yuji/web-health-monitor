import assert from "node:assert/strict";
import test from "node:test";
import { createResponseTimeChart } from "../src/response-time-chart.js";

test("履歴がない場合は空のグラフを返す", () => {
  assert.deepEqual(createResponseTimeChart([]), {
    linePath: "",
    areaPath: "",
    points: [],
  });
});

test("1件の応答時間をグラフ中央に配置する", () => {
  const chart = createResponseTimeChart([120]);

  assert.deepEqual(chart.points, [{ x: 200, y: 40 }]);
  assert.equal(chart.linePath, "M200 40");
});

test("複数の応答時間から折れ線と塗り領域を生成する", () => {
  const chart = createResponseTimeChart([100, 150, 200]);

  assert.deepEqual(chart.points, [
    { x: 0, y: 74 },
    { x: 200, y: 40 },
    { x: 400, y: 6 },
  ]);
  assert.equal(chart.linePath, "M0 74 L200 40 L400 6");
  assert.equal(chart.areaPath, "M0 74 L200 40 L400 6 L400 80 L0 80 Z");
});
