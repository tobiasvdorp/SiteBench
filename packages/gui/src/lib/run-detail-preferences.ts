const WIDTH_KEY = "sitebench.runDetail.width";

export const RUN_DETAIL_SHEET_DEFAULT_WIDTH = 576;
export const RUN_DETAIL_SHEET_MIN_WIDTH = 360;

export function clampRunDetailSheetWidth(width: number) {
  const max = Math.max(RUN_DETAIL_SHEET_MIN_WIDTH, window.innerWidth - 48);
  return Math.min(max, Math.max(RUN_DETAIL_SHEET_MIN_WIDTH, width));
}

export function getRunDetailSheetWidth() {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return RUN_DETAIL_SHEET_DEFAULT_WIDTH;
    const value = Number(raw);
    if (!Number.isFinite(value)) return RUN_DETAIL_SHEET_DEFAULT_WIDTH;
    return clampRunDetailSheetWidth(value);
  } catch {
    return RUN_DETAIL_SHEET_DEFAULT_WIDTH;
  }
}

export function setRunDetailSheetWidth(width: number) {
  localStorage.setItem(WIDTH_KEY, String(clampRunDetailSheetWidth(width)));
}
