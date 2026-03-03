export interface Feature {
  status: string
  priority: string
}

export function getPipelineHealth(features: Feature[]) {
  let activeCount = 0
  let failedCount = 0
  let highPriorityFailed = 0

  for (const feature of features) {
    if (feature.status === 'failed') {
      failedCount += 1

      if (feature.priority === 'high') {
        highPriorityFailed += 1
      }
    } else if (feature.status !== 'created' && feature.status !== 'complete') {
      activeCount += 1
    }
  }

  return {
    total: features.length,
    activeCount,
    failedCount,
    highPriorityFailed,
  }
}
