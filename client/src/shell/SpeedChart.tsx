import { useMemo, useState, type PointerEvent } from 'react'
import { formatSpeed } from '../lib/format-stats'
import { chartGeometry, nearestPoint } from './statsView'
import styles from './AgentDialogs.module.css'

const WIDTH = 600
const HEIGHT = 96

interface Props {
  title: string
  xLabel: string
  data: Array<{ x: number; y: number }>
}

/** One series on its own scale, with a crosshair and the value under the pointer. */
export function SpeedChart({ title, xLabel, data }: Props) {
  const { points, path, maxY } = useMemo(() => chartGeometry(data, WIDTH, HEIGHT), [data])
  const [hover, setHover] = useState<number | null>(null)
  const active = hover === null ? undefined : points[hover]

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setHover(nearestPoint(points, ((event.clientX - box.left) / box.width) * WIDTH))
  }

  return (
    <figure className={styles.chart} data-testid="stats-chart">
      <figcaption>
        <span>{title}</span>
        <span className={styles.chartUnit}>{`t/s · ${xLabel}`}</span>
      </figcaption>
      <div className={styles.plotRow}>
        <div className={styles.yAxis}>
          <span>{formatSpeed(maxY)}</span>
          <span>{formatSpeed(maxY / 2)}</span>
          <span>{formatSpeed(0)}</span>
        </div>
        <div className={styles.plot} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
            {[0, HEIGHT / 2, HEIGHT].map((y) => (
              <line key={y} className={styles.grid} x1={0} x2={WIDTH} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
            ))}
            <path className={styles.line} d={path} vectorEffect="non-scaling-stroke" />
          </svg>
          {active && (
            <>
              <span className={styles.crosshair} style={{ left: `${(active.left / WIDTH) * 100}%` }} />
              <span
                className={styles.marker}
                style={{ left: `${(active.left / WIDTH) * 100}%`, top: `${(active.top / HEIGHT) * 100}%` }}
              />
              <span
                className={styles.tooltip}
                data-flip={active.left > WIDTH / 2 || undefined}
                style={{ left: `${(active.left / WIDTH) * 100}%` }}
              >
                {`${formatSpeed(active.y)} t/s · ${active.x}`}
              </span>
            </>
          )}
        </div>
      </div>
    </figure>
  )
}
