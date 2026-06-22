export interface SliderDomain {
  min: number
  max: number
  step: number
}

export interface SliderTrackGeometry {
  left: number
  width: number
}

export function clampSliderValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function getSliderPercentage(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0
  }

  return ((clampSliderValue(value, min, max) - min) / (max - min)) * 100
}

export function valueFromSliderClientX(
  clientX: number,
  geometry: SliderTrackGeometry,
  domain: SliderDomain
): number {
  const { min, max, step } = domain
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(geometry.left) ||
    !Number.isFinite(geometry.width) ||
    geometry.width <= 0 ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  ) {
    return min
  }

  const safeStep = Number.isFinite(step) && step > 0 ? step : 1
  const percent = Math.max(0, Math.min(1, (clientX - geometry.left) / geometry.width))
  const rawValue = min + percent * (max - min)
  const steppedValue = Math.round(rawValue / safeStep) * safeStep

  return clampSliderValue(steppedValue, min, max)
}

export function updateRangeSliderValue({
  currentValue,
  nextThumbValue,
  thumbIndex,
  min,
  max,
  minDistance,
}: {
  currentValue: [number, number]
  nextThumbValue: number
  thumbIndex: 0 | 1
  min: number
  max: number
  minDistance: number
}): [number, number] {
  const safeDistance = Number.isFinite(minDistance) ? Math.max(0, minDistance) : 0
  const nextValue: [number, number] = [...currentValue]

  if (thumbIndex === 0) {
    nextValue[0] = Math.min(nextThumbValue, currentValue[1] - safeDistance)
    nextValue[0] = clampSliderValue(nextValue[0], min, max)
  } else {
    nextValue[1] = Math.max(nextThumbValue, currentValue[0] + safeDistance)
    nextValue[1] = clampSliderValue(nextValue[1], min, max)
  }

  return nextValue
}
