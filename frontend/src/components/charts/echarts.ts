/**
 * ECharts with only the modules WindDesk draws (modular imports keep the bundle small,
 * ARCHITECTURE §5). ECharts names its registration function `use`; it is aliased so it is not
 * mistaken for React's `use()` hook.
 */
import { BarChart, LineChart } from 'echarts/charts'
import {
  AriaComponent,
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use as registerModules, type ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

registerModules([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  DataZoomComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  AriaComponent,
  CanvasRenderer,
])

export { init, type ECharts }
