import { normaliseSettings, resetSettings, type RuleSetting } from '../../shared/importance/settings'

const KEY = 'importance.rules.v1'

export function loadRuleSettings(): RuleSetting[] {
  try {
    return normaliseSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return resetSettings()
  }
}

export function saveRuleSettings(settings: readonly RuleSetting[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable: the rules still work for this session
  }
}
