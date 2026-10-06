/**
 * キャンバスのズーム・移動のジェスチャ (純粋な計算、#109 のあとの操作性の見直し)。
 * ポインタの位置 (ホスト内の CSS px) から、倍率と移動量を出す。DOM には触れない。
 */

export type Pt = { x: number; y: number };

export type Pinch = {
  /** 倍率 (前の 2 点間の距離に対する今の距離) */
  factor: number;
  /** 拡大の軸 (今の 2 点の中点) */
  anchor: Pt;
  /** 中点の移動 (移動量) */
  pan: Pt;
};

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 2 本指: 前の位置 (a0, b0) から今の位置 (a1, b1) への変化。
 * 指が重なって距離 0 のときは倍率 1 とする
 */
export function pinch(a0: Pt, b0: Pt, a1: Pt, b1: Pt): Pinch {
  const d0 = dist(a0, b0);
  const d1 = dist(a1, b1);
  const m0 = mid(a0, b0);
  const m1 = mid(a1, b1);
  return {
    factor: d0 > 0 && d1 > 0 ? d1 / d0 : 1,
    anchor: m1,
    pan: { x: m1.x - m0.x, y: m1.y - m0.y },
  };
}

/** ホイール 1 回の倍率。deltaY が正 (手前に回す) で縮小。ピクセル単位の delta も行単位も同じ式で扱う */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  // deltaMode 1 = 行、2 = ページ。ピクセルに寄せる
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-px * 0.0025);
}

/** 1 本指 / ドラッグの移動量 */
export function dragPan(from: Pt, to: Pt): Pt {
  return { x: to.x - from.x, y: to.y - from.y };
}
