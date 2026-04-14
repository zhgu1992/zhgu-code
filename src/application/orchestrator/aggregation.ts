import {
  aggregateByAllRequired,
  aggregateByFirstSuccess,
  type AggregateInput,
  type AggregationOutcome,
} from './aggregation-strategies.js'

export function aggregateTaskResults(input: AggregateInput): AggregationOutcome {
  if (input.strategy === 'first_success') {
    return aggregateByFirstSuccess(input.tasks)
  }
  return aggregateByAllRequired(input.tasks)
}
