export type StartAppAction =
  | { type: "duel"; duelId: string }
  | { type: "referral"; referralCode: string }
  | { type: "unknown"; value: string }
  | { type: "none" };

const START_PARAM_MAX_LENGTH = 128;
const START_PARAM_PATTERN = /^[A-Za-z0-9_-]+$/;

export function normalizeStartAppParam(value: string | null | undefined) {
  const startParam = value?.trim();
  if (!startParam || startParam.length > START_PARAM_MAX_LENGTH) return "";
  if (!START_PARAM_PATTERN.test(startParam)) return "";

  return startParam;
}

export function parseStartAppParam(value: string | null | undefined): StartAppAction {
  const startParam = normalizeStartAppParam(value);
  if (!startParam) return { type: "none" };

  if (startParam.startsWith("duel_") && startParam.length > "duel_".length) {
    return { type: "duel", duelId: startParam };
  }

  if (startParam.startsWith("ref_") && startParam.length > "ref_".length) {
    return { type: "referral", referralCode: startParam.slice(4) };
  }

  return { type: "unknown", value: startParam };
}
