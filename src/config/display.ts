/** 显示相关配置。修改后刷新页面即可生效。 */
export const display = {
  /** 基准分辨率（逻辑像素），渲染时按比例缩放到窗口 */
  baseWidth: 1280,
  baseHeight: 720,
  /** 目标帧率，Phaser 使用 requestAnimationFrame，此值用于性能监控阈值 */
  targetFps: 60,
  /** 背景色 */
  backgroundColor: '#0b0b10',
} as const;
