export interface MeterReading {
  kwhTotal: number;
  powerW: number;
  timestamp: Date;
}

export interface ChargerDriver {
  readonly deviceId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  getMeter(): Promise<MeterReading>;
  destroy(): void;
}
